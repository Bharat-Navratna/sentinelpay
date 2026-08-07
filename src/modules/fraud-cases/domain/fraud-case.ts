import type { PaymentStatus } from "../../payments/domain/payment-state-machine";
import { FraudCaseDomainError } from "./fraud-case-errors";

export const fraudCaseStatuses = ["DRAFT", "SUBMITTED"] as const;

export type FraudCaseStatus = (typeof fraudCaseStatuses)[number];

export function isPaymentReportable(status: PaymentStatus): boolean {
  return status === "SETTLED";
}

export function assertPaymentReportable(status: PaymentStatus): void {
  if (!isPaymentReportable(status)) {
    throw new FraudCaseDomainError("PAYMENT_NOT_REPORTABLE");
  }
}
