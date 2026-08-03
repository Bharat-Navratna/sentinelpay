import { randomUUID } from "node:crypto";

import { parsePoundsToPence } from "../domain/money";
import { evaluatePaymentRisk } from "../domain/payment-risk";
import { assertPaymentTransition } from "../domain/payment-state-machine";
import { PaymentApplicationError } from "./payment-application-errors";
import type { PaymentRepository } from "./payment-repository";
import {
  PAYMENT_INTERVENTION_COPY_VERSION,
  type CanonicalPaymentPayload,
  type NewPaymentWorkflow,
  type PaymentEventRecord,
  type PaymentWorkflow,
} from "./payment-types";

const MAX_REFERENCE_LENGTH = 140;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreatePaymentInput = {
  idempotencyKey: string;
  beneficiaryId: string;
  amount: string;
  reference: string;
};

export type PaymentServiceDependencies = {
  repository: PaymentRepository;
  generateId?: () => string;
  now?: () => Date;
};

function canonicalPayloadMatches(
  left: CanonicalPaymentPayload,
  right: CanonicalPaymentPayload,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.beneficiaryId === right.beneficiaryId &&
    left.amountMinor === right.amountMinor &&
    left.currencyCode === right.currencyCode &&
    left.reference === right.reference
  );
}

function eventTimestamp(baseTime: Date, offsetMilliseconds: number): Date {
  return new Date(baseTime.getTime() + offsetMilliseconds);
}

function requireValidReference(reference: string): string {
  const trimmedReference = reference.trim();

  if (
    trimmedReference.length === 0 ||
    trimmedReference.length > MAX_REFERENCE_LENGTH
  ) {
    throw new PaymentApplicationError("INVALID_PAYMENT_REFERENCE");
  }

  return trimmedReference;
}

function requireValidIdempotencyKey(idempotencyKey: string): void {
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new PaymentApplicationError("INVALID_IDEMPOTENCY_KEY");
  }
}

function buildCreationEvents(
  paymentId: string,
  assessmentId: string,
  interventionId: string | null,
  decision: "ALLOW" | "INTERVENE",
  ruleVersion: string,
  baseTime: Date,
  generateId: () => string,
): PaymentEventRecord[] {
  const sharedMetadata = {
    riskAssessmentId: assessmentId,
    ruleVersion,
    simulation: true,
  };
  const events: PaymentEventRecord[] = [
    {
      id: generateId(),
      paymentId,
      eventType: "PAYMENT_CREATED",
      fromStatus: null,
      toStatus: "CREATED",
      metadata: { simulation: true },
      occurredAt: eventTimestamp(baseTime, 0),
    },
    {
      id: generateId(),
      paymentId,
      eventType: "RISK_REVIEW_STARTED",
      fromStatus: "CREATED",
      toStatus: "RISK_REVIEW",
      metadata: sharedMetadata,
      occurredAt: eventTimestamp(baseTime, 1),
    },
  ];

  if (decision === "ALLOW") {
    events.push(
      {
        id: generateId(),
        paymentId,
        eventType: "PAYMENT_AUTHORISED",
        fromStatus: "RISK_REVIEW",
        toStatus: "AUTHORISED",
        metadata: sharedMetadata,
        occurredAt: eventTimestamp(baseTime, 2),
      },
      {
        id: generateId(),
        paymentId,
        eventType: "PAYMENT_SETTLED",
        fromStatus: "AUTHORISED",
        toStatus: "SETTLED",
        metadata: { simulation: true },
        occurredAt: eventTimestamp(baseTime, 3),
      },
    );
  } else {
    events.push({
      id: generateId(),
      paymentId,
      eventType: "CUSTOMER_INTERVENTION_REQUIRED",
      fromStatus: "RISK_REVIEW",
      toStatus: "CUSTOMER_INTERVENTION",
      metadata: {
        ...sharedMetadata,
        interventionId,
      },
      occurredAt: eventTimestamp(baseTime, 2),
    });
  }

  return events;
}

export class PaymentCreationService {
  private readonly repository: PaymentRepository;
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor({ repository, generateId = randomUUID, now = () => new Date() }: PaymentServiceDependencies) {
    this.repository = repository;
    this.generateId = generateId;
    this.now = now;
  }

  async create(input: CreatePaymentInput): Promise<PaymentWorkflow> {
    requireValidIdempotencyKey(input.idempotencyKey);

    const context = await this.repository.loadPaymentContext();

    if (!context) {
      throw new PaymentApplicationError("PAYMENT_CONTEXT_NOT_FOUND");
    }

    if (context.currencyCode !== "GBP") {
      throw new PaymentApplicationError("UNSUPPORTED_PAYMENT_CURRENCY");
    }

    const beneficiary = await this.repository.findBeneficiaryById(
      input.beneficiaryId,
    );

    if (!beneficiary) {
      throw new PaymentApplicationError("BENEFICIARY_NOT_FOUND");
    }

    if (beneficiary.customerId !== context.customerId) {
      throw new PaymentApplicationError("BENEFICIARY_NOT_OWNED");
    }

    const amountMinor = parsePoundsToPence(input.amount);
    const reference = requireValidReference(input.reference);
    const canonicalPayload: CanonicalPaymentPayload = {
      accountId: context.accountId,
      beneficiaryId: beneficiary.id,
      amountMinor,
      currencyCode: context.currencyCode,
      reference,
    };
    const existing = await this.repository.findPaymentWorkflowByIdempotencyKey(
      input.idempotencyKey,
    );

    if (existing) {
      if (canonicalPayloadMatches(existing.payment, canonicalPayload)) {
        return existing;
      }

      throw new PaymentApplicationError("PAYMENT_IDEMPOTENCY_CONFLICT");
    }

    const [previousSettledAccountAmountsMinor, previousSettledPaymentCountToBeneficiary] =
      await Promise.all([
        this.repository.loadPreviousSettledAccountAmounts(context.accountId),
        this.repository.countPreviousSettledPaymentsToBeneficiary(
          context.accountId,
          beneficiary.id,
        ),
      ]);
    const risk = evaluatePaymentRisk({
      amountMinor,
      reference,
      previousSettledAccountAmountsMinor,
      previousSettledPaymentCountToBeneficiary,
    });

    assertPaymentTransition("CREATED", "RISK_REVIEW");
    if (risk.decision === "ALLOW") {
      assertPaymentTransition("RISK_REVIEW", "AUTHORISED");
      assertPaymentTransition("AUTHORISED", "SETTLED");
    } else {
      assertPaymentTransition("RISK_REVIEW", "CUSTOMER_INTERVENTION");
    }

    const baseTime = this.now();
    const paymentId = this.generateId();
    const assessmentId = this.generateId();
    const interventionId =
      risk.decision === "INTERVENE" ? this.generateId() : null;
    const events = buildCreationEvents(
      paymentId,
      assessmentId,
      interventionId,
      risk.decision,
      risk.ruleVersion,
      baseTime,
      this.generateId,
    );
    const finalEventTime = events.at(-1)?.occurredAt ?? baseTime;
    const workflow: NewPaymentWorkflow = {
      payment: {
        id: paymentId,
        ...canonicalPayload,
        idempotencyKey: input.idempotencyKey,
        status:
          risk.decision === "ALLOW" ? "SETTLED" : "CUSTOMER_INTERVENTION",
        createdAt: baseTime,
        updatedAt: finalEventTime,
      },
      riskAssessment: {
        id: assessmentId,
        paymentId,
        decision: risk.decision,
        score: risk.score,
        reasonCodes: [...risk.reasonCodes],
        facts: {
          ...risk.internalFacts,
          matchedInvestmentTerms: [...risk.internalFacts.matchedInvestmentTerms],
        },
        ruleVersion: risk.ruleVersion,
        evaluatedAt: eventTimestamp(baseTime, 1),
      },
      intervention:
        interventionId === null
          ? null
          : {
              id: interventionId,
              paymentId,
              status: "PENDING",
              copyVersion: PAYMENT_INTERVENTION_COPY_VERSION,
              acknowledgementConfirmed: false,
              createdAt: eventTimestamp(baseTime, 2),
              resolvedAt: null,
            },
      events,
    };
    const persistenceResult =
      await this.repository.createPaymentWorkflowAtomically(workflow);

    if (persistenceResult.kind === "CREATED") {
      return workflow;
    }

    const winningWorkflow =
      await this.repository.findPaymentWorkflowByIdempotencyKey(
        input.idempotencyKey,
      );

    if (!winningWorkflow) {
      throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
    }

    if (canonicalPayloadMatches(winningWorkflow.payment, canonicalPayload)) {
      return winningWorkflow;
    }

    throw new PaymentApplicationError("PAYMENT_IDEMPOTENCY_CONFLICT");
  }
}
