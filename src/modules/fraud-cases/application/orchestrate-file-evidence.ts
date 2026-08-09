import type { EvidenceStorage, EvidenceUploadGrant } from "../../evidence/application/evidence-storage";
import { EvidenceStorageError } from "../../evidence/application/evidence-storage-errors";
import { buildFinalEvidenceObjectLocator, buildQuarantineObjectLocator } from "../../evidence/application/evidence-object-keys";
import { acceptedFileMimeTypes, FileValidationError, type FileEvidenceValidator, type ValidatedFileEvidence } from "../../evidence/application/file-evidence-validator";
import { MAX_EVIDENCE_FILE_BYTES, MAX_PDF_PAGES } from "../../evidence/domain/evidence";
import { ownedCase, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import { cleanupFileEvidenceStorage, type FileEvidenceCleanupStatus } from "./cleanup-file-evidence";
import {
  claimFileEvidenceValidation,
  finalizeFileEvidenceReady,
  finalizeFileEvidenceRejected,
  prepareFileEvidenceUploadGrant,
  reserveValidatedFileMetadata,
  retryStaleFileEvidenceValidation,
  type SafeFileRejectionCode,
} from "./manage-file-evidence";

export type FileEvidenceOrchestrationDependencies = ServiceDependencies & {
  storage: EvidenceStorage;
  validator: FileEvidenceValidator;
};

export type FileEvidenceProcessingResult = {
  kind: "READY" | "REJECTED";
  evidenceId: string;
  cleanupStatus: FileEvidenceCleanupStatus;
} | {
  kind: "IN_PROGRESS";
  evidenceId: string;
};

export async function issueFileEvidenceUploadGrant(
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceOrchestrationDependencies,
): Promise<EvidenceUploadGrant> {
  const prepared = await prepareFileEvidenceUploadGrant(input, deps);
  try {
    return await deps.storage.createUploadGrant({
      locator: prepared.locator,
      contentType: prepared.declaredMimeType,
      expiresAt: prepared.expiresAt,
    });
  } catch (error) {
    throw safeInfrastructureError(error);
  }
}

export async function confirmAndProcessFileEvidenceUpload(
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const claim = await claimFileEvidenceValidation(input, deps);
  if (claim.kind === "IN_PROGRESS") return { kind: "IN_PROGRESS", evidenceId: claim.evidence.id };
  if (claim.kind === "READY" || claim.kind === "REJECTED") return terminalResult(claim.kind, input, deps);
  if (!("validationToken" in claim)) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return processClaimedFileEvidenceUpload({ ...input, validationToken: claim.validationToken }, deps);
}

export async function recoverStaleFileEvidenceValidation(
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const recovery = await retryStaleFileEvidenceValidation(input, deps);
  if (recovery.kind === "IN_PROGRESS") return { kind: "IN_PROGRESS", evidenceId: recovery.evidence.id };
  if (recovery.kind === "READY" || recovery.kind === "REJECTED") return terminalResult(recovery.kind, input, deps);
  if (recovery.kind !== "RECLAIMED") throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return processClaimedFileEvidenceUpload({ ...input, validationToken: recovery.validationToken }, deps);
}

/** Internal worker boundary. The token must come from a successful persisted claim. */
export async function processClaimedFileEvidenceUpload(
  input: { caseId: string; evidenceId: string; validationToken: Date },
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const workflow = await ownedCase(deps.repository, input.caseId);
  requireDraft(workflow);
  const evidence = workflow.evidenceItems.find((item) => item.id === input.evidenceId);
  if (!evidence) throw new FraudCaseApplicationError("EVIDENCE_NOT_FOUND");
  if (evidence.kind !== "FILE" || evidence.status !== "VALIDATING" ||
      evidence.validationStartedAt?.getTime() !== input.validationToken.getTime() ||
      !evidence.uploadIdempotencyKey || !evidence.declaredMimeType) {
    throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  }

  const quarantineLocator = buildQuarantineObjectLocator(evidence.uploadIdempotencyKey);
  let bytes: Uint8Array;
  try {
    bytes = await deps.storage.readObjectBounded(quarantineLocator, MAX_EVIDENCE_FILE_BYTES);
  } catch (error) {
    if (error instanceof EvidenceStorageError && error.code === "STORAGE_OBJECT_NOT_FOUND") {
      return rejectClaim(input, "FILE_UPLOAD_NOT_FOUND", deps);
    }
    if (error instanceof EvidenceStorageError && error.code === "STORAGE_READ_LIMIT_EXCEEDED") {
      return rejectClaim(input, "FILE_TOO_LARGE", deps);
    }
    throw safeInfrastructureError(error);
  }

  let validated: ValidatedFileEvidence;
  try {
    validated = await deps.validator.validate({
      bytes,
      declaredMimeType: evidence.declaredMimeType,
      displayFilename: evidence.originalFilename ?? undefined,
    });
  } catch (error) {
    if (error instanceof FileValidationError) return rejectClaim(input, error.code, deps);
    throw new FraudCaseApplicationError("FILE_EVIDENCE_PROCESSING_FAILED");
  }
  assertValidatedResult(validated, bytes.byteLength);

  const finalLocator = buildFinalEvidenceObjectLocator({
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    sha256: validated.sha256,
  });
  const reservation = await reserveValidatedFileMetadata({
    ...input,
    sizeBytes: validated.sizeBytes,
    detectedMimeType: validated.detectedMimeType,
    sha256: validated.sha256,
    finalLocator,
  }, deps);
  if (reservation.kind === "REJECTED") return terminalResult("REJECTED", input, deps);

  try {
    const result = await deps.storage.putValidatedObject(finalLocator, bytes, validated.detectedMimeType);
    if (result.kind !== "CREATED" && result.kind !== "ALREADY_EXISTS") {
      throw new FraudCaseApplicationError("FILE_EVIDENCE_PROCESSING_FAILED");
    }
  } catch (error) {
    throw safeInfrastructureError(error);
  }

  const ready = await finalizeFileEvidenceReady({
    ...input,
    sizeBytes: validated.sizeBytes,
    detectedMimeType: validated.detectedMimeType,
    sha256: validated.sha256,
    finalLocator,
    pdfPageCount: validated.pdfPageCount,
  }, deps);
  return terminalResult("READY", { caseId: input.caseId, evidenceId: ready.id }, deps);
}

async function rejectClaim(
  input: { caseId: string; evidenceId: string; validationToken: Date },
  code: SafeFileRejectionCode,
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const rejected = await finalizeFileEvidenceRejected({ ...input, safeFailureCode: code }, deps);
  return terminalResult("REJECTED", { caseId: input.caseId, evidenceId: rejected.id }, deps);
}

async function terminalResult(
  kind: "READY" | "REJECTED",
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const cleanup = await cleanupFileEvidenceStorage(input, deps);
  return { kind, evidenceId: cleanup.evidenceId, cleanupStatus: cleanup.cleanupStatus };
}

function safeInfrastructureError(error: unknown): EvidenceStorageError | FraudCaseApplicationError {
  return error instanceof EvidenceStorageError
    ? error
    : new FraudCaseApplicationError("FILE_EVIDENCE_PROCESSING_FAILED");
}

function assertValidatedResult(validated: ValidatedFileEvidence, actualSizeBytes: number): void {
  const validPageCount = validated.detectedMimeType === "application/pdf"
    ? Number.isInteger(validated.pdfPageCount) && validated.pdfPageCount !== null && validated.pdfPageCount >= 1 && validated.pdfPageCount <= MAX_PDF_PAGES
    : validated.pdfPageCount === null;
  const valid = acceptedFileMimeTypes.some((mime) => mime === validated.detectedMimeType) &&
    Number.isInteger(validated.sizeBytes) && validated.sizeBytes === actualSizeBytes && validated.sizeBytes > 0 && validated.sizeBytes <= MAX_EVIDENCE_FILE_BYTES &&
    /^[0-9a-f]{64}$/u.test(validated.sha256) && validPageCount;
  if (!valid) throw new FraudCaseApplicationError("FILE_EVIDENCE_PROCESSING_FAILED");
}
