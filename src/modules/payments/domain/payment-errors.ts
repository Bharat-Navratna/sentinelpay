export const paymentDomainErrorCodes = [
  "INVALID_MONEY_AMOUNT",
  "INVALID_PAYMENT_TRANSITION",
  "INVALID_RISK_INPUT",
] as const;

export type PaymentDomainErrorCode =
  (typeof paymentDomainErrorCodes)[number];

const errorMessages: Record<PaymentDomainErrorCode, string> = {
  INVALID_MONEY_AMOUNT: "Payment amount is invalid.",
  INVALID_PAYMENT_TRANSITION: "Payment status transition is not permitted.",
  INVALID_RISK_INPUT: "Payment risk input is invalid.",
};

export class PaymentDomainError extends Error {
  readonly code: PaymentDomainErrorCode;

  constructor(code: PaymentDomainErrorCode) {
    super(errorMessages[code]);
    this.name = "PaymentDomainError";
    this.code = code;
  }
}
