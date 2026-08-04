import { and, asc, count, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getDatabase } from "@/db/client";
import {
  accounts,
  beneficiaries,
  customers,
  paymentEvents,
  paymentInterventions,
  paymentRiskAssessments,
  payments,
} from "@/db/schema";

import { PaymentApplicationError } from "../application/payment-application-errors";
import type {
  CreatePaymentWorkflowResult,
  PaymentRepository,
  ResolvePendingInterventionResult,
} from "../application/payment-repository";
import type {
  NewPaymentWorkflow,
  PaymentEventType,
  PaymentWorkflow,
  ResolveInterventionPersistenceCommand,
} from "../application/payment-types";
import { paymentEventTypes } from "../application/payment-types";
import type * as schema from "@/db/schema";

const DEMO_CUSTOMER_EMAIL = "demo.customer@sentinelpay.local";
const IDEMPOTENCY_INDEX_NAME = "payments_idempotency_key_idx";

type Database = NeonHttpDatabase<typeof schema>;

type DatabaseErrorShape = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdempotencyUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && isObject(current); depth += 1) {
    const shapedError = current as DatabaseErrorShape;

    if (
      shapedError.code === "23505" &&
      shapedError.constraint === IDEMPOTENCY_INDEX_NAME
    ) {
      return true;
    }

    current = shapedError.cause;
  }

  return false;
}

function isPaymentEventType(value: string): value is PaymentEventType {
  return (paymentEventTypes as readonly string[]).includes(value);
}

export class DrizzlePaymentRepository implements PaymentRepository {
  private readonly db: Database;

  constructor(database: Database = getDatabase()) {
    this.db = database;
  }

  async loadPaymentContext() {
    const [context] = await this.db
      .select({
        customerId: customers.id,
        accountId: accounts.id,
        currencyCode: accounts.currencyCode,
      })
      .from(customers)
      .innerJoin(accounts, eq(accounts.customerId, customers.id))
      .where(eq(customers.email, DEMO_CUSTOMER_EMAIL))
      .orderBy(asc(accounts.createdAt))
      .limit(1);

    return context ?? null;
  }

  async findBeneficiaryById(beneficiaryId: string) {
    const [beneficiary] = await this.db
      .select({ id: beneficiaries.id, customerId: beneficiaries.customerId })
      .from(beneficiaries)
      .where(eq(beneficiaries.id, beneficiaryId))
      .limit(1);

    return beneficiary ?? null;
  }

  async loadPreviousSettledAccountAmounts(accountId: string): Promise<number[]> {
    const rows = await this.db
      .select({ amountMinor: payments.amountMinor })
      .from(payments)
      .where(and(eq(payments.accountId, accountId), eq(payments.status, "SETTLED")));

    return rows.map((row) => row.amountMinor);
  }

  async countPreviousSettledPaymentsToBeneficiary(
    accountId: string,
    beneficiaryId: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(payments)
      .where(
        and(
          eq(payments.accountId, accountId),
          eq(payments.beneficiaryId, beneficiaryId),
          eq(payments.status, "SETTLED"),
        ),
      );

    return result?.value ?? 0;
  }

  async findPaymentWorkflowByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentWorkflow | null> {
    const [payment] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);

    return payment ? this.loadPaymentWorkflow(payment.id) : null;
  }

  async createPaymentWorkflowAtomically(
    workflow: NewPaymentWorkflow,
  ): Promise<CreatePaymentWorkflowResult> {
    const paymentInsert = this.db.insert(payments).values(workflow.payment);
    const assessmentInsert = this.db
      .insert(paymentRiskAssessments)
      .values(workflow.riskAssessment);
    const eventInsert = this.db.insert(paymentEvents).values(workflow.events);

    try {
      if (workflow.intervention) {
        await this.db.batch([
          paymentInsert,
          assessmentInsert,
          this.db.insert(paymentInterventions).values(workflow.intervention),
          eventInsert,
        ]);
      } else {
        await this.db.batch([paymentInsert, assessmentInsert, eventInsert]);
      }

      return { kind: "CREATED" };
    } catch (error) {
      if (isIdempotencyUniqueViolation(error)) {
        return { kind: "IDEMPOTENCY_RACE" };
      }

      throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
    }
  }

  async loadPaymentWorkflow(paymentId: string): Promise<PaymentWorkflow | null> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      return null;
    }

    const [assessmentRows, interventionRows, events] = await Promise.all([
      this.db
        .select()
        .from(paymentRiskAssessments)
        .where(eq(paymentRiskAssessments.paymentId, paymentId))
        .limit(1),
      this.db
        .select()
        .from(paymentInterventions)
        .where(eq(paymentInterventions.paymentId, paymentId))
        .limit(1),
      this.db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.paymentId, paymentId))
        .orderBy(asc(paymentEvents.occurredAt), asc(paymentEvents.id)),
    ]);
    const assessment = assessmentRows[0];

    if (!assessment) {
      throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
    }

    const mappedEvents = events.map((event) => {
      if (!isPaymentEventType(event.eventType)) {
        throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
      }

      return { ...event, eventType: event.eventType };
    });

    return {
      payment,
      riskAssessment: assessment,
      intervention: interventionRows[0] ?? null,
      events: mappedEvents,
    };
  }

  async resolvePendingInterventionAtomically(
    command: ResolveInterventionPersistenceCommand,
  ): Promise<ResolvePendingInterventionResult> {
    const firstEvent = command.events[0];

    if (!firstEvent) {
      throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
    }

    if (command.decision === "CANCEL") {
      const cancellation = this.db.execute(sql`
        with eligible_payment as materialized (
          select ${payments.id} as id
          from ${payments}
          where ${payments.id} = ${command.paymentId}
            and ${payments.status} = 'CUSTOMER_INTERVENTION'
          for update
        ), updated_intervention as (
          update ${paymentInterventions}
          set "status" = 'CANCELLED',
              "acknowledgement_confirmed" = false,
              "resolved_at" = ${command.resolvedAt}
          where ${paymentInterventions.paymentId} in (select id from eligible_payment)
            and ${paymentInterventions.status} = 'PENDING'
          returning ${paymentInterventions.paymentId}
        ), transitioned_payment as (
          update ${payments}
          set "status" = 'CANCELLED',
              "updated_at" = ${command.updatedAt}
          where ${payments.id} in (select payment_id from updated_intervention)
            and ${payments.status} = 'CUSTOMER_INTERVENTION'
          returning ${payments.id}
        )
        insert into ${paymentEvents} (
          "id", "payment_id", "event_type",
          "from_status", "to_status",
          "metadata", "occurred_at"
        )
        select ${firstEvent.id}, id, ${firstEvent.eventType},
               'CUSTOMER_INTERVENTION', 'CANCELLED',
               ${JSON.stringify(firstEvent.metadata)}::jsonb, ${firstEvent.occurredAt}
        from transitioned_payment
      `);

      try {
        await this.db.batch([cancellation]);
      } catch {
        throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
      }
    } else {
      const settledEvent = command.events[1];

      if (!settledEvent) {
        throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
      }

      const continuation = this.db.execute(sql`
        with eligible_payment as materialized (
          select ${payments.id} as id
          from ${payments}
          where ${payments.id} = ${command.paymentId}
            and ${payments.status} = 'CUSTOMER_INTERVENTION'
          for update
        ), updated_intervention as (
          update ${paymentInterventions}
          set "status" = 'CONTINUED',
              "acknowledgement_confirmed" = true,
              "resolved_at" = ${command.resolvedAt}
          where ${paymentInterventions.paymentId} in (select id from eligible_payment)
            and ${paymentInterventions.status} = 'PENDING'
          returning ${paymentInterventions.paymentId}
        ), transitioned_payment as (
          update ${payments}
          set "status" = 'AUTHORISED',
              "updated_at" = ${firstEvent.occurredAt}
          where ${payments.id} in (select payment_id from updated_intervention)
            and ${payments.status} = 'CUSTOMER_INTERVENTION'
          returning ${payments.id}
        )
        insert into ${paymentEvents} (
          "id", "payment_id", "event_type",
          "from_status", "to_status",
          "metadata", "occurred_at"
        )
        select ${firstEvent.id}, id, ${firstEvent.eventType},
               'CUSTOMER_INTERVENTION', 'AUTHORISED',
               ${JSON.stringify(firstEvent.metadata)}::jsonb, ${firstEvent.occurredAt}
        from transitioned_payment
      `);
      const settlement = this.db.execute(sql`
        with transitioned_payment as (
          update ${payments}
          set "status" = 'SETTLED',
              "updated_at" = ${command.updatedAt}
          where ${payments.id} = ${command.paymentId}
            and ${payments.status} = 'AUTHORISED'
            and exists (
              select 1 from ${paymentEvents}
              where ${paymentEvents.id} = ${firstEvent.id}
                and ${paymentEvents.paymentId} = ${command.paymentId}
            )
          returning ${payments.id}
        )
        insert into ${paymentEvents} (
          "id", "payment_id", "event_type",
          "from_status", "to_status",
          "metadata", "occurred_at"
        )
        select ${settledEvent.id}, id, ${settledEvent.eventType},
               'AUTHORISED', 'SETTLED',
               ${JSON.stringify(settledEvent.metadata)}::jsonb, ${settledEvent.occurredAt}
        from transitioned_payment
      `);

      try {
        await this.db.batch([continuation, settlement]);
      } catch {
        throw new PaymentApplicationError("PAYMENT_PERSISTENCE_CONFLICT");
      }
    }

    const resolvedWorkflow = await this.loadPaymentWorkflow(command.paymentId);
    const expectedInterventionStatus =
      command.decision === "CANCEL" ? "CANCELLED" : "CONTINUED";
    const expectedPaymentStatus =
      command.decision === "CANCEL" ? "CANCELLED" : "SETTLED";

    return resolvedWorkflow?.intervention?.status === expectedInterventionStatus &&
      resolvedWorkflow.payment.status === expectedPaymentStatus
      ? { kind: "RESOLVED" }
      : { kind: "CONFLICT" };
  }
}
