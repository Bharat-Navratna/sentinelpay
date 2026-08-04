import type {
  CreatePaymentWorkflowResult,
  PaymentRepository,
  ResolvePendingInterventionResult,
} from "../payment-repository";
import type {
  NewPaymentWorkflow,
  PaymentBeneficiary,
  PaymentContext,
  PaymentWorkflow,
  ResolveInterventionPersistenceCommand,
} from "../payment-types";

export type InMemoryPaymentRepositoryOptions = {
  context?: PaymentContext | null;
  beneficiaries?: PaymentBeneficiary[];
  previousSettledAccountAmountsMinor?: number[];
  previousSettledCountsByBeneficiary?: Record<string, number>;
  workflows?: PaymentWorkflow[];
  workflowToWinCreateRace?: PaymentWorkflow;
};

function cloneWorkflow(workflow: PaymentWorkflow): PaymentWorkflow {
  return structuredClone(workflow);
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly context: PaymentContext | null;
  private readonly beneficiaries: PaymentBeneficiary[];
  private readonly previousSettledAccountAmountsMinor: number[];
  private readonly previousSettledCountsByBeneficiary: Record<string, number>;
  private readonly workflowsByPaymentId = new Map<string, PaymentWorkflow>();
  private readonly paymentIdsByIdempotencyKey = new Map<string, string>();
  private workflowToWinCreateRace: PaymentWorkflow | null;

  constructor(options: InMemoryPaymentRepositoryOptions = {}) {
    this.context =
      options.context === undefined
        ? {
            customerId: "10000000-0000-4000-8000-000000000001",
            accountId: "20000000-0000-4000-8000-000000000001",
            currencyCode: "GBP",
          }
        : options.context;
    this.beneficiaries = options.beneficiaries ?? [
      {
        id: "30000000-0000-4000-8000-000000000001",
        customerId: "10000000-0000-4000-8000-000000000001",
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        customerId: "10000000-0000-4000-8000-000000000001",
      },
    ];
    this.previousSettledAccountAmountsMinor = [
      ...(options.previousSettledAccountAmountsMinor ?? [6_500]),
    ];
    this.previousSettledCountsByBeneficiary = {
      "30000000-0000-4000-8000-000000000001": 1,
      "30000000-0000-4000-8000-000000000002": 0,
      ...options.previousSettledCountsByBeneficiary,
    };
    this.workflowToWinCreateRace = options.workflowToWinCreateRace
      ? cloneWorkflow(options.workflowToWinCreateRace)
      : null;

    for (const workflow of options.workflows ?? []) {
      const stored = cloneWorkflow(workflow);
      this.workflowsByPaymentId.set(stored.payment.id, stored);
      this.paymentIdsByIdempotencyKey.set(
        stored.payment.idempotencyKey,
        stored.payment.id,
      );
    }
  }

  async loadPaymentContext(): Promise<PaymentContext | null> {
    return this.context ? { ...this.context } : null;
  }

  async findBeneficiaryById(
    beneficiaryId: string,
  ): Promise<PaymentBeneficiary | null> {
    const beneficiary = this.beneficiaries.find(
      (candidate) => candidate.id === beneficiaryId,
    );

    return beneficiary ? { ...beneficiary } : null;
  }

  async loadPreviousSettledAccountAmounts(): Promise<number[]> {
    return [...this.previousSettledAccountAmountsMinor];
  }

  async countPreviousSettledPaymentsToBeneficiary(
    _accountId: string,
    beneficiaryId: string,
  ): Promise<number> {
    return this.previousSettledCountsByBeneficiary[beneficiaryId] ?? 0;
  }

  async findPaymentWorkflowByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentWorkflow | null> {
    const paymentId = this.paymentIdsByIdempotencyKey.get(idempotencyKey);
    const workflow = paymentId
      ? this.workflowsByPaymentId.get(paymentId)
      : undefined;

    return workflow ? cloneWorkflow(workflow) : null;
  }

  async createPaymentWorkflowAtomically(
    workflow: NewPaymentWorkflow,
  ): Promise<CreatePaymentWorkflowResult> {
    if (this.workflowToWinCreateRace) {
      const winner = this.workflowToWinCreateRace;
      this.workflowToWinCreateRace = null;
      this.workflowsByPaymentId.set(winner.payment.id, winner);
      this.paymentIdsByIdempotencyKey.set(
        winner.payment.idempotencyKey,
        winner.payment.id,
      );
      return { kind: "IDEMPOTENCY_RACE" };
    }

    if (this.paymentIdsByIdempotencyKey.has(workflow.payment.idempotencyKey)) {
      return { kind: "IDEMPOTENCY_RACE" };
    }

    const stored = cloneWorkflow(workflow);
    this.workflowsByPaymentId.set(stored.payment.id, stored);
    this.paymentIdsByIdempotencyKey.set(
      stored.payment.idempotencyKey,
      stored.payment.id,
    );

    return { kind: "CREATED" };
  }

  async loadPaymentWorkflow(paymentId: string): Promise<PaymentWorkflow | null> {
    const workflow = this.workflowsByPaymentId.get(paymentId);
    return workflow ? cloneWorkflow(workflow) : null;
  }

  async resolvePendingInterventionAtomically(
    command: ResolveInterventionPersistenceCommand,
  ): Promise<ResolvePendingInterventionResult> {
    const workflow = this.workflowsByPaymentId.get(command.paymentId);

    if (
      !workflow ||
      workflow.payment.status !== "CUSTOMER_INTERVENTION" ||
      workflow.intervention?.status !== "PENDING"
    ) {
      return { kind: "CONFLICT" };
    }

    workflow.intervention.status =
      command.decision === "CANCEL" ? "CANCELLED" : "CONTINUED";
    workflow.intervention.acknowledgementConfirmed =
      command.decision === "CONTINUE";
    workflow.intervention.resolvedAt = new Date(command.resolvedAt);
    workflow.payment.status =
      command.decision === "CANCEL" ? "CANCELLED" : "SETTLED";
    workflow.payment.updatedAt = new Date(command.updatedAt);
    workflow.events.push(...structuredClone(command.events));

    return { kind: "RESOLVED" };
  }
}
