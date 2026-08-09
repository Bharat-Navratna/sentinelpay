export const evidenceStorageErrorCodes = [
  "STORAGE_OBJECT_NOT_FOUND",
  "STORAGE_TEMPORARILY_UNAVAILABLE",
  "STORAGE_READ_LIMIT_EXCEEDED",
  "STORAGE_OBJECT_CHANGED",
  "STORAGE_DESTINATION_CONFLICT",
] as const;

export type EvidenceStorageErrorCode =
  (typeof evidenceStorageErrorCodes)[number];

const messages: Record<EvidenceStorageErrorCode, string> = {
  STORAGE_OBJECT_NOT_FOUND: "The evidence object could not be found.",
  STORAGE_TEMPORARILY_UNAVAILABLE: "Evidence storage is temporarily unavailable.",
  STORAGE_READ_LIMIT_EXCEEDED: "The evidence object exceeds the permitted read size.",
  STORAGE_OBJECT_CHANGED: "The evidence object changed during processing.",
  STORAGE_DESTINATION_CONFLICT: "The validated evidence destination conflicts with existing content.",
};

export class EvidenceStorageError extends Error {
  readonly code: EvidenceStorageErrorCode;

  constructor(code: EvidenceStorageErrorCode) {
    super(messages[code]);
    this.name = "EvidenceStorageError";
    this.code = code;
  }
}
