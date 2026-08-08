export const fraudCaseApplicationErrorCodes = [
  "FRAUD_CASE_CONTEXT_NOT_FOUND", "PAYMENT_NOT_FOUND", "PAYMENT_NOT_OWNED",
  "FRAUD_CASE_NOT_FOUND", "FRAUD_CASE_ALREADY_SUBMITTED", "REPORT_STALE",
  "REPORT_INCOMPLETE", "EVIDENCE_LIMIT_REACHED", "EVIDENCE_NOT_FOUND",
  "EVIDENCE_IDEMPOTENCY_CONFLICT", "EXTRACTION_NOT_FOUND",
  "EXTRACTION_IDEMPOTENCY_CONFLICT",
  "EXTRACTION_ALREADY_COMPLETED", "EXTRACTION_REVIEW_ALREADY_EXISTS",
  "EXTRACTION_HASH_MISMATCH", "CASE_SUBMISSION_BLOCKED",
  "FRAUD_CASE_PERSISTENCE_CONFLICT",
] as const;
export type FraudCaseApplicationErrorCode = typeof fraudCaseApplicationErrorCodes[number];

const messages: Record<FraudCaseApplicationErrorCode, string> = {
  FRAUD_CASE_CONTEXT_NOT_FOUND: "The customer case context is unavailable.",
  PAYMENT_NOT_FOUND: "The simulated payment was not found.",
  PAYMENT_NOT_OWNED: "The simulated payment is not available for this customer.",
  FRAUD_CASE_NOT_FOUND: "The fraud case was not found.",
  FRAUD_CASE_ALREADY_SUBMITTED: "The fraud case has already been submitted.",
  REPORT_STALE: "The report has changed. Reload it before saving again.",
  REPORT_INCOMPLETE: "The report is not ready for submission.",
  EVIDENCE_LIMIT_REACHED: "The evidence item limit has been reached.",
  EVIDENCE_NOT_FOUND: "The evidence item was not found.",
  EVIDENCE_IDEMPOTENCY_CONFLICT: "The evidence request conflicts with an earlier request.",
  EXTRACTION_NOT_FOUND: "The extraction run was not found.",
  EXTRACTION_IDEMPOTENCY_CONFLICT: "The extraction request conflicts with an earlier request.",
  EXTRACTION_ALREADY_COMPLETED: "A completed extraction already exists for this evidence.",
  EXTRACTION_REVIEW_ALREADY_EXISTS: "The extraction has already been reviewed.",
  EXTRACTION_HASH_MISMATCH: "The evidence version does not match the extraction request.",
  CASE_SUBMISSION_BLOCKED: "The fraud case cannot be submitted in its current state.",
  FRAUD_CASE_PERSISTENCE_CONFLICT: "The fraud case could not be saved safely.",
};
export class FraudCaseApplicationError extends Error {
  readonly code: FraudCaseApplicationErrorCode;
  constructor(code: FraudCaseApplicationErrorCode) {
    super(messages[code]); this.name = "FraudCaseApplicationError"; this.code = code;
  }
}
