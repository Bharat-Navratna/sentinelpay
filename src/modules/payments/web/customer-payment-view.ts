import type {
  PaymentEventType,
  PaymentWorkflow,
} from "../application/payment-types";
import type { PaymentStatus } from "../domain/payment-state-machine";

export type CustomerPaymentTimelineItem = {
  id: string;
  label: string;
  occurredAt: Date;
  occurredAtLabel: string;
};

export type CustomerPaymentView = {
  paymentId: string;
  beneficiaryName: string;
  formattedAmount: string;
  currencyCode: string;
  reference: string;
  status: PaymentStatus;
  statusLabel: string;
  createdAt: Date;
  createdAtLabel: string;
  timeline: CustomerPaymentTimelineItem[];
  requiresCustomerAction: boolean;
};

const statusLabels: Record<PaymentStatus, string> = {
  CREATED: "Created",
  RISK_REVIEW: "Under demonstration review",
  CUSTOMER_INTERVENTION: "Your review is required",
  AUTHORISED: "Simulated authorisation complete",
  SETTLED: "Simulated payment completed",
  CANCELLED: "Cancelled",
  REJECTED: "Not continued",
};

const eventLabels: Record<PaymentEventType, string> = {
  PAYMENT_CREATED: "Payment created",
  RISK_REVIEW_STARTED: "Risk review started",
  PAYMENT_AUTHORISED: "Payment authorised",
  PAYMENT_SETTLED: "Simulated payment completed",
  CUSTOMER_INTERVENTION_REQUIRED: "Additional customer check required",
  CUSTOMER_CANCELLED_PAYMENT: "Customer cancelled payment",
  CUSTOMER_CONTINUED_PAYMENT: "Customer chose to continue",
};

export function formatCustomerMoney(
  amountMinor: number,
  currencyCode: string,
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
  }).format(amountMinor / 100);
}

export function formatCustomerDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

export function getCustomerPaymentStatusLabel(status: PaymentStatus): string {
  return statusLabels[status];
}

export function getCustomerPaymentEventLabel(eventType: string): string {
  return eventType in eventLabels
    ? eventLabels[eventType as PaymentEventType]
    : "Payment updated";
}

export function mapPaymentWorkflowToCustomerView(
  workflow: PaymentWorkflow,
  beneficiaryName: string,
): CustomerPaymentView {
  const timeline = [...workflow.events]
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .map((event) => ({
      id: event.id,
      label: getCustomerPaymentEventLabel(event.eventType),
      occurredAt: event.occurredAt,
      occurredAtLabel: formatCustomerDate(event.occurredAt),
    }));

  return {
    paymentId: workflow.payment.id,
    beneficiaryName,
    formattedAmount: formatCustomerMoney(
      workflow.payment.amountMinor,
      workflow.payment.currencyCode,
    ),
    currencyCode: workflow.payment.currencyCode,
    reference: workflow.payment.reference,
    status: workflow.payment.status,
    statusLabel: getCustomerPaymentStatusLabel(workflow.payment.status),
    createdAt: workflow.payment.createdAt,
    createdAtLabel: formatCustomerDate(workflow.payment.createdAt),
    timeline,
    requiresCustomerAction:
      workflow.payment.status === "CUSTOMER_INTERVENTION" &&
      workflow.intervention?.status === "PENDING",
  };
}
