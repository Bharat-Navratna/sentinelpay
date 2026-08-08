import { describe, expect, it } from "vitest";

import { paymentStatuses } from "../../payments/domain/payment-state-machine";
import { FraudCaseDomainError } from "./fraud-case-errors";
import {
  assertPaymentReportable,
  isPaymentReportable,
} from "./fraud-case";
import {
  assertFraudCaseTransition,
  canTransitionFraudCase,
  isTerminalFraudCaseStatus,
} from "./fraud-case-state-machine";

describe("fraud case payment eligibility", () => {
  it("allows a settled simulated payment", () => {
    expect(isPaymentReportable("SETTLED")).toBe(true);
    expect(() => assertPaymentReportable("SETTLED")).not.toThrow();
  });

  it.each(paymentStatuses.filter((status) => status !== "SETTLED"))(
    "rejects a %s payment",
    (status) => {
      expect(isPaymentReportable(status)).toBe(false);
      expect(() => assertPaymentReportable(status)).toThrowError(
        expect.objectContaining({ code: "PAYMENT_NOT_REPORTABLE" }),
      );
    },
  );
});

describe("fraud case state machine", () => {
  it("permits DRAFT to become SUBMITTED", () => {
    expect(canTransitionFraudCase("DRAFT", "SUBMITTED")).toBe(true);
    expect(() =>
      assertFraudCaseTransition("DRAFT", "SUBMITTED"),
    ).not.toThrow();
  });

  it("detects SUBMITTED as terminal", () => {
    expect(isTerminalFraudCaseStatus("SUBMITTED")).toBe(true);
    expect(isTerminalFraudCaseStatus("DRAFT")).toBe(false);
  });

  it("rejects a repeated submission transition", () => {
    expect(canTransitionFraudCase("SUBMITTED", "SUBMITTED")).toBe(false);
  });

  it("rejects a backward transition", () => {
    expect(canTransitionFraudCase("SUBMITTED", "DRAFT")).toBe(false);
  });

  it("rejects a no-op draft transition with the stable typed error", () => {
    expect(() => assertFraudCaseTransition("DRAFT", "DRAFT")).toThrowError(
      new FraudCaseDomainError("INVALID_FRAUD_CASE_TRANSITION"),
    );
  });
});
