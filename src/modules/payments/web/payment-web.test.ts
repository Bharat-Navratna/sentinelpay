import { describe, expect, it } from "vitest";

import { PaymentApplicationError } from "../application/payment-application-errors";
import type { PaymentWorkflow } from "../application/payment-types";
import { PaymentDomainError } from "../domain/payment-errors";
import { mapPaymentWorkflowToCustomerView } from "./customer-payment-view";
import {
  mapInterventionSubmissionError,
  mapPaymentSubmissionError,
  parseInterventionFormData,
  parsePaymentFormData,
  selectPaymentCreationDestination,
  type PaymentFormValues,
} from "./payment-form";

const PAYMENT_ID = "40000000-0000-4000-8000-000000000001";
const IDEMPOTENCY_KEY = "70000000-0000-4000-8000-000000000001";
const BENEFICIARY_ID = "30000000-0000-4000-8000-000000000001";

function paymentFormData(
  overrides: Partial<Record<keyof PaymentFormValues, string>> = {},
): FormData {
  const values: PaymentFormValues = {
    idempotencyKey: IDEMPOTENCY_KEY,
    beneficiaryId: BENEFICIARY_ID,
    amount: "65.50",
    reference: " Dance class ",
    ...overrides,
  };
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }

  return formData;
}

function interventionFormData(
  decision: "CANCEL" | "CONTINUE",
  acknowledgementConfirmed = false,
): FormData {
  const formData = new FormData();
  formData.set("paymentId", PAYMENT_ID);
  formData.set("decision", decision);
  if (acknowledgementConfirmed) {
    formData.set("acknowledgementConfirmed", "true");
  }
  return formData;
}

function workflow(
  overrides: {
    paymentStatus?: PaymentWorkflow["payment"]["status"];
    interventionStatus?: NonNullable<PaymentWorkflow["intervention"]>["status"];
  } = {},
): PaymentWorkflow {
  const createdAt = new Date("2026-08-04T10:00:00.000Z");
  return {
    payment: {
      id: PAYMENT_ID,
      accountId: "20000000-0000-4000-8000-000000000001",
      beneficiaryId: BENEFICIARY_ID,
      amountMinor: 6_550,
      currencyCode: "GBP",
      reference: "Dance class",
      idempotencyKey: IDEMPOTENCY_KEY,
      status: overrides.paymentStatus ?? "CUSTOMER_INTERVENTION",
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 2),
    },
    riskAssessment: {
      id: "60000000-0000-4000-8000-000000000001",
      paymentId: PAYMENT_ID,
      decision: "INTERVENE",
      score: 75,
      reasonCodes: ["NEW_PAYEE", "INVESTMENT_SCAM_LANGUAGE"],
      facts: {
        previousSettledPaymentCount: 1,
        previousSettledPaymentCountToBeneficiary: 0,
        medianSettledAmountMinor: 6_500,
        amountOutlierThresholdMinor: 50_000,
        matchedInvestmentTerms: ["investment"],
      },
      ruleVersion: "deterministic-v1",
      evaluatedAt: new Date(createdAt.getTime() + 1),
    },
    intervention: {
      id: "61000000-0000-4000-8000-000000000001",
      paymentId: PAYMENT_ID,
      status: overrides.interventionStatus ?? "PENDING",
      copyVersion: "payment-warning-v1",
      acknowledgementConfirmed:
        overrides.interventionStatus === "CONTINUED",
      createdAt: new Date(createdAt.getTime() + 2),
      resolvedAt:
        overrides.interventionStatus &&
        overrides.interventionStatus !== "PENDING"
          ? new Date(createdAt.getTime() + 3)
          : null,
    },
    events: [
      {
        id: "50000000-0000-4000-8000-000000000003",
        paymentId: PAYMENT_ID,
        eventType: "CUSTOMER_INTERVENTION_REQUIRED",
        fromStatus: "RISK_REVIEW",
        toStatus: "CUSTOMER_INTERVENTION",
        metadata: { matchedTerms: ["investment"], threshold: 50_000 },
        occurredAt: new Date(createdAt.getTime() + 2),
      },
      {
        id: "50000000-0000-4000-8000-000000000001",
        paymentId: PAYMENT_ID,
        eventType: "PAYMENT_CREATED",
        fromStatus: null,
        toStatus: "CREATED",
        metadata: { internal: "not public" },
        occurredAt: createdAt,
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        paymentId: PAYMENT_ID,
        eventType: "RISK_REVIEW_STARTED",
        fromStatus: "CREATED",
        toStatus: "RISK_REVIEW",
        metadata: { score: 75 },
        occurredAt: new Date(createdAt.getTime() + 1),
      },
    ],
  };
}

describe("payment form boundary", () => {
  it("parses valid form data and trims the reference", () => {
    expect(parsePaymentFormData(paymentFormData())).toEqual({
      success: true,
      data: {
        idempotencyKey: IDEMPOTENCY_KEY,
        beneficiaryId: BENEFICIARY_ID,
        amount: "65.50",
        reference: "Dance class",
      },
    });
  });

  it("rejects an invalid UUID idempotency key", () => {
    const result = parsePaymentFormData(
      paymentFormData({ idempotencyKey: "not-a-uuid" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors.idempotencyKey).toBeTruthy();
    }
  });

  it("returns a beneficiary field error when the beneficiary is missing", () => {
    const result = parsePaymentFormData(paymentFormData({ beneficiaryId: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors.beneficiaryId).toBe("Choose a beneficiary.");
    }
  });

  it("maps the money domain error to a safe amount error", () => {
    const values = {
      idempotencyKey: IDEMPOTENCY_KEY,
      beneficiaryId: BENEFICIARY_ID,
      amount: "65.999",
      reference: "Dance class",
    };
    expect(
      mapPaymentSubmissionError(
        new PaymentDomainError("INVALID_MONEY_AMOUNT"),
        values,
      ).fieldErrors.amount,
    ).toContain("valid positive amount");
  });

  it("rejects a blank reference", () => {
    const result = parsePaymentFormData(paymentFormData({ reference: "   " }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors.reference).toBe("Enter a payment reference.");
    }
  });

  it("rejects an overly long reference", () => {
    const result = parsePaymentFormData(
      paymentFormData({ reference: "x".repeat(141) }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors.reference).toContain("140");
    }
  });

  it.each([
    ["PAYMENT_CONTEXT_NOT_FOUND", "account is unavailable"],
    ["BENEFICIARY_NOT_OWNED", "not available"],
    ["PAYMENT_IDEMPOTENCY_CONFLICT", "fresh payment form"],
    ["PAYMENT_PERSISTENCE_CONFLICT", "could not be recorded safely"],
  ] as const)("maps %s to a safe form error", (code, expectedText) => {
    const state = mapPaymentSubmissionError(
      new PaymentApplicationError(code),
      {
        idempotencyKey: IDEMPOTENCY_KEY,
        beneficiaryId: BENEFICIARY_ID,
        amount: "65.50",
        reference: "Dance class",
      },
    );
    expect(state.formError).toContain(expectedText);
  });

  it("does not expose an unexpected persistence error", () => {
    const unsafeMessage = "constraint payments_secret_idx failed";
    const state = mapPaymentSubmissionError(new Error(unsafeMessage), {
      idempotencyKey: IDEMPOTENCY_KEY,
      beneficiaryId: BENEFICIARY_ID,
      amount: "65.50",
      reference: "Dance class",
    });
    expect(state.formError).not.toContain(unsafeMessage);
    expect(JSON.stringify(state)).not.toContain("constraint");
  });

  it("selects safe fixed destinations from the persisted workflow", () => {
    expect(selectPaymentCreationDestination(workflow())).toBe(
      `/customer/payments/${PAYMENT_ID}/intervention`,
    );
    expect(
      selectPaymentCreationDestination(
        workflow({ paymentStatus: "SETTLED", interventionStatus: "CONTINUED" }),
      ),
    ).toBe(`/customer/payments/${PAYMENT_ID}`);
  });
});

describe("customer-safe payment mapping", () => {
  it("excludes risk score, facts, and raw reason details", () => {
    const view = mapPaymentWorkflowToCustomerView(workflow(), "London Dance Studio");
    const publicJson = JSON.stringify(view);

    expect(view).not.toHaveProperty("riskAssessment");
    expect(publicJson).not.toContain('"score"');
    expect(publicJson).not.toContain("amountOutlierThresholdMinor");
    expect(publicJson).not.toContain("NEW_PAYEE");
    expect(publicJson).not.toContain("investment");
  });

  it("sorts the timeline chronologically", () => {
    const view = mapPaymentWorkflowToCustomerView(workflow(), "London Dance Studio");
    expect(view.timeline.map((event) => event.label)).toEqual([
      "Payment created",
      "Risk review started",
      "Additional customer check required",
    ]);
  });

  it("maps a pending intervention to a customer action", () => {
    expect(
      mapPaymentWorkflowToCustomerView(workflow(), "London Dance Studio")
        .requiresCustomerAction,
    ).toBe(true);
  });

  it("maps a resolved intervention without exposing its internals", () => {
    const view = mapPaymentWorkflowToCustomerView(
      workflow({ paymentStatus: "CANCELLED", interventionStatus: "CANCELLED" }),
      "London Dance Studio",
    );
    expect(view).toMatchObject({
      statusLabel: "Cancelled",
      requiresCustomerAction: false,
    });
    expect(view).not.toHaveProperty("intervention");
  });

  it("does not expose raw event metadata", () => {
    const view = mapPaymentWorkflowToCustomerView(workflow(), "London Dance Studio");
    expect(JSON.stringify(view)).not.toContain("metadata");
    expect(JSON.stringify(view)).not.toContain("not public");
  });
});

describe("intervention form boundary", () => {
  it("requires acknowledgement to continue", () => {
    const result = parseInterventionFormData(
      interventionFormData("CONTINUE", false),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.acknowledgementError).toContain("paused and checked");
    }
  });

  it("allows cancellation without acknowledgement", () => {
    expect(parseInterventionFormData(interventionFormData("CANCEL"))).toEqual({
      success: true,
      data: {
        paymentId: PAYMENT_ID,
        decision: "CANCEL",
        acknowledgementConfirmed: false,
      },
    });
  });

  it("maps an already-resolved result safely", () => {
    const state = mapInterventionSubmissionError(
      new PaymentApplicationError("INTERVENTION_ALREADY_RESOLVED"),
    );
    expect(state.formError).toContain("already been resolved");
    expect(JSON.stringify(state)).not.toContain("CUSTOMER_INTERVENTION");
  });
});
