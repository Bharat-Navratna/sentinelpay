import { MAX_EVIDENCE_ITEMS_PER_CASE, inlineEvidenceKinds, type EvidenceCategory, type InlineEvidenceKind } from "../../evidence/domain/evidence";
import { normalizeInlineEvidence } from "../../evidence/domain/inline-evidence";
import { assertEvidenceTransition, canRemoveEvidence } from "../../evidence/domain/evidence-state-machine";
import { EvidenceDomainError } from "../../evidence/domain/evidence-errors";
import { dependencies, event, ownedCase, ownedContext, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { EvidenceItemRecord, FraudCaseWorkflow } from "./fraud-case-types";

export async function addInlineEvidence(input: { caseId: string; kind: InlineEvidenceKind; category: EvidenceCategory; content: unknown; idempotencyKey: string; capturedAt?: Date | null }, deps: ServiceDependencies): Promise<EvidenceItemRecord> {
  const { repository, now, uuid } = dependencies(deps); const context = await ownedContext(repository);
  if (!(inlineEvidenceKinds as readonly string[]).includes(input.kind)) throw new EvidenceDomainError("INVALID_INLINE_EVIDENCE");
  const normalized = normalizeInlineEvidence(input.kind, input.content);
  const prior = await repository.findEvidenceByCreationKey(input.idempotencyKey, context.accountId);
  if (prior) {
    if (prior.caseId === input.caseId && prior.kind === input.kind && prior.category === input.category && prior.sha256 === normalized.sha256 && prior.capturedAt?.getTime() === (input.capturedAt ?? null)?.getTime()) return prior;
    throw new FraudCaseApplicationError("EVIDENCE_IDEMPOTENCY_CONFLICT");
  }
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  if (workflow.evidenceItems.filter((item) => item.status !== "REMOVED").length >= MAX_EVIDENCE_ITEMS_PER_CASE) throw new FraudCaseApplicationError("EVIDENCE_LIMIT_REACHED");
  const at = now(); const id = uuid();
  const evidence: EvidenceItemRecord = { id, caseId: input.caseId, kind: input.kind, category: input.category, status: "READY", originalFilename: null, storageObjectKey: null, declaredMimeType: null, detectedMimeType: null, sizeBytes: null, sha256: normalized.sha256, inlineText: normalized.content, capturedAt: input.capturedAt ?? null, creationIdempotencyKey: input.idempotencyKey, uploadIdempotencyKey: null, uploadExpiresAt: null, validationStartedAt: null, uploadedAt: null, validatedAt: null, safeFailureCode: null, createdAt: at, updatedAt: at };
  const result = await repository.addInlineEvidenceAtomically({ accountId: context.accountId, evidence, event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: id, type: "INLINE_EVIDENCE_ADDED", at, requestKey: input.idempotencyKey }) });
  if (result.kind === "LIMIT") throw new FraudCaseApplicationError("EVIDENCE_LIMIT_REACHED");
  if (result.kind === "IDEMPOTENCY_RACE") return addInlineEvidence(input, deps);
  if (result.kind !== "CREATED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return evidence;
}

export async function removeEvidence(input: { caseId: string; evidenceId: string }, deps: ServiceDependencies): Promise<FraudCaseWorkflow> {
  const { repository, now, uuid } = dependencies(deps); const workflow = await ownedCase(repository, input.caseId);
  const evidence = workflow.evidenceItems.find((item) => item.id === input.evidenceId);
  if (!evidence) throw new FraudCaseApplicationError("EVIDENCE_NOT_FOUND");
  if (evidence.status === "REMOVED") return workflow;
  if (!canRemoveEvidence(workflow.fraudCase.status, evidence.status)) throw new EvidenceDomainError("EVIDENCE_REMOVAL_NOT_ALLOWED");
  assertEvidenceTransition(evidence.status, "REMOVED"); const context = await ownedContext(repository); const at = now();
  const result = await repository.removeEvidenceAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, expectedStatus: evidence.status, updatedAt: at, event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_REMOVED", at }) });
  const updated = await repository.loadCase(input.caseId, context.accountId);
  if (!updated) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  if (result.kind === "CONFLICT" && updated.evidenceItems.find((item) => item.id === input.evidenceId)?.status !== "REMOVED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return updated;
}
