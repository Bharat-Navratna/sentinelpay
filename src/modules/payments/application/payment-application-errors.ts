export const paymentApplicationErrorCodes = [
  "PAYMENT_CONTEXT_NOT_FOUND",
  "BENEFICIARY_NOT_FOUND",
  "BENEFICIARY_NOT_OWNED",
  "PAYMENT_IDEMPOTENCY_CONFLICT",
  "PAYMENT_NOT_FOUND",
  "INTERVENTION_NOT_FOUND",
  "INTERVENTION_ACKNOWLEDGEMENT_REQUIRED",
  "INTERVENTION_ALREADY_RESOLVED",
  "INVALID_INTERVENTION_STATE",
  "PAYMENT_PERSISTENCE_CONFLICT",
  "INVALID_PAYMENT_REFERENCE",
  "INVALID_IDEMPOTENCY_KEY",
  "UNSUPPORTED_PAYMENT_CURRENCY",
] as const;

export type PaymentApplicationErrorCode =
  (typeof paymentApplicationErrorCodes)[number];

const messages: Record<PaymentApplicationErrorCode, string> = {
  PAYMENT_CONTEXT_NOT_FOUND: "The simulated payment context is unavailable.",
  BENEFICIARY_NOT_FOUND: "The selected beneficiary was not found.",
  BENEFICIARY_NOT_OWNED: "The selected beneficiary is unavailable for this customer.",
  PAYMENT_IDEMPOTENCY_CONFLICT: "This payment request conflicts with an earlier request.",
  PAYMENT_NOT_FOUND: "The simulated payment was not found.",
  INTERVENTION_NOT_FOUND: "The payment intervention was not found.",
  INTERVENTION_ACKNOWLEDGEMENT_REQUIRED: "Acknowledgement is required before continuing.",
  INTERVENTION_ALREADY_RESOLVED: "The payment intervention has already been resolved differently.",
  INVALID_INTERVENTION_STATE: "The payment intervention cannot be resolved from its current state.",
  PAYMENT_PERSISTENCE_CONFLICT: "The simulated payment could not be recorded safely.",
  INVALID_PAYMENT_REFERENCE: "The payment reference is invalid.",
  INVALID_IDEMPOTENCY_KEY: "The payment request identifier is invalid.",
  UNSUPPORTED_PAYMENT_CURRENCY: "The account currency is unsupported for this payment.",
};

export class PaymentApplicationError extends Error {
  readonly code: PaymentApplicationErrorCode;

  constructor(code: PaymentApplicationErrorCode) {
    super(messages[code]);
    this.name = "PaymentApplicationError";
    this.code = code;
  }
}
