import { describe, expect, it } from "vitest";

import { PaymentDomainError } from "../domain/payment-errors";
import { PaymentApplicationError } from "./payment-application-errors";
import { PaymentCreationService } from "./create-payment";
import { PaymentInterventionService } from "./resolve-payment-intervention";
import { InMemoryPaymentRepository } from "./testing/in-memory-payment-repository";
import type { PaymentWorkflow } from "./payment-types";

const DANCE_STUDIO_ID = "30000000-0000-4000-8000-000000000001";
const APEX_CAPITAL_ID = "30000000-0000-4000-8000-000000000002";
const ORDINARY_KEY = "70000000-0000-4000-8000-000000000001";
const SUSPICIOUS_KEY = "70000000-0000-4000-8000-000000000002";
const BASE_TIME = new Date("2026-08-03T10:00:00.000Z");

function createIdGenerator(): () => string {
  let value = 1;

  return () => {
    const suffix = value.toString(16).padStart(12, "0");
    value += 1;
    return `80000000-0000-4000-8000-${suffix}`;
  };
}

function createServices(repository = new InMemoryPaymentRepository()) {
  const dependencies = {
    repository,
    generateId: createIdGenerator(),
    now: () => new Date(BASE_TIME),
  };

  return {
    repository,
    creation: new PaymentCreationService(dependencies),
    intervention: new PaymentInterventionService(dependencies),
  };
}

async function createOrdinaryPayment(
  creation: PaymentCreationService,
  overrides: Partial<Parameters<PaymentCreationService["create"]>[0]> = {},
) {
  return creation.create({
    idempotencyKey: ORDINARY_KEY,
    beneficiaryId: DANCE_STUDIO_ID,
    amount: "65.00",
    reference: " Dance class ",
    ...overrides,
  });
}

async function createSuspiciousPayment(
  creation: PaymentCreationService,
  overrides: Partial<Parameters<PaymentCreationService["create"]>[0]> = {},
) {
  return creation.create({
    idempotencyKey: SUSPICIOUS_KEY,
    beneficiaryId: APEX_CAPITAL_ID,
    amount: "4000.50",
    reference: "Investment opportunity",
    ...overrides,
  });
}

function expectApplicationError(
  operation: Promise<unknown>,
  code: PaymentApplicationError["code"],
) {
  return expect(operation).rejects.toMatchObject({ code });
}

describe("PaymentCreationService", () => {
  it("creates an ordinary payment for a known beneficiary", async () => {
    const { creation } = createServices();
    const workflow = await createOrdinaryPayment(creation);

    expect(workflow.payment).toMatchObject({
      beneficiaryId: DANCE_STUDIO_ID,
      amountMinor: 6_500,
      currencyCode: "GBP",
      reference: "Dance class",
    });
  });

  it("creates a suspicious payment", async () => {
    const { creation } = createServices();
    const workflow = await createSuspiciousPayment(creation);

    expect(workflow.riskAssessment).toMatchObject({
      decision: "INTERVENE",
      score: 100,
      ruleVersion: "deterministic-v1",
    });
  });

  it("finishes an allowed payment in SETTLED", async () => {
    const { creation } = createServices();
    expect((await createOrdinaryPayment(creation)).payment.status).toBe("SETTLED");
  });

  it("finishes a flagged payment in CUSTOMER_INTERVENTION", async () => {
    const { creation } = createServices();
    expect((await createSuspiciousPayment(creation)).payment.status).toBe(
      "CUSTOMER_INTERVENTION",
    );
  });

  it("records four ordered ALLOW events one millisecond apart", async () => {
    const { creation } = createServices();
    const workflow = await createOrdinaryPayment(creation);

    expect(workflow.events.map((event) => event.eventType)).toEqual([
      "PAYMENT_CREATED",
      "RISK_REVIEW_STARTED",
      "PAYMENT_AUTHORISED",
      "PAYMENT_SETTLED",
    ]);
    expect(workflow.events.map((event) => event.occurredAt.getTime())).toEqual([
      BASE_TIME.getTime(),
      BASE_TIME.getTime() + 1,
      BASE_TIME.getTime() + 2,
      BASE_TIME.getTime() + 3,
    ]);
  });

  it("records three ordered INTERVENE events", async () => {
    const { creation } = createServices();
    const workflow = await createSuspiciousPayment(creation);

    expect(workflow.events.map((event) => event.eventType)).toEqual([
      "PAYMENT_CREATED",
      "RISK_REVIEW_STARTED",
      "CUSTOMER_INTERVENTION_REQUIRED",
    ]);
  });

  it("persists exactly one assessment for every payment", async () => {
    const { creation, repository } = createServices();
    const created = await createOrdinaryPayment(creation);
    const loaded = await repository.loadPaymentWorkflow(created.payment.id);

    expect(loaded?.riskAssessment.paymentId).toBe(created.payment.id);
  });

  it("creates an intervention only for an intervened payment", async () => {
    const { creation } = createServices();
    const allowed = await createOrdinaryPayment(creation);
    const intervened = await createSuspiciousPayment(creation);

    expect(allowed.intervention).toBeNull();
    expect(intervened.intervention).toMatchObject({
      status: "PENDING",
      copyVersion: "payment-warning-v1",
      acknowledgementConfirmed: false,
      resolvedAt: null,
    });
  });

  it("returns the existing workflow for the same key and canonical payload", async () => {
    const { creation } = createServices();
    const first = await createOrdinaryPayment(creation);
    const second = await createOrdinaryPayment(creation, {
      reference: "Dance class",
    });

    expect(second.payment.id).toBe(first.payment.id);
  });

  it("does not duplicate children on a same-key retry", async () => {
    const { creation, repository } = createServices();
    const first = await createSuspiciousPayment(creation);

    await createSuspiciousPayment(creation);
    const loaded = await repository.loadPaymentWorkflow(first.payment.id);

    expect(loaded?.events).toHaveLength(3);
    expect(loaded?.riskAssessment.id).toBe(first.riskAssessment.id);
    expect(loaded?.intervention?.id).toBe(first.intervention?.id);
  });

  it("returns the winning workflow after a same-payload create race", async () => {
    const winnerServices = createServices();
    const winner = await createOrdinaryPayment(winnerServices.creation);
    const raceRepository = new InMemoryPaymentRepository({
      workflowToWinCreateRace: winner,
    });
    const { creation } = createServices(raceRepository);

    const result = await createOrdinaryPayment(creation);

    expect(result.payment.id).toBe(winner.payment.id);
    expect(result.events).toHaveLength(4);
  });

  it("rejects the winning workflow after a different-payload create race", async () => {
    const winnerServices = createServices();
    const winner = await createOrdinaryPayment(winnerServices.creation);
    const raceRepository = new InMemoryPaymentRepository({
      workflowToWinCreateRace: winner,
    });
    const { creation } = createServices(raceRepository);

    await expectApplicationError(
      createOrdinaryPayment(creation, { amount: "66.00" }),
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects same-key reuse with a different beneficiary", async () => {
    const { creation } = createServices();
    await createOrdinaryPayment(creation);

    await expectApplicationError(
      createOrdinaryPayment(creation, { beneficiaryId: APEX_CAPITAL_ID }),
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects same-key reuse with a different amount", async () => {
    const { creation } = createServices();
    await createOrdinaryPayment(creation);

    await expectApplicationError(
      createOrdinaryPayment(creation, { amount: "66.00" }),
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects same-key reuse with a different trimmed reference", async () => {
    const { creation } = createServices();
    await createOrdinaryPayment(creation);

    await expectApplicationError(
      createOrdinaryPayment(creation, { reference: "Different reference" }),
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects a beneficiary owned by another customer", async () => {
    const repository = new InMemoryPaymentRepository({
      beneficiaries: [{ id: DANCE_STUDIO_ID, customerId: "90000000-0000-4000-8000-000000000001" }],
    });
    const { creation } = createServices(repository);

    await expectApplicationError(
      createOrdinaryPayment(creation),
      "BENEFICIARY_NOT_OWNED",
    );
  });

  it("rejects a missing beneficiary", async () => {
    const { creation } = createServices(
      new InMemoryPaymentRepository({ beneficiaries: [] }),
    );

    await expectApplicationError(
      createOrdinaryPayment(creation),
      "BENEFICIARY_NOT_FOUND",
    );
  });

  it("rejects missing customer and account context", async () => {
    const { creation } = createServices(
      new InMemoryPaymentRepository({ context: null }),
    );

    await expectApplicationError(
      createOrdinaryPayment(creation),
      "PAYMENT_CONTEXT_NOT_FOUND",
    );
  });

  it("preserves the existing domain error for an invalid amount", async () => {
    const { creation } = createServices();

    await expect(createOrdinaryPayment(creation, { amount: "65.999" })).rejects.toEqual(
      expect.objectContaining<Partial<PaymentDomainError>>({
        code: "INVALID_MONEY_AMOUNT",
      }),
    );
  });
});

describe("PaymentInterventionService", () => {
  async function setupSuspiciousPayment() {
    const services = createServices();
    const workflow = await createSuspiciousPayment(services.creation);
    return { ...services, workflow };
  }

  it("continues with explicit acknowledgement", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const resolved = await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CONTINUE",
      acknowledgementConfirmed: true,
    });

    expect(resolved.payment.status).toBe("SETTLED");
    expect(resolved.intervention).toMatchObject({
      status: "CONTINUED",
      acknowledgementConfirmed: true,
    });
  });

  it("rejects continuation without acknowledgement and performs no write", async () => {
    const { intervention, repository, workflow } = await setupSuspiciousPayment();

    await expectApplicationError(
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CONTINUE",
        acknowledgementConfirmed: false,
      }),
      "INTERVENTION_ACKNOWLEDGEMENT_REQUIRED",
    );
    expect((await repository.loadPaymentWorkflow(workflow.payment.id))?.payment.status).toBe(
      "CUSTOMER_INTERVENTION",
    );
  });

  it("cancels without acknowledgement", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const resolved = await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CANCEL",
      acknowledgementConfirmed: false,
    });

    expect(resolved.payment.status).toBe("CANCELLED");
    expect(resolved.intervention).toMatchObject({
      status: "CANCELLED",
      acknowledgementConfirmed: false,
    });
  });

  it("records ordered continuation and settlement events", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const resolved = await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CONTINUE",
      acknowledgementConfirmed: true,
    });
    const resolutionEvents = resolved.events.slice(-2);

    expect(resolutionEvents.map((event) => event.eventType)).toEqual([
      "CUSTOMER_CONTINUED_PAYMENT",
      "PAYMENT_SETTLED",
    ]);
    expect(resolutionEvents[1]?.occurredAt.getTime()).toBe(
      (resolutionEvents[0]?.occurredAt.getTime() ?? 0) + 1,
    );
    const completeTimeline = resolved.events.map((event) =>
      event.occurredAt.getTime(),
    );
    expect(
      completeTimeline.every(
        (timestamp, index) => index === 0 || timestamp > completeTimeline[index - 1]!,
      ),
    ).toBe(true);
  });

  it("records one cancellation event", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const resolved = await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CANCEL",
      acknowledgementConfirmed: false,
    });

    expect(resolved.events.slice(-1).map((event) => event.eventType)).toEqual([
      "CUSTOMER_CANCELLED_PAYMENT",
    ]);
  });

  it("treats repeated identical continuation as idempotent", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const input = {
      paymentId: workflow.payment.id,
      decision: "CONTINUE" as const,
      acknowledgementConfirmed: true,
    };
    const first = await intervention.resolve(input);
    const second = await intervention.resolve(input);

    expect(second.payment.id).toBe(first.payment.id);
    expect(second.events).toHaveLength(5);
  });

  it("treats repeated identical cancellation as idempotent", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    const input = {
      paymentId: workflow.payment.id,
      decision: "CANCEL" as const,
      acknowledgementConfirmed: false,
    };
    const first = await intervention.resolve(input);
    const second = await intervention.resolve(input);

    expect(second.payment.id).toBe(first.payment.id);
    expect(second.events).toHaveLength(4);
  });

  it("rejects cancellation after continuation", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CONTINUE",
      acknowledgementConfirmed: true,
    });

    await expectApplicationError(
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CANCEL",
        acknowledgementConfirmed: false,
      }),
      "INTERVENTION_ALREADY_RESOLVED",
    );
  });

  it("rejects continuation after cancellation", async () => {
    const { intervention, workflow } = await setupSuspiciousPayment();
    await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CANCEL",
      acknowledgementConfirmed: false,
    });

    await expectApplicationError(
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CONTINUE",
        acknowledgementConfirmed: true,
      }),
      "INTERVENTION_ALREADY_RESOLVED",
    );
  });

  it("allows only one of two simultaneous opposite resolutions", async () => {
    const { intervention, repository, workflow } = await setupSuspiciousPayment();
    const outcomes = await Promise.allSettled([
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CONTINUE",
        acknowledgementConfirmed: true,
      }),
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CANCEL",
        acknowledgementConfirmed: false,
      }),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<PaymentWorkflow> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    const persisted = await repository.loadPaymentWorkflow(workflow.payment.id);
    const resolutionEventTypes = persisted?.events
      .map((event) => event.eventType)
      .filter(
        (eventType) =>
          eventType === "CUSTOMER_CONTINUED_PAYMENT" ||
          eventType === "CUSTOMER_CANCELLED_PAYMENT",
      );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      expect.objectContaining<Partial<PaymentApplicationError>>({
        code: "INTERVENTION_ALREADY_RESOLVED",
      }),
    );
    expect(resolutionEventTypes).toHaveLength(1);
    expect(
      persisted?.payment.status === "SETTLED" ||
        persisted?.payment.status === "CANCELLED",
    ).toBe(true);
  });

  it("rejects an invalid payment state", async () => {
    const original = await setupSuspiciousPayment();
    const invalidWorkflow: PaymentWorkflow = structuredClone(original.workflow);
    invalidWorkflow.payment.status = "AUTHORISED";
    const repository = new InMemoryPaymentRepository({ workflows: [invalidWorkflow] });
    const { intervention } = createServices(repository);

    await expectApplicationError(
      intervention.resolve({
        paymentId: invalidWorkflow.payment.id,
        decision: "CANCEL",
        acknowledgementConfirmed: false,
      }),
      "INVALID_INTERVENTION_STATE",
    );
  });

  it("rejects a missing intervention", async () => {
    const original = await setupSuspiciousPayment();
    const invalidWorkflow: PaymentWorkflow = structuredClone(original.workflow);
    invalidWorkflow.intervention = null;
    const repository = new InMemoryPaymentRepository({ workflows: [invalidWorkflow] });
    const { intervention } = createServices(repository);

    await expectApplicationError(
      intervention.resolve({
        paymentId: invalidWorkflow.payment.id,
        decision: "CANCEL",
        acknowledgementConfirmed: false,
      }),
      "INTERVENTION_NOT_FOUND",
    );
  });

  it("leaves a terminal payment unchanged after a conflicting resolution", async () => {
    const { intervention, repository, workflow } = await setupSuspiciousPayment();
    await intervention.resolve({
      paymentId: workflow.payment.id,
      decision: "CANCEL",
      acknowledgementConfirmed: false,
    });

    await expectApplicationError(
      intervention.resolve({
        paymentId: workflow.payment.id,
        decision: "CONTINUE",
        acknowledgementConfirmed: true,
      }),
      "INTERVENTION_ALREADY_RESOLVED",
    );
    const unchanged = await repository.loadPaymentWorkflow(workflow.payment.id);
    expect(unchanged?.payment.status).toBe("CANCELLED");
    expect(unchanged?.events).toHaveLength(4);
  });
});
