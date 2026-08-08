import type { AddInlineEvidenceCommand, CaseCustomerContext, ExtractionReviewRecord, ExtractionRunRecord, ExtractionTransitionCommand, FraudCaseWorkflow, NewCaseEvent, NewFraudCaseWorkflow, RemoveEvidenceCommand, SaveReportCommand, SubmitCaseCommand } from "./fraud-case-types";

export type AtomicResult = { kind: "APPLIED" } | { kind: "CONFLICT" };
export type CreateCaseResult = { kind: "CREATED" } | { kind: "PAYMENT_RACE" };
export type AddEvidenceResult = { kind: "CREATED" } | { kind: "IDEMPOTENCY_RACE" } | { kind: "LIMIT" } | { kind: "CONFLICT" };
export type CreateExtractionResult = { kind: "CREATED" } | { kind: "IDEMPOTENCY_RACE" } | { kind: "CONFLICT" };
export type CreateReviewResult = { kind: "CREATED" } | { kind: "EXISTS" } | { kind: "CONFLICT" };

export interface FraudCaseRepository {
  loadCustomerContext(): Promise<CaseCustomerContext | null>;
  loadOwnedPayment(paymentId: string, accountId: string): Promise<FraudCaseWorkflow["payment"] | null>;
  findCaseByPaymentId(paymentId: string, accountId: string): Promise<FraudCaseWorkflow | null>;
  loadCase(caseId: string, accountId: string): Promise<FraudCaseWorkflow | null>;
  createCaseAtomically(workflow: NewFraudCaseWorkflow, accountId: string): Promise<CreateCaseResult>;
  saveReportAtomically(command: SaveReportCommand): Promise<AtomicResult>;
  findEvidenceByCreationKey(key: string, accountId: string): Promise<FraudCaseWorkflow["evidenceItems"][number] | null>;
  addInlineEvidenceAtomically(command: AddInlineEvidenceCommand): Promise<AddEvidenceResult>;
  removeEvidenceAtomically(command: RemoveEvidenceCommand): Promise<AtomicResult>;
  findExtractionByIdempotencyKey(key: string, accountId: string): Promise<ExtractionRunRecord | null>;
  createExtractionRunAtomically(run: ExtractionRunRecord, caseId: string, accountId: string, event: NewCaseEvent): Promise<CreateExtractionResult>;
  transitionExtractionAtomically(command: ExtractionTransitionCommand): Promise<AtomicResult>;
  createExtractionReviewAtomically(review: ExtractionReviewRecord, caseId: string, accountId: string, event: NewCaseEvent): Promise<CreateReviewResult>;
  submitCaseAtomically(command: SubmitCaseCommand): Promise<AtomicResult>;
}
