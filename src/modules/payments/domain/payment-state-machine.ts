import { PaymentDomainError } from "./payment-errors";

export const paymentStatuses = [
  "CREATED",
  "RISK_REVIEW",
  "CUSTOMER_INTERVENTION",
  "AUTHORISED",
  "SETTLED",
  "CANCELLED",
  "REJECTED",
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

const allowedTransitions = {
  CREATED: ["RISK_REVIEW"],
  RISK_REVIEW: ["CUSTOMER_INTERVENTION", "AUTHORISED", "REJECTED"],
  CUSTOMER_INTERVENTION: ["AUTHORISED", "CANCELLED"],
  AUTHORISED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: [],
  REJECTED: [],
} as const satisfies Record<PaymentStatus, readonly PaymentStatus[]>;

const terminalStatuses: ReadonlySet<PaymentStatus> = new Set([
  "SETTLED",
  "CANCELLED",
  "REJECTED",
]);

export function canTransitionPayment(
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus,
): boolean {
  const permittedStatuses: readonly PaymentStatus[] =
    allowedTransitions[fromStatus];

  return permittedStatuses.includes(toStatus);
}

export function assertPaymentTransition(
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus,
): void {
  if (!canTransitionPayment(fromStatus, toStatus)) {
    throw new PaymentDomainError("INVALID_PAYMENT_TRANSITION");
  }
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return terminalStatuses.has(status);
}
