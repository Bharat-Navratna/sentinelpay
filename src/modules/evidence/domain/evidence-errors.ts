export const evidenceDomainErrorCodes = [
  "INVALID_EVIDENCE_TRANSITION",
  "EVIDENCE_REMOVAL_NOT_ALLOWED",
  "INVALID_INLINE_EVIDENCE",
  "INVALID_EXTRACTION_TRANSITION",
  "INVALID_EXTRACTION_OUTPUT",
  "INVALID_EXTRACTION_REVIEW",
] as const;

export type EvidenceDomainErrorCode =
  (typeof evidenceDomainErrorCodes)[number];

const messages: Record<EvidenceDomainErrorCode, string> = {
  INVALID_EVIDENCE_TRANSITION: "Evidence status transition is not permitted.",
  EVIDENCE_REMOVAL_NOT_ALLOWED: "Evidence cannot be removed in its current state.",
  INVALID_INLINE_EVIDENCE: "Inline evidence is invalid.",
  INVALID_EXTRACTION_TRANSITION:
    "Evidence extraction status transition is not permitted.",
  INVALID_EXTRACTION_OUTPUT: "Evidence extraction output is invalid.",
  INVALID_EXTRACTION_REVIEW: "Evidence extraction review is invalid.",
};

export class EvidenceDomainError extends Error {
  readonly code: EvidenceDomainErrorCode;

  constructor(code: EvidenceDomainErrorCode) {
    super(messages[code]);
    this.name = "EvidenceDomainError";
    this.code = code;
  }
}
