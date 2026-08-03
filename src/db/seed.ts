import { config } from "dotenv";
import { count, eq, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { getDemoCustomerDashboard } from "./queries/customer-dashboard";
import {
  accounts,
  beneficiaries,
  customers,
  paymentEvents,
  paymentInterventions,
  paymentRiskAssessments,
  payments,
} from "./schema";

config({ path: ".env.local", quiet: true });

const ids = {
  customer: "10000000-0000-4000-8000-000000000001",
  account: "20000000-0000-4000-8000-000000000001",
  danceStudio: "30000000-0000-4000-8000-000000000001",
  apexCapital: "30000000-0000-4000-8000-000000000002",
  historicalPayment: "40000000-0000-4000-8000-000000000001",
  createdEvent: "50000000-0000-4000-8000-000000000001",
  riskReviewEvent: "50000000-0000-4000-8000-000000000004",
  authorisedEvent: "50000000-0000-4000-8000-000000000002",
  settledEvent: "50000000-0000-4000-8000-000000000003",
  riskAssessment: "60000000-0000-4000-8000-000000000001",
} as const;

async function seed(): Promise<void> {
  const db = getDatabase();

  await db
    .insert(customers)
    .values({
      id: ids.customer,
      fullName: "Bharat Demo",
      email: "demo.customer@sentinelpay.local",
      createdAt: new Date("2026-07-01T09:00:00.000Z"),
      updatedAt: new Date("2026-07-01T09:00:00.000Z"),
    })
    .onConflictDoNothing();

  await db
    .insert(accounts)
    .values({
      id: ids.account,
      customerId: ids.customer,
      accountName: "Everyday Account",
      currencyCode: "GBP",
      openingBalanceMinor: 1_250_000,
      createdAt: new Date("2026-07-01T09:05:00.000Z"),
    })
    .onConflictDoNothing();

  await db
    .insert(beneficiaries)
    .values([
      {
        id: ids.danceStudio,
        customerId: ids.customer,
        displayName: "London Dance Studio",
        maskedAccountNumber: "•••• 1842",
        maskedSortCode: "••-••-41",
        createdAt: new Date("2026-07-02T10:00:00.000Z"),
      },
      {
        id: ids.apexCapital,
        customerId: ids.customer,
        displayName: "Apex Capital",
        maskedAccountNumber: "•••• 7306",
        maskedSortCode: "••-••-19",
        createdAt: new Date("2026-07-28T14:00:00.000Z"),
      },
    ])
    .onConflictDoNothing();

  // This targeted upsert corrects only the stable development fixture. It is
  // not a production mechanism for rewriting payment or audit history.
  await db
    .insert(payments)
    .values({
      id: ids.historicalPayment,
      accountId: ids.account,
      beneficiaryId: ids.danceStudio,
      amountMinor: 6_500,
      currencyCode: "GBP",
      reference: "Dance class",
      status: "SETTLED",
      idempotencyKey: "demo-historical-dance-class-2026-07",
      createdAt: new Date("2026-07-20T17:30:00.000Z"),
      updatedAt: new Date("2026-07-20T17:31:00.000Z"),
    })
    .onConflictDoUpdate({
      target: payments.id,
      set: {
        accountId: ids.account,
        beneficiaryId: ids.danceStudio,
        amountMinor: 6_500,
        currencyCode: "GBP",
        reference: "Dance class",
        status: "SETTLED",
        idempotencyKey: "demo-historical-dance-class-2026-07",
        createdAt: new Date("2026-07-20T17:30:00.000Z"),
        updatedAt: new Date("2026-07-20T17:30:00.003Z"),
      },
    });

  await db
    .insert(paymentRiskAssessments)
    .values({
      id: ids.riskAssessment,
      paymentId: ids.historicalPayment,
      decision: "ALLOW",
      score: 0,
      reasonCodes: [],
      facts: {
        previousSettledPaymentCount: 1,
        previousSettledPaymentCountToBeneficiary: 1,
        medianSettledAmountMinor: 6_500,
        amountOutlierThresholdMinor: 50_000,
        matchedInvestmentTerms: [],
      },
      ruleVersion: "deterministic-v1",
      evaluatedAt: new Date("2026-07-20T17:30:00.001Z"),
    })
    .onConflictDoUpdate({
      target: paymentRiskAssessments.id,
      set: {
        paymentId: ids.historicalPayment,
        decision: "ALLOW",
        score: 0,
        reasonCodes: [],
        facts: {
          previousSettledPaymentCount: 1,
          previousSettledPaymentCountToBeneficiary: 1,
          medianSettledAmountMinor: 6_500,
          amountOutlierThresholdMinor: 50_000,
          matchedInvestmentTerms: [],
        },
        ruleVersion: "deterministic-v1",
        evaluatedAt: new Date("2026-07-20T17:30:00.001Z"),
      },
    });

  await db
    .insert(paymentEvents)
    .values([
      {
        id: ids.createdEvent,
        paymentId: ids.historicalPayment,
        eventType: "PAYMENT_CREATED",
        fromStatus: null,
        toStatus: "CREATED",
        occurredAt: new Date("2026-07-20T17:30:00.000Z"),
      },
      {
        id: ids.riskReviewEvent,
        paymentId: ids.historicalPayment,
        eventType: "RISK_REVIEW_STARTED",
        fromStatus: "CREATED",
        toStatus: "RISK_REVIEW",
        metadata: {
          riskAssessmentId: ids.riskAssessment,
          ruleVersion: "deterministic-v1",
          simulation: true,
        },
        occurredAt: new Date("2026-07-20T17:30:00.001Z"),
      },
      {
        id: ids.authorisedEvent,
        paymentId: ids.historicalPayment,
        eventType: "PAYMENT_AUTHORISED",
        fromStatus: "RISK_REVIEW",
        toStatus: "AUTHORISED",
        metadata: {
          riskAssessmentId: ids.riskAssessment,
          ruleVersion: "deterministic-v1",
          simulation: true,
        },
        occurredAt: new Date("2026-07-20T17:30:00.002Z"),
      },
      {
        id: ids.settledEvent,
        paymentId: ids.historicalPayment,
        eventType: "PAYMENT_SETTLED",
        fromStatus: "AUTHORISED",
        toStatus: "SETTLED",
        metadata: { simulation: true },
        occurredAt: new Date("2026-07-20T17:30:00.003Z"),
      },
    ])
    .onConflictDoUpdate({
      target: paymentEvents.id,
      set: {
        paymentId: sql`excluded.payment_id`,
        eventType: sql`excluded.event_type`,
        fromStatus: sql`excluded.from_status`,
        toStatus: sql`excluded.to_status`,
        metadata: sql`excluded.metadata`,
        occurredAt: sql`excluded.occurred_at`,
      },
    });

  const dashboard = await getDemoCustomerDashboard();
  const seededPayment = dashboard?.payments[0];
  const [assessmentCount] = await db
    .select({ value: count() })
    .from(paymentRiskAssessments)
    .where(eq(paymentRiskAssessments.paymentId, ids.historicalPayment));
  const [interventionCount] = await db
    .select({ value: count() })
    .from(paymentInterventions)
    .where(eq(paymentInterventions.paymentId, ids.historicalPayment));

  if (
    !dashboard ||
    dashboard.beneficiaries.length !== 2 ||
    dashboard.payments.length !== 1 ||
    !seededPayment ||
    seededPayment.events.length !== 4 ||
    assessmentCount?.value !== 1 ||
    interventionCount?.value !== 0
  ) {
    throw new Error("Synthetic dashboard seed verification failed.");
  }

  console.log("Synthetic dashboard seed completed and verified:", {
    customer: dashboard.customer.fullName,
    account: dashboard.account.accountName,
    openingBalanceMinor: dashboard.account.openingBalanceMinor,
    beneficiaryCount: dashboard.beneficiaries.length,
    paymentCount: dashboard.payments.length,
    paymentAmountMinor: seededPayment.amountMinor,
    paymentStatus: seededPayment.status,
    eventTypes: seededPayment.events.map((event) => event.eventType),
  });
}

seed().catch(() => {
  console.error("Synthetic dashboard seed failed.");
  process.exitCode = 1;
});
