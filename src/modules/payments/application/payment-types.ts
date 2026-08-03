import type {
  PaymentRiskDecision,
  PaymentRiskReasonCode,
  PaymentRiskResult,
} from "../domain/payment-risk";
import type { PaymentStatus } from "../domain/payment-state-machine";

export const PAYMENT_INTERVENTION_COPY_VERSION = "payment-warning-v1" as const;

export type PaymentInterventionStatus = "PENDING" | "CANCELLED" | "CONTINUED";
export type PaymentInterventionDecision = "CANCEL" | "CONTINUE";
export const paymentEventTypes = [
  "PAYMENT_CREATED",
  "RISK_REVIEW_STARTED",
  "PAYMENT_AUTHORISED",
  "PAYMENT_SETTLED",
  "CUSTOMER_INTERVENTION_REQUIRED",
  "CUSTOMER_CANCELLED_PAYMENT",
  "CUSTOMER_CONTINUED_PAYMENT",
] as const;

export type PaymentEventType = (typeof paymentEventTypes)[number];

export type PaymentContext = {
  customerId: string;
  accountId: string;
  currencyCode: string;
};

export type PaymentBeneficiary = {
  id: string;
  customerId: string;
};

export type CanonicalPaymentPayload = {
  accountId: string;
  beneficiaryId: string;
  amountMinor: number;
  currencyCode: string;
  reference: string;
};

export type PaymentRecord = CanonicalPaymentPayload & {
  id: string;
  idempotencyKey: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentRiskAssessmentRecord = {
  id: string;
  paymentId: string;
  decision: PaymentRiskDecision;
  score: number;
  reasonCodes: PaymentRiskReasonCode[];
  facts: PaymentRiskResult["internalFacts"];
  ruleVersion: string;
  evaluatedAt: Date;
};

export type PaymentInterventionRecord = {
  id: string;
  paymentId: string;
  status: PaymentInterventionStatus;
  copyVersion: string;
  acknowledgementConfirmed: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type PaymentEventRecord = {
  id: string;
  paymentId: string;
  eventType: PaymentEventType;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type PaymentWorkflow = {
  payment: PaymentRecord;
  riskAssessment: PaymentRiskAssessmentRecord;
  intervention: PaymentInterventionRecord | null;
  events: PaymentEventRecord[];
};

export type NewPaymentWorkflow = PaymentWorkflow;

export type ResolveInterventionPersistenceCommand = {
  paymentId: string;
  decision: PaymentInterventionDecision;
  acknowledgementConfirmed: boolean;
  resolvedAt: Date;
  updatedAt: Date;
  events: PaymentEventRecord[];
};
