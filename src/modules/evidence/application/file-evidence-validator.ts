export const acceptedFileMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type AcceptedFileMimeType = (typeof acceptedFileMimeTypes)[number];

export const fileValidationErrorCodes = [
  "FILE_EMPTY",
  "FILE_TOO_LARGE",
  "FILE_TYPE_UNSUPPORTED",
  "FILE_TYPE_MISMATCH",
  "PDF_INVALID",
  "PDF_PAGE_LIMIT_EXCEEDED",
] as const;

export type FileValidationErrorCode =
  (typeof fileValidationErrorCodes)[number];

const messages: Record<FileValidationErrorCode, string> = {
  FILE_EMPTY: "The evidence file is empty.",
  FILE_TOO_LARGE: "The evidence file exceeds the permitted size.",
  FILE_TYPE_UNSUPPORTED: "The evidence file type is not supported.",
  FILE_TYPE_MISMATCH: "The declared evidence type does not match its content.",
  PDF_INVALID: "The PDF evidence could not be validated.",
  PDF_PAGE_LIMIT_EXCEEDED: "The PDF evidence exceeds the permitted page count.",
};

export class FileValidationError extends Error {
  readonly code: FileValidationErrorCode;

  constructor(code: FileValidationErrorCode) {
    super(messages[code]);
    this.name = "FileValidationError";
    this.code = code;
  }
}

export type ValidatedFileEvidence = {
  detectedMimeType: AcceptedFileMimeType;
  sizeBytes: number;
  sha256: string;
  pdfPageCount: number | null;
};

export type FileEvidenceValidationInput = {
  bytes: Uint8Array;
  declaredMimeType: string;
  displayFilename?: string;
};

export interface FileEvidenceValidator {
  validate(input: FileEvidenceValidationInput): Promise<ValidatedFileEvidence>;
}
