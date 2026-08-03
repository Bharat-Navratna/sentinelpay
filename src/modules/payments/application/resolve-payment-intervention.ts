import { randomUUID } from "node:crypto";

import { assertPaymentTransition } from "../domain/payment-state-machine";
import { PaymentApplicationError } from "./payment-application-errors";
import type { PaymentRepository } from "./payment-repository";
import type {
  PaymentEventRecord,
  PaymentInterventionDecision,
  PaymentWorkflow,
} from "./payment-types";

export type ResolvePaymentInterventionInput = {
  paymentId: string;
  decision: PaymentInterventionDecision;
  acknowledgementConfirmed: boolean;
};

export type InterventionServiceDependencies = {
  repository: PaymentRepository;
  generateId?: () => string;
  now?: () => Date;
};

function isSameResolution(
  workflow: PaymentWorkflow,
  decision: PaymentInterventionDecision,
): boolean {
  return (
    (decision === "CANCEL" &&
      workflow.intervention?.status === "CANCELLED" &&
      workflow.payment.status === "CANCELLED") ||
    (decision === "CONTINUE" &&
      workflow.intervention?.status === "CONTINUED" &&
      workflow.payment.status === "SETTLED")
  );
}

function validateResolvableWorkflow(
  workflow: PaymentWorkflow,
  decision: PaymentInterventionDecision,
): PaymentWorkflow | null {
  const intervention = workflow.intervention;

  if (!intervention) {
    throw new PaymentApplicationError("INTERVENTION_NOT_FOUND");
  }

  if (intervention.status !== "PENDING") {
    if (isSameResolution(workflow, decision)) {
      return workflow;
    }

    throw new PaymentApplicationError("INTERVENTION_ALREADY_RESOLVED");
  }

  if (workflow.payment.status !== "CUSTOMER_INTERVENTION") {
    throw new PaymentApplicationError("INVALID_INTERVENTION_STATE");
  }

  return null;
}

export class PaymentInterventionService {
  private readonly repository: PaymentRepository;
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor({ repository, generateId = randomUUID, now = () => new Date() }: InterventionServiceDependencies) {
    this.repository = repository;
    this.generateId = generateId;
    this.now = now;
  }

  async resolve(
    input: ResolvePaymentInterventionInput,
  ): Promise<PaymentWorkflow> {
    if (input.decision === "CONTINUE" && !input.acknowledgementConfirmed) {
      throw new PaymentApplicationError(
        "INTERVENTION_ACKNOWLEDGEMENT_REQUIRED",
      );
    }

    const existing = await this.repository.loadPaymentWorkflow(input.paymentId);

    if (!existing) {
      throw new PaymentApplicationError("PAYMENT_NOT_FOUND");
    }

    const idempotentResult = validateResolvableWorkflow(existing, input.decision);
    if (idempotentResult) {
      return idempotentResult;
    }

    const latestEventTime = existing.events.reduce(
      (latest, event) => Math.max(latest, event.occurredAt.getTime()),
      existing.payment.createdAt.getTime(),
    );
    const requestedResolutionTime = this.now().getTime();
    const resolvedAt = new Date(
      Math.max(requestedResolutionTime, latestEventTime + 1),
    );
    const interventionId = existing.intervention?.id;

    if (!interventionId) {
      throw new PaymentApplicationError("INTERVENTION_NOT_FOUND");
    }

    const events: PaymentEventRecord[] = [];

    if (input.decision === "CANCEL") {
      assertPaymentTransition("CUSTOMER_INTERVENTION", "CANCELLED");
      events.push({
        id: this.generateId(),
        paymentId: input.paymentId,
        eventType: "CUSTOMER_CANCELLED_PAYMENT",
        fromStatus: "CUSTOMER_INTERVENTION",
        toStatus: "CANCELLED",
        metadata: { interventionId, simulation: true },
        occurredAt: resolvedAt,
      });
    } else {
      assertPaymentTransition("CUSTOMER_INTERVENTION", "AUTHORISED");
      assertPaymentTransition("AUTHORISED", "SETTLED");
      events.push(
        {
          id: this.generateId(),
          paymentId: input.paymentId,
          eventType: "CUSTOMER_CONTINUED_PAYMENT",
          fromStatus: "CUSTOMER_INTERVENTION",
          toStatus: "AUTHORISED",
          metadata: { interventionId, simulation: true },
          occurredAt: resolvedAt,
        },
        {
          id: this.generateId(),
          paymentId: input.paymentId,
          eventType: "PAYMENT_SETTLED",
          fromStatus: "AUTHORISED",
          toStatus: "SETTLED",
          metadata: { simulation: true },
          occurredAt: new Date(resolvedAt.getTime() + 1),
        },
      );
    }

    const result = await this.repository.resolvePendingInterventionAtomically({
      paymentId: input.paymentId,
      decision: input.decision,
      acknowledgementConfirmed:
        input.decision === "CONTINUE" && input.acknowledgementConfirmed,
      resolvedAt,
      updatedAt: events.at(-1)?.occurredAt ?? resolvedAt,
      events,
    });
    const current = await this.repository.loadPaymentWorkflow(input.paymentId);

    if (!current) {
      throw new PaymentApplicationError("PAYMENT_NOT_FOUND");
    }

    if (result.kind === "RESOLVED" || isSameResolution(current, input.decision)) {
      return current;
    }

    validateResolvableWorkflow(current, input.decision);
    throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
  }
}
