import type {
  NewPaymentWorkflow,
  PaymentBeneficiary,
  PaymentContext,
  PaymentWorkflow,
  ResolveInterventionPersistenceCommand,
} from "./payment-types";

export type CreatePaymentWorkflowResult =
  | { kind: "CREATED" }
  | { kind: "IDEMPOTENCY_RACE" };

export type ResolvePendingInterventionResult =
  | { kind: "RESOLVED" }
  | { kind: "CONFLICT" };

export interface PaymentRepository {
  loadPaymentContext(): Promise<PaymentContext | null>;
  findBeneficiaryById(beneficiaryId: string): Promise<PaymentBeneficiary | null>;
  loadPreviousSettledAccountAmounts(accountId: string): Promise<number[]>;
  countPreviousSettledPaymentsToBeneficiary(
    accountId: string,
    beneficiaryId: string,
  ): Promise<number>;
  findPaymentWorkflowByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentWorkflow | null>;
  createPaymentWorkflowAtomically(
    workflow: NewPaymentWorkflow,
  ): Promise<CreatePaymentWorkflowResult>;
  loadPaymentWorkflow(paymentId: string): Promise<PaymentWorkflow | null>;
  resolvePendingInterventionAtomically(
    command: ResolveInterventionPersistenceCommand,
  ): Promise<ResolvePendingInterventionResult>;
}
