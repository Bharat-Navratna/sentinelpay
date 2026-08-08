import type { FraudCaseStatus } from "../../fraud-cases/domain/fraud-case";
import { EvidenceDomainError } from "./evidence-errors";
import type { EvidenceStatus } from "./evidence";

const allowedTransitions = {
  AWAITING_UPLOAD: ["VALIDATING", "REMOVED"],
  VALIDATING: ["READY", "REJECTED"],
  READY: ["REMOVED"],
  REJECTED: ["REMOVED"],
  REMOVED: [],
} as const satisfies Record<EvidenceStatus, readonly EvidenceStatus[]>;

export function canTransitionEvidence(
  fromStatus: EvidenceStatus,
  toStatus: EvidenceStatus,
): boolean {
  const permitted: readonly EvidenceStatus[] = allowedTransitions[fromStatus];
  return permitted.includes(toStatus);
}

export function assertEvidenceTransition(
  fromStatus: EvidenceStatus,
  toStatus: EvidenceStatus,
): void {
  if (!canTransitionEvidence(fromStatus, toStatus)) {
    throw new EvidenceDomainError("INVALID_EVIDENCE_TRANSITION");
  }
}

export function isTerminalEvidenceStatus(status: EvidenceStatus): boolean {
  return status === "REMOVED";
}

export function canRemoveEvidence(
  caseStatus: FraudCaseStatus,
  evidenceStatus: EvidenceStatus,
): boolean {
  return (
    caseStatus === "DRAFT" &&
    canTransitionEvidence(evidenceStatus, "REMOVED")
  );
}

export function assertEvidenceRemovalAllowed(
  caseStatus: FraudCaseStatus,
  evidenceStatus: EvidenceStatus,
): void {
  if (!canRemoveEvidence(caseStatus, evidenceStatus)) {
    throw new EvidenceDomainError("EVIDENCE_REMOVAL_NOT_ALLOWED");
  }
}

export function canChangeEvidenceContent(status: EvidenceStatus): boolean {
  return status === "AWAITING_UPLOAD";
}
