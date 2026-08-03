import { describe, expect, it } from "vitest";

import { PaymentDomainError } from "./payment-errors";
import {
  assertPaymentTransition,
  canTransitionPayment,
  isTerminalPaymentStatus,
  paymentStatuses,
  type PaymentStatus,
} from "./payment-state-machine";

const permittedTransitions: ReadonlyArray<readonly [PaymentStatus, PaymentStatus]> = [
  ["CREATED", "RISK_REVIEW"],
  ["RISK_REVIEW", "CUSTOMER_INTERVENTION"],
  ["RISK_REVIEW", "AUTHORISED"],
  ["RISK_REVIEW", "REJECTED"],
  ["CUSTOMER_INTERVENTION", "AUTHORISED"],
  ["CUSTOMER_INTERVENTION", "CANCELLED"],
  ["AUTHORISED", "SETTLED"],
];

describe("payment state machine", () => {
  it.each(permittedTransitions)("permits %s to become %s", (from, to) => {
    expect(canTransitionPayment(from, to)).toBe(true);
    expect(() => assertPaymentTransition(from, to)).not.toThrow();
  });

  it.each([
    ["CREATED", "SETTLED"],
    ["CREATED", "AUTHORISED"],
    ["CUSTOMER_INTERVENTION", "RISK_REVIEW"],
    ["AUTHORISED", "CANCELLED"],
    ["RISK_REVIEW", "CREATED"],
  ] as const)("forbids %s from becoming %s", (from, to) => {
    expect(canTransitionPayment(from, to)).toBe(false);
  });

  it.each(["SETTLED", "CANCELLED", "REJECTED"] as const)(
    "detects terminal status %s",
    (status) => {
      expect(isTerminalPaymentStatus(status)).toBe(true);
    },
  );

  it.each([
    "CREATED",
    "RISK_REVIEW",
    "CUSTOMER_INTERVENTION",
    "AUTHORISED",
  ] as const)("detects non-terminal status %s", (status) => {
    expect(isTerminalPaymentStatus(status)).toBe(false);
  });

  it.each(["SETTLED", "CANCELLED", "REJECTED"] as const)(
    "does not permit a transition out of %s",
    (terminalStatus) => {
      for (const candidateStatus of paymentStatuses) {
        expect(canTransitionPayment(terminalStatus, candidateStatus)).toBe(false);
      }
    },
  );

  it("throws the stable domain error for a forbidden transition", () => {
    expect(() => assertPaymentTransition("CREATED", "SETTLED")).toThrowError(
      expect.objectContaining<Partial<PaymentDomainError>>({
        code: "INVALID_PAYMENT_TRANSITION",
      }),
    );
  });
});
