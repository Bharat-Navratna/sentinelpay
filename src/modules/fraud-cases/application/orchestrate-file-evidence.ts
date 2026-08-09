import type { EvidenceStorage, EvidenceUploadGrant } from "../../evidence/application/evidence-storage";
import { EvidenceStorageError } from "../../evidence/application/evidence-storage-errors";
import { buildFinalEvidenceObjectLocator, buildQuarantineObjectLocator } from "../../evidence/application/evidence-object-keys";
import { acceptedFileMimeTypes, FileValidationError, type FileEvidenceValidator, type ValidatedFileEvidence } from "../../evidence/application/file-evidence-validator";
import { MAX_EVIDENCE_FILE_BYTES, MAX_PDF_PAGES } from "../../evidence/domain/evidence";
import { ownedCase, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import {
  claimFileEvidenceValidation,
  finalizeFileEvidenceReady,
  finalizeFileEvidenceRejected,
  prepareFileEvidenceUploadGrant,
  reserveValidatedFileMetadata,
  type SafeFileRejectionCode,
} from "./manage-file-evidence";

export type FileEvidenceOrchestrationDependencies = ServiceDependencies & {
  storage: EvidenceStorage;
  validator: FileEvidenceValidator;
};

export type FileEvidenceProcessingResult = {
  kind: "READY" | "REJECTED" | "IN_PROGRESS";
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
  if (claim.kind === "IN_PROGRESS" || claim.kind === "READY" || claim.kind === "REJECTED") {
    return { kind: claim.kind, evidenceId: claim.evidence.id };
  }
  if (!("validationToken" in claim)) throw new FraudCaseApplicationError("EVIDENCE_VALIDATION_CONFLICT");
  return processClaimedFileEvidenceUpload({ ...input, validationToken: claim.validationToken }, deps);
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
  if (reservation.kind === "REJECTED") return { kind: "REJECTED", evidenceId: reservation.evidence.id };

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
  return { kind: "READY", evidenceId: ready.id };
}

async function rejectClaim(
  input: { caseId: string; evidenceId: string; validationToken: Date },
  code: SafeFileRejectionCode,
  deps: FileEvidenceOrchestrationDependencies,
): Promise<FileEvidenceProcessingResult> {
  const rejected = await finalizeFileEvidenceRejected({ ...input, safeFailureCode: code }, deps);
  return { kind: "REJECTED", evidenceId: rejected.id };
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
