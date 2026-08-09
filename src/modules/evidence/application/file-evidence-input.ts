import { acceptedFileMimeTypes, type AcceptedFileMimeType } from "./file-evidence-validator";
import {
  evidenceCategories,
  MAX_NORMALIZED_DISPLAY_FILENAME_CHARACTERS,
  type EvidenceCategory,
} from "../domain/evidence";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DISALLOWED_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export class FileEvidenceInputError extends Error {
  readonly code = "INVALID_FILE_EVIDENCE_INPUT" as const;

  constructor() {
    super("The file evidence request is invalid.");
    this.name = "FileEvidenceInputError";
  }
}

export type NormalizedFileEvidenceInput = {
  category: EvidenceCategory;
  originalFilename: string;
  declaredMimeType: AcceptedFileMimeType;
  capturedAt: Date | null;
  uploadIdempotencyKey: string;
};

export function normalizeFileEvidenceInput(input: {
  category: unknown;
  originalFilename: unknown;
  declaredMimeType: unknown;
  capturedAt?: unknown;
  uploadIdempotencyKey: unknown;
}): NormalizedFileEvidenceInput {
  if (
    typeof input.category !== "string" ||
    !evidenceCategories.some((category) => category === input.category) ||
    typeof input.originalFilename !== "string" ||
    typeof input.declaredMimeType !== "string" ||
    !acceptedFileMimeTypes.some((mimeType) => mimeType === input.declaredMimeType) ||
    typeof input.uploadIdempotencyKey !== "string" ||
    !UUID_PATTERN.test(input.uploadIdempotencyKey)
  ) {
    throw new FileEvidenceInputError();
  }

  const originalFilename = input.originalFilename.normalize("NFC").trim();
  if (
    originalFilename.length === 0 ||
    [...originalFilename].length > MAX_NORMALIZED_DISPLAY_FILENAME_CHARACTERS ||
    DISALLOWED_CONTROL_PATTERN.test(originalFilename)
  ) {
    throw new FileEvidenceInputError();
  }

  let capturedAt: Date | null = null;
  if (input.capturedAt !== undefined && input.capturedAt !== null) {
    if (!(input.capturedAt instanceof Date) || !Number.isFinite(input.capturedAt.getTime())) {
      throw new FileEvidenceInputError();
    }
    capturedAt = new Date(input.capturedAt);
  }

  return {
    category: input.category as EvidenceCategory,
    originalFilename,
    declaredMimeType: input.declaredMimeType as AcceptedFileMimeType,
    capturedAt,
    uploadIdempotencyKey: input.uploadIdempotencyKey,
  };
}
