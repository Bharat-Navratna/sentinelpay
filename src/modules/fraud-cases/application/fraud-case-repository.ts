import type { AddInlineEvidenceCommand, CaseCustomerContext, ClaimFileValidationCommand, CreateFileEvidenceCommand, ExtractionReviewRecord, ExtractionRunRecord, ExtractionTransitionCommand, FinalizeFileReadyCommand, FinalizeFileRejectedCommand, FraudCaseWorkflow, NewCaseEvent, NewFraudCaseWorkflow, PrepareFileUploadGrantCommand, ReclaimFileValidationCommand, RemoveEvidenceCommand, ReserveFileMetadataCommand, SaveReportCommand, SubmitCaseCommand } from "./fraud-case-types";

export type AtomicResult = { kind: "APPLIED" } | { kind: "CONFLICT" };
export type CreateCaseResult = { kind: "CREATED" } | { kind: "PAYMENT_RACE" };
export type AddEvidenceResult = { kind: "CREATED" } | { kind: "IDEMPOTENCY_RACE" } | { kind: "LIMIT" } | { kind: "CONFLICT" };
export type CreateExtractionResult = { kind: "CREATED" } | { kind: "IDEMPOTENCY_RACE" } | { kind: "CONFLICT" };
export type CreateReviewResult = { kind: "CREATED" } | { kind: "EXISTS" } | { kind: "CONFLICT" };
export type CreateFileEvidenceResult = { kind: "CREATED" } | { kind: "IDEMPOTENCY_RACE" } | { kind: "TOTAL_LIMIT" } | { kind: "FILE_LIMIT" } | { kind: "CONFLICT" };
export type ReserveFileMetadataResult = { kind: "RESERVED" } | { kind: "REJECTED" } | { kind: "CONFLICT" };

export interface FraudCaseRepository {
  loadCustomerContext(): Promise<CaseCustomerContext | null>;
  loadOwnedPayment(paymentId: string, accountId: string): Promise<FraudCaseWorkflow["payment"] | null>;
  findCaseByPaymentId(paymentId: string, accountId: string): Promise<FraudCaseWorkflow | null>;
  loadCase(caseId: string, accountId: string): Promise<FraudCaseWorkflow | null>;
  createCaseAtomically(workflow: NewFraudCaseWorkflow, accountId: string): Promise<CreateCaseResult>;
  saveReportAtomically(command: SaveReportCommand): Promise<AtomicResult>;
  findEvidenceByCreationKey(key: string, accountId: string): Promise<FraudCaseWorkflow["evidenceItems"][number] | null>;
  findEvidenceByUploadKey(key: string, accountId: string): Promise<FraudCaseWorkflow["evidenceItems"][number] | null>;
  addInlineEvidenceAtomically(command: AddInlineEvidenceCommand): Promise<AddEvidenceResult>;
  createFileEvidenceAtomically(command: CreateFileEvidenceCommand): Promise<CreateFileEvidenceResult>;
  prepareFileUploadGrantAtomically(command: PrepareFileUploadGrantCommand): Promise<AtomicResult>;
  claimFileValidationAtomically(command: ClaimFileValidationCommand): Promise<AtomicResult>;
  reclaimFileValidationAtomically(command: ReclaimFileValidationCommand): Promise<AtomicResult>;
  reserveFileMetadataAtomically(command: ReserveFileMetadataCommand): Promise<ReserveFileMetadataResult>;
  finalizeFileReadyAtomically(command: FinalizeFileReadyCommand): Promise<AtomicResult>;
  finalizeFileRejectedAtomically(command: FinalizeFileRejectedCommand): Promise<AtomicResult>;
  removeEvidenceAtomically(command: RemoveEvidenceCommand): Promise<AtomicResult>;
  findExtractionByIdempotencyKey(key: string, accountId: string): Promise<ExtractionRunRecord | null>;
  createExtractionRunAtomically(run: ExtractionRunRecord, caseId: string, accountId: string, event: NewCaseEvent): Promise<CreateExtractionResult>;
  transitionExtractionAtomically(command: ExtractionTransitionCommand): Promise<AtomicResult>;
  createExtractionReviewAtomically(review: ExtractionReviewRecord, caseId: string, accountId: string, event: NewCaseEvent): Promise<CreateReviewResult>;
  submitCaseAtomically(command: SubmitCaseCommand): Promise<AtomicResult>;
}
