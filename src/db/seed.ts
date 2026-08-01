import { config } from "dotenv";

import { getDatabase } from "./client";
import { getDemoCustomerDashboard } from "./queries/customer-dashboard";
import {
  accounts,
  beneficiaries,
  customers,
  paymentEvents,
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
  authorisedEvent: "50000000-0000-4000-8000-000000000002",
  settledEvent: "50000000-0000-4000-8000-000000000003",
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
    .onConflictDoNothing();

  await db
    .insert(paymentEvents)
    .values([
      {
        id: ids.createdEvent,
        paymentId: ids.historicalPayment,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "CREATED",
        occurredAt: new Date("2026-07-20T17:30:00.000Z"),
      },
      {
        id: ids.authorisedEvent,
        paymentId: ids.historicalPayment,
        eventType: "AUTHORISED",
        fromStatus: "CREATED",
        toStatus: "AUTHORISED",
        occurredAt: new Date("2026-07-20T17:30:30.000Z"),
      },
      {
        id: ids.settledEvent,
        paymentId: ids.historicalPayment,
        eventType: "SETTLED",
        fromStatus: "AUTHORISED",
        toStatus: "SETTLED",
        occurredAt: new Date("2026-07-20T17:31:00.000Z"),
      },
    ])
    .onConflictDoNothing();

  const dashboard = await getDemoCustomerDashboard();
  const seededPayment = dashboard?.payments[0];

  if (
    !dashboard ||
    dashboard.beneficiaries.length !== 2 ||
    dashboard.payments.length !== 1 ||
    !seededPayment ||
    seededPayment.events.length !== 3
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
