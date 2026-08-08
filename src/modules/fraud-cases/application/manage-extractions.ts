import { assertExtractionTransition, canStartExtractionRun, createExtractionReview, parseExtractionResult, type ExtractionReviewStatus } from "../../evidence/domain/extraction";
import { dependencies, event, ownedCase, ownedContext, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { ExtractionRunRecord, FraudCaseWorkflow } from "./fraud-case-types";

const nonblank = (value: string) => value.trim().length > 0;
export async function createExtractionRun(input: { caseId: string; evidenceItemId: string; evidenceSha256: string; idempotencyKey: string; provider: string; model: string; modelVersion: string; promptVersion: string; schemaVersion: string }, deps: ServiceDependencies): Promise<ExtractionRunRecord> {
  const { repository, now, uuid } = dependencies(deps); const context = await ownedContext(repository);
  const prior = await repository.findExtractionByIdempotencyKey(input.idempotencyKey, context.accountId);
  if (prior) {
    if (prior.evidenceItemId === input.evidenceItemId && prior.evidenceSha256 === input.evidenceSha256 && prior.provider === input.provider.trim() && prior.model === input.model.trim() && prior.modelVersion === input.modelVersion.trim() && prior.promptVersion === input.promptVersion.trim() && prior.schemaVersion === input.schemaVersion.trim()) return prior;
    throw new FraudCaseApplicationError("EXTRACTION_IDEMPOTENCY_CONFLICT");
  }
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const evidence = workflow.evidenceItems.find((item) => item.id === input.evidenceItemId);
  if (!evidence) throw new FraudCaseApplicationError("EVIDENCE_NOT_FOUND");
  if (!evidence.sha256 || evidence.sha256 !== input.evidenceSha256) throw new FraudCaseApplicationError("EXTRACTION_HASH_MISMATCH");
  const statuses = workflow.extractionRuns.filter((run) => run.evidenceItemId === evidence.id && run.evidenceSha256 === evidence.sha256).map((run) => run.status);
  if (!canStartExtractionRun(evidence.status, statuses)) {
    const completed = workflow.extractionRuns.find((run) => run.evidenceItemId === evidence.id && run.evidenceSha256 === evidence.sha256 && run.status === "COMPLETED");
    if (completed) return completed;
    throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  }
  if (![input.provider, input.model, input.modelVersion, input.promptVersion, input.schemaVersion].every(nonblank)) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  const at = now(); const run: ExtractionRunRecord = { id: uuid(), evidenceItemId: evidence.id, evidenceSha256: evidence.sha256, status: "PENDING", idempotencyKey: input.idempotencyKey, provider: input.provider.trim(), model: input.model.trim(), modelVersion: input.modelVersion.trim(), promptVersion: input.promptVersion.trim(), schemaVersion: input.schemaVersion.trim(), machineOutput: null, safeFailureCode: null, createdAt: at, startedAt: null, completedAt: null };
  const result = await repository.createExtractionRunAtomically(run, input.caseId, context.accountId, event({ id: uuid(), caseId: input.caseId, evidenceItemId: evidence.id, type: "EXTRACTION_PENDING", at, requestKey: input.idempotencyKey, actor: "SYSTEM" }));
  if (result.kind === "IDEMPOTENCY_RACE") return createExtractionRun(input, deps);
  if (result.kind !== "CREATED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return run;
}

async function transition(input: { caseId: string; runId: string; to: "PROCESSING" | "COMPLETED" | "FAILED"; output?: unknown; failureCode?: string }, deps: ServiceDependencies): Promise<ExtractionRunRecord> {
  const { repository, now, uuid } = dependencies(deps); const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const existing = workflow.extractionRuns.find((run) => run.id === input.runId);
  if (!existing) throw new FraudCaseApplicationError("EXTRACTION_NOT_FOUND");
  if (existing.status === input.to) return existing;
  assertExtractionTransition(existing.status, input.to); const evidence = workflow.evidenceItems.find((item) => item.id === existing.evidenceItemId);
  if (!evidence?.sha256 || evidence.sha256 !== existing.evidenceSha256) throw new FraudCaseApplicationError("EXTRACTION_HASH_MISMATCH");
  const at = now(); const output = input.to === "COMPLETED" ? parseExtractionResult(input.output) : null;
  if (input.to === "FAILED" && !nonblank(input.failureCode ?? "")) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  const run = { ...existing, status: input.to, startedAt: input.to === "PROCESSING" ? at : existing.startedAt, completedAt: input.to === "PROCESSING" ? null : at, machineOutput: output, safeFailureCode: input.to === "FAILED" ? input.failureCode!.trim() : null } as ExtractionRunRecord;
  const context = await ownedContext(repository); const result = await repository.transitionExtractionAtomically({ accountId: context.accountId, caseId: input.caseId, runId: input.runId, fromStatus: existing.status, run, event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: existing.evidenceItemId, type: `EXTRACTION_${input.to}`, at, actor: "SYSTEM" }) });
  if (result.kind === "CONFLICT") {
    const latest = await repository.loadCase(input.caseId, context.accountId); const completed = latest?.extractionRuns.find((candidate) => candidate.evidenceItemId === existing.evidenceItemId && candidate.evidenceSha256 === existing.evidenceSha256 && candidate.status === "COMPLETED");
    if (input.to === "COMPLETED" && completed) return completed;
    throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  }
  return run;
}
export const claimExtractionRun = (caseId: string, runId: string, deps: ServiceDependencies) => transition({ caseId, runId, to: "PROCESSING" }, deps);
export const completeExtractionRun = (caseId: string, runId: string, output: unknown, deps: ServiceDependencies) => transition({ caseId, runId, to: "COMPLETED", output }, deps);
export const failExtractionRun = (caseId: string, runId: string, safeFailureCode: string, deps: ServiceDependencies) => transition({ caseId, runId, to: "FAILED", failureCode: safeFailureCode }, deps);

export async function reviewExtraction(input: { caseId: string; runId: string; status: ExtractionReviewStatus; correctedOutput?: unknown }, deps: ServiceDependencies): Promise<FraudCaseWorkflow["extractionReviews"][number]> {
  const { repository, now, uuid } = dependencies(deps); const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const run = workflow.extractionRuns.find((item) => item.id === input.runId); if (!run) throw new FraudCaseApplicationError("EXTRACTION_NOT_FOUND");
  if (run.status !== "COMPLETED") throw new FraudCaseApplicationError("CASE_SUBMISSION_BLOCKED");
  const reviewValue = createExtractionReview(input.status, input.correctedOutput); const existing = workflow.extractionReviews.find((item) => item.extractionRunId === run.id);
  if (existing) {
    if (existing.status === reviewValue.status && JSON.stringify(existing.correctedOutput) === JSON.stringify(reviewValue.correctedOutput)) return existing;
    throw new FraudCaseApplicationError("EXTRACTION_REVIEW_ALREADY_EXISTS");
  }
  const at = now(); const review = { id: uuid(), extractionRunId: run.id, status: reviewValue.status, correctedOutput: reviewValue.correctedOutput, reviewedAt: at };
  const context = await ownedContext(repository); const result = await repository.createExtractionReviewAtomically(review, input.caseId, context.accountId, event({ id: uuid(), caseId: input.caseId, evidenceItemId: run.evidenceItemId, type: "EXTRACTION_REVIEWED", at }));
  if (result.kind === "EXISTS") throw new FraudCaseApplicationError("EXTRACTION_REVIEW_ALREADY_EXISTS");
  if (result.kind !== "CREATED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return review;
}
