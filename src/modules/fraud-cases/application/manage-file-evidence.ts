import {
  MAX_EVIDENCE_FILE_BYTES,
  MAX_EVIDENCE_ITEMS_PER_CASE,
  MAX_FILE_EVIDENCE_ITEMS_PER_CASE,
  type EvidenceCategory,
} from "../../evidence/domain/evidence";
import {
  assertEvidenceTransition,
} from "../../evidence/domain/evidence-state-machine";
import {
  normalizeFileEvidenceInput,
} from "../../evidence/application/file-evidence-input";
import {
  acceptedFileMimeTypes,
  fileValidationErrorCodes,
  type AcceptedFileMimeType,
  type FileValidationErrorCode,
} from "../../evidence/application/file-evidence-validator";
import {
  buildFinalEvidenceObjectLocator,
  buildQuarantineObjectLocator,
  type StorageObjectLocator,
} from "../../evidence/application/evidence-object-keys";
import { dependencies, event, ownedCase, ownedContext, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { AuthoritativeFileMetadata, EvidenceItemRecord } from "./fraud-case-types";

export const FILE_VALIDATION_STALE_MILLISECONDS = 10 * 60 * 1_000;
export const CASE_FILE_BYTES_LIMIT_FAILURE = "CASE_FILE_BYTES_LIMIT_EXCEEDED" as const;
export const FILE_UPLOAD_NOT_FOUND_FAILURE = "FILE_UPLOAD_NOT_FOUND" as const;
export type SafeFileRejectionCode = FileValidationErrorCode | typeof CASE_FILE_BYTES_LIMIT_FAILURE | typeof FILE_UPLOAD_NOT_FOUND_FAILURE;

export type FileValidationClaimResult =
  | { kind: "CLAIMED" | "RECLAIMED"; evidence: EvidenceItemRecord; validationToken: Date }
  | { kind: "IN_PROGRESS" | "READY" | "REJECTED"; evidence: EvidenceItemRecord };

export type FileMetadataReservationResult =
  | { kind: "RESERVED"; evidence: EvidenceItemRecord }
  | { kind: "REJECTED"; evidence: EvidenceItemRecord };

function sameTime(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function sameCreatePayload(existing: EvidenceItemRecord, input: {
  caseId: string;
  category: EvidenceCategory;
  originalFilename: string;
  declaredMimeType: string;
  capturedAt: Date | null;
}): boolean {
  return existing.caseId === input.caseId && existing.kind === "FILE" &&
    existing.category === input.category && existing.originalFilename === input.originalFilename &&
    existing.declaredMimeType === input.declaredMimeType && sameTime(existing.capturedAt, input.capturedAt);
}

function metadataMatches(evidence: EvidenceItemRecord, metadata: AuthoritativeFileMetadata): boolean {
  return evidence.sizeBytes === metadata.sizeBytes && evidence.detectedMimeType === metadata.detectedMimeType &&
    evidence.sha256 === metadata.sha256 && evidence.storageObjectKey === metadata.storageObjectKey;
}

function evidenceFrom(workflow: Awaited<ReturnType<typeof ownedCase>>, evidenceId: string): EvidenceItemRecord {
  const evidence = workflow.evidenceItems.find((item) => item.id === evidenceId);
  if (!evidence) throw new FraudCaseApplicationError("EVIDENCE_NOT_FOUND");
  if (evidence.kind !== "FILE") throw new FraudCaseApplicationError("INVALID_FILE_EVIDENCE_METADATA");
  return evidence;
}

async function reload(repository: ServiceDependencies["repository"], caseId: string, accountId: string, evidenceId: string) {
  const workflow = await repository.loadCase(caseId, accountId);
  if (!workflow) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return evidenceFrom(workflow, evidenceId);
}

export async function createFileEvidence(input: {
  caseId: string;
  category: unknown;
  originalFilename: unknown;
  declaredMimeType: unknown;
  capturedAt?: unknown;
  uploadIdempotencyKey: unknown;
}, deps: ServiceDependencies): Promise<EvidenceItemRecord> {
  const { repository, now, uuid } = dependencies(deps);
  const context = await ownedContext(repository);
  const normalized = normalizeFileEvidenceInput(input);
  const prior = await repository.findEvidenceByUploadKey(normalized.uploadIdempotencyKey, context.accountId);
  if (prior) {
    if (sameCreatePayload(prior, { caseId: input.caseId, ...normalized })) return prior;
    throw new FraudCaseApplicationError("EVIDENCE_IDEMPOTENCY_CONFLICT");
  }

  const workflow = await ownedCase(repository, input.caseId);
  requireDraft(workflow);
  const active = workflow.evidenceItems.filter((item) => item.status !== "REMOVED");
  if (active.length >= MAX_EVIDENCE_ITEMS_PER_CASE) throw new FraudCaseApplicationError("EVIDENCE_LIMIT_REACHED");
  if (active.filter((item) => item.kind === "FILE").length >= MAX_FILE_EVIDENCE_ITEMS_PER_CASE) {
    throw new FraudCaseApplicationError("FILE_EVIDENCE_LIMIT_REACHED");
  }

  const at = now();
  const evidence: EvidenceItemRecord = {
    id: uuid(), caseId: input.caseId, kind: "FILE", category: normalized.category, status: "AWAITING_UPLOAD",
    originalFilename: normalized.originalFilename, storageObjectKey: null, declaredMimeType: normalized.declaredMimeType,
    detectedMimeType: null, sizeBytes: null, sha256: null, inlineText: null, capturedAt: normalized.capturedAt,
    creationIdempotencyKey: null, uploadIdempotencyKey: normalized.uploadIdempotencyKey, uploadExpiresAt: null,
    validationStartedAt: null, uploadedAt: null, validatedAt: null, safeFailureCode: null, createdAt: at, updatedAt: at,
  };
  const result = await repository.createFileEvidenceAtomically({
    accountId: context.accountId,
    evidence,
    event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: evidence.id, type: "EVIDENCE_UPLOAD_REQUESTED", at, requestKey: normalized.uploadIdempotencyKey }),
  });
  if (result.kind === "IDEMPOTENCY_RACE") {
    const winner = await repository.findEvidenceByUploadKey(normalized.uploadIdempotencyKey, context.accountId);
    if (!winner) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
    if (sameCreatePayload(winner, { caseId: input.caseId, ...normalized })) return winner;
    throw new FraudCaseApplicationError("EVIDENCE_IDEMPOTENCY_CONFLICT");
  }
  if (result.kind === "TOTAL_LIMIT") throw new FraudCaseApplicationError("EVIDENCE_LIMIT_REACHED");
  if (result.kind === "FILE_LIMIT") throw new FraudCaseApplicationError("FILE_EVIDENCE_LIMIT_REACHED");
  if (result.kind !== "CREATED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return evidence;
}

export async function prepareFileEvidenceUploadGrant(input: { caseId: string; evidenceId: string }, deps: ServiceDependencies): Promise<{
  evidenceId: string;
  uploadSessionId: string;
  locator: StorageObjectLocator;
  declaredMimeType: AcceptedFileMimeType;
  expiresAt: Date;
}> {
  const { repository, now } = dependencies(deps);
  const context = await ownedContext(repository);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status !== "AWAITING_UPLOAD" || !evidence.uploadIdempotencyKey || !evidence.declaredMimeType ||
      !acceptedFileMimeTypes.some((value) => value === evidence.declaredMimeType)) {
    throw new FraudCaseApplicationError("EVIDENCE_NOT_AWAITING_UPLOAD");
  }
  const at = now();
  const expiresAt = new Date(at.getTime() + 5 * 60 * 1_000);
  const result = await repository.prepareFileUploadGrantAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, expiresAt, updatedAt: at });
  if (result.kind !== "APPLIED") throw new FraudCaseApplicationError("EVIDENCE_NOT_AWAITING_UPLOAD");
  return { evidenceId: evidence.id, uploadSessionId: evidence.uploadIdempotencyKey, locator: buildQuarantineObjectLocator(evidence.uploadIdempotencyKey), declaredMimeType: evidence.declaredMimeType as AcceptedFileMimeType, expiresAt };
}

export async function claimFileEvidenceValidation(input: { caseId: string; evidenceId: string }, deps: ServiceDependencies): Promise<FileValidationClaimResult> {
  const { repository, now, uuid } = dependencies(deps);
  const context = await ownedContext(repository);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status === "VALIDATING") return { kind: "IN_PROGRESS", evidence };
  if (evidence.status === "READY") return { kind: "READY", evidence };
  if (evidence.status === "REJECTED") return { kind: "REJECTED", evidence };
  if (evidence.status !== "AWAITING_UPLOAD") throw new FraudCaseApplicationError("EVIDENCE_NOT_AWAITING_UPLOAD");
  assertEvidenceTransition("AWAITING_UPLOAD", "VALIDATING");
  const token = now();
  const result = await repository.claimFileValidationAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, validationToken: token, uploadedAt: token, event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_VALIDATION_STARTED", at: token, actor: "SYSTEM" }) });
  if (result.kind !== "APPLIED") return claimFileEvidenceValidation(input, deps);
  return { kind: "CLAIMED", evidence: await reload(repository, input.caseId, context.accountId, input.evidenceId), validationToken: token };
}

export async function retryStaleFileEvidenceValidation(input: { caseId: string; evidenceId: string }, deps: ServiceDependencies): Promise<FileValidationClaimResult> {
  const { repository, now, uuid } = dependencies(deps);
  const context = await ownedContext(repository);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status === "READY") return { kind: "READY", evidence };
  if (evidence.status === "REJECTED") return { kind: "REJECTED", evidence };
  if (evidence.status !== "VALIDATING" || !evidence.validationStartedAt) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  const at = now();
  const staleBefore = new Date(at.getTime() - FILE_VALIDATION_STALE_MILLISECONDS);
  if (evidence.validationStartedAt.getTime() > staleBefore.getTime()) return { kind: "IN_PROGRESS", evidence };
  const replacementToken = new Date(Math.max(at.getTime(), evidence.validationStartedAt.getTime() + 1));
  const result = await repository.reclaimFileValidationAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, previousToken: evidence.validationStartedAt, staleBefore, replacementToken, event: event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_VALIDATION_RESTARTED", at, actor: "SYSTEM" }) });
  if (result.kind !== "APPLIED") return retryStaleFileEvidenceValidation(input, deps);
  return { kind: "RECLAIMED", evidence: await reload(repository, input.caseId, context.accountId, input.evidenceId), validationToken: replacementToken };
}

function validateMetadata(caseId: string, evidenceId: string, input: { sizeBytes: number; detectedMimeType: unknown; sha256: unknown; finalLocator: unknown }): AuthoritativeFileMetadata {
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_EVIDENCE_FILE_BYTES ||
      typeof input.detectedMimeType !== "string" || !acceptedFileMimeTypes.some((value) => value === input.detectedMimeType) ||
      typeof input.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(input.sha256)) {
    throw new FraudCaseApplicationError("INVALID_FILE_EVIDENCE_METADATA");
  }
  const expected = buildFinalEvidenceObjectLocator({ caseId, evidenceId, sha256: input.sha256 });
  if (input.finalLocator !== expected) throw new FraudCaseApplicationError("INVALID_FILE_EVIDENCE_METADATA");
  return { sizeBytes: input.sizeBytes, detectedMimeType: input.detectedMimeType, sha256: input.sha256, storageObjectKey: expected };
}

export async function reserveValidatedFileMetadata(input: { caseId: string; evidenceId: string; validationToken: Date; sizeBytes: number; detectedMimeType: unknown; sha256: unknown; finalLocator: unknown }, deps: ServiceDependencies): Promise<FileMetadataReservationResult> {
  const { repository, now, uuid } = dependencies(deps); const context = await ownedContext(repository);
  const metadata = validateMetadata(input.caseId, input.evidenceId, input);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow); const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status !== "VALIDATING" || !sameTime(evidence.validationStartedAt, input.validationToken)) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  if (metadataMatches(evidence, metadata)) return { kind: "RESERVED", evidence };
  const at = now();
  const result = await repository.reserveFileMetadataAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, validationToken: input.validationToken, metadata, updatedAt: at, rejectionEvent: event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_REJECTED", at, actor: "SYSTEM" }) });
  const updated = await reload(repository, input.caseId, context.accountId, input.evidenceId);
  if (result.kind === "REJECTED") return { kind: "REJECTED", evidence: updated };
  if (result.kind !== "RESERVED") throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return { kind: "RESERVED", evidence: updated };
}

export async function finalizeFileEvidenceReady(input: { caseId: string; evidenceId: string; validationToken: Date; sizeBytes: number; detectedMimeType: unknown; sha256: unknown; finalLocator: unknown; pdfPageCount?: number | null }, deps: ServiceDependencies): Promise<EvidenceItemRecord> {
  const { repository, now, uuid } = dependencies(deps); const context = await ownedContext(repository);
  const metadata = validateMetadata(input.caseId, input.evidenceId, input);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow); const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status === "READY") {
    if (metadataMatches(evidence, metadata)) return evidence;
    throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  }
  if (evidence.status !== "VALIDATING" || !sameTime(evidence.validationStartedAt, input.validationToken) || !metadataMatches(evidence, metadata)) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  assertEvidenceTransition("VALIDATING", "READY"); const at = now();
  const result = await repository.finalizeFileReadyAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, validationToken: input.validationToken, metadata, completedAt: at, event: { ...event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_VALIDATED", at, actor: "SYSTEM" }), metadata: { simulation: true, detectedMimeType: metadata.detectedMimeType, sizeBytes: metadata.sizeBytes, ...(input.pdfPageCount == null ? {} : { pdfPageCount: input.pdfPageCount }) } } });
  if (result.kind !== "APPLIED") throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return reload(repository, input.caseId, context.accountId, input.evidenceId);
}

export function isSafeFileRejectionCode(value: unknown): value is SafeFileRejectionCode {
  return typeof value === "string" && ((fileValidationErrorCodes as readonly string[]).includes(value) || value === FILE_UPLOAD_NOT_FOUND_FAILURE || value === CASE_FILE_BYTES_LIMIT_FAILURE);
}

export async function finalizeFileEvidenceRejected(input: { caseId: string; evidenceId: string; validationToken: Date; safeFailureCode: unknown }, deps: ServiceDependencies): Promise<EvidenceItemRecord> {
  if (!isSafeFileRejectionCode(input.safeFailureCode) || input.safeFailureCode === CASE_FILE_BYTES_LIMIT_FAILURE) throw new FraudCaseApplicationError("INVALID_FILE_EVIDENCE_METADATA");
  const { repository, now, uuid } = dependencies(deps); const context = await ownedContext(repository);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow); const evidence = evidenceFrom(workflow, input.evidenceId);
  if (evidence.status === "REJECTED") {
    if (evidence.safeFailureCode === input.safeFailureCode) return evidence;
    throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  }
  if (evidence.status !== "VALIDATING" || !sameTime(evidence.validationStartedAt, input.validationToken)) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  assertEvidenceTransition("VALIDATING", "REJECTED"); const at = now();
  const result = await repository.finalizeFileRejectedAtomically({ accountId: context.accountId, caseId: input.caseId, evidenceId: input.evidenceId, validationToken: input.validationToken, safeFailureCode: input.safeFailureCode, completedAt: at, event: { ...event({ id: uuid(), caseId: input.caseId, evidenceItemId: input.evidenceId, type: "EVIDENCE_REJECTED", at, actor: "SYSTEM" }), metadata: { simulation: true, failureCode: input.safeFailureCode } } });
  if (result.kind !== "APPLIED") throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return reload(repository, input.caseId, context.accountId, input.evidenceId);
}
