import { FraudCaseDomainError } from "./fraud-case-errors";
import type { FraudCaseStatus } from "./fraud-case";

const allowedTransitions = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: [],
} as const satisfies Record<FraudCaseStatus, readonly FraudCaseStatus[]>;

export function canTransitionFraudCase(
  fromStatus: FraudCaseStatus,
  toStatus: FraudCaseStatus,
): boolean {
  const permitted: readonly FraudCaseStatus[] = allowedTransitions[fromStatus];
  return permitted.includes(toStatus);
}

export function assertFraudCaseTransition(
  fromStatus: FraudCaseStatus,
  toStatus: FraudCaseStatus,
): void {
  if (!canTransitionFraudCase(fromStatus, toStatus)) {
    throw new FraudCaseDomainError("INVALID_FRAUD_CASE_TRANSITION");
  }
}

export function isTerminalFraudCaseStatus(
  status: FraudCaseStatus,
): boolean {
  return status === "SUBMITTED";
}
