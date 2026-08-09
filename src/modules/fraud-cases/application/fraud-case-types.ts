import type { PaymentStatus } from "../../payments/domain/payment-state-machine";
import type { FraudCaseStatus } from "../domain/fraud-case";
import type { ScamReportDraft } from "../domain/scam-report";
import type { EvidenceCategory, EvidenceKind, EvidenceStatus } from "../../evidence/domain/evidence";
import type { ExtractionResult, ExtractionReviewStatus, ExtractionStatus } from "../../evidence/domain/extraction";

export type CaseCustomerContext = { customerId: string; accountId: string };
export type CasePayment = { id: string; accountId: string; beneficiaryId: string; beneficiaryName: string; amountMinor: number; currencyCode: string; reference: string; status: PaymentStatus; createdAt: Date };
export type FraudCaseRecord = { id: string; paymentId: string; caseReference: string; status: FraudCaseStatus; createdAt: Date; updatedAt: Date; submittedAt: Date | null; submissionIdempotencyKey: string | null };
export type FraudCaseReportRecord = ScamReportDraft & { caseId: string; version: number; createdAt: Date; updatedAt: Date };
export type EvidenceItemRecord = {
  id: string; caseId: string; kind: EvidenceKind; category: EvidenceCategory; status: EvidenceStatus;
  originalFilename: string | null; storageObjectKey: string | null; declaredMimeType: string | null; detectedMimeType: string | null;
  sizeBytes: number | null; sha256: string | null; inlineText: string | null; capturedAt: Date | null;
  creationIdempotencyKey: string | null; uploadIdempotencyKey: string | null; uploadExpiresAt: Date | null;
  validationStartedAt: Date | null; uploadedAt: Date | null; validatedAt: Date | null; safeFailureCode: string | null;
  createdAt: Date; updatedAt: Date;
};
export type ExtractionRunRecord = { id: string; evidenceItemId: string; evidenceSha256: string; status: ExtractionStatus; idempotencyKey: string; provider: string; model: string; modelVersion: string; promptVersion: string; schemaVersion: string; machineOutput: ExtractionResult | null; safeFailureCode: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null };
export type ExtractionReviewRecord = { id: string; extractionRunId: string; status: ExtractionReviewStatus; correctedOutput: ExtractionResult | null; reviewedAt: Date };
export type CaseEventRecord = { id: string; caseId: string; eventSequence: number; evidenceItemId: string | null; eventType: string; actorType: "CUSTOMER" | "SYSTEM"; requestIdempotencyKey: string | null; metadata: Record<string, unknown>; occurredAt: Date };
export type NewCaseEvent = Omit<CaseEventRecord, "eventSequence">;
export type FraudCaseWorkflow = { fraudCase: FraudCaseRecord; payment: CasePayment; report: FraudCaseReportRecord; evidenceItems: EvidenceItemRecord[]; extractionRuns: ExtractionRunRecord[]; extractionReviews: ExtractionReviewRecord[]; events: CaseEventRecord[] };

export type NewFraudCaseWorkflow = { fraudCase: FraudCaseRecord; report: FraudCaseReportRecord; event: NewCaseEvent };
export type SaveReportCommand = { caseId: string; accountId: string; expectedVersion: number; report: ScamReportDraft; updatedAt: Date; event: NewCaseEvent };
export type AddInlineEvidenceCommand = { accountId: string; evidence: EvidenceItemRecord; event: NewCaseEvent };
export type RemoveEvidenceCommand = { accountId: string; caseId: string; evidenceId: string; expectedStatus: EvidenceStatus; updatedAt: Date; event: NewCaseEvent };
export type ExtractionTransitionCommand = { accountId: string; caseId: string; runId: string; fromStatus: ExtractionStatus; run: ExtractionRunRecord; event: NewCaseEvent };
export type SubmitCaseCommand = { accountId: string; caseId: string; expectedReportVersion: number; idempotencyKey: string; submittedAt: Date; event: NewCaseEvent };

export type CreateFileEvidenceCommand = { accountId: string; evidence: EvidenceItemRecord; event: NewCaseEvent };
export type PrepareFileUploadGrantCommand = { accountId: string; caseId: string; evidenceId: string; expiresAt: Date; updatedAt: Date };
export type ClaimFileValidationCommand = { accountId: string; caseId: string; evidenceId: string; validationToken: Date; uploadedAt: Date; event: NewCaseEvent };
export type ReclaimFileValidationCommand = { accountId: string; caseId: string; evidenceId: string; previousToken: Date; staleBefore: Date; replacementToken: Date; event: NewCaseEvent };
export type AuthoritativeFileMetadata = { sizeBytes: number; detectedMimeType: string; sha256: string; storageObjectKey: string };
export type ReserveFileMetadataCommand = { accountId: string; caseId: string; evidenceId: string; validationToken: Date; metadata: AuthoritativeFileMetadata; updatedAt: Date; rejectionEvent: NewCaseEvent };
export type FinalizeFileReadyCommand = { accountId: string; caseId: string; evidenceId: string; validationToken: Date; metadata: AuthoritativeFileMetadata; completedAt: Date; event: NewCaseEvent };
export type FinalizeFileRejectedCommand = { accountId: string; caseId: string; evidenceId: string; validationToken: Date; safeFailureCode: string; completedAt: Date; event: NewCaseEvent };
