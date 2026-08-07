export const fraudCaseDomainErrorCodes = [
  "INVALID_FRAUD_CASE_TRANSITION",
  "PAYMENT_NOT_REPORTABLE",
  "INVALID_SCAM_REPORT",
] as const;

export type FraudCaseDomainErrorCode =
  (typeof fraudCaseDomainErrorCodes)[number];

const messages: Record<FraudCaseDomainErrorCode, string> = {
  INVALID_FRAUD_CASE_TRANSITION:
    "Fraud case status transition is not permitted.",
  PAYMENT_NOT_REPORTABLE: "The simulated payment is not reportable.",
  INVALID_SCAM_REPORT: "The scam report is invalid.",
};

export class FraudCaseDomainError extends Error {
  readonly code: FraudCaseDomainErrorCode;

  constructor(code: FraudCaseDomainErrorCode) {
    super(messages[code]);
    this.name = "FraudCaseDomainError";
    this.code = code;
  }
}
