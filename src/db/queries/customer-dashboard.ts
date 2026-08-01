import { asc, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  accounts,
  beneficiaries,
  customers,
  paymentEvents,
  payments,
} from "@/db/schema";

const DEMO_CUSTOMER_EMAIL = "demo.customer@sentinelpay.local";

export type CustomerDashboard = {
  customer: {
    fullName: string;
  };
  account: {
    accountName: string;
    currencyCode: string;
    openingBalanceMinor: number;
  };
  beneficiaries: Array<{
    id: string;
    displayName: string;
    maskedAccountNumber: string;
    maskedSortCode: string;
    createdAt: Date;
  }>;
  payments: Array<{
    id: string;
    beneficiaryName: string;
    amountMinor: number;
    currencyCode: string;
    reference: string;
    status: string;
    createdAt: Date;
    events: Array<{
      id: string;
      eventType: string;
      fromStatus: string | null;
      toStatus: string;
      occurredAt: Date;
    }>;
  }>;
};

export async function getDemoCustomerDashboard(): Promise<CustomerDashboard | null> {
  const db = getDatabase();

  const [customer] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.email, DEMO_CUSTOMER_EMAIL))
    .limit(1);

  if (!customer) {
    return null;
  }

  const [account] = await db
    .select({
      id: accounts.id,
      accountName: accounts.accountName,
      currencyCode: accounts.currencyCode,
      openingBalanceMinor: accounts.openingBalanceMinor,
    })
    .from(accounts)
    .where(eq(accounts.customerId, customer.id))
    .orderBy(asc(accounts.createdAt))
    .limit(1);

  if (!account) {
    return null;
  }

  const customerBeneficiaries = await db
    .select({
      id: beneficiaries.id,
      displayName: beneficiaries.displayName,
      maskedAccountNumber: beneficiaries.maskedAccountNumber,
      maskedSortCode: beneficiaries.maskedSortCode,
      createdAt: beneficiaries.createdAt,
    })
    .from(beneficiaries)
    .where(eq(beneficiaries.customerId, customer.id))
    .orderBy(asc(beneficiaries.createdAt));

  const paymentRows = await db
    .select({
      id: payments.id,
      beneficiaryName: beneficiaries.displayName,
      amountMinor: payments.amountMinor,
      currencyCode: payments.currencyCode,
      reference: payments.reference,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(beneficiaries, eq(payments.beneficiaryId, beneficiaries.id))
    .where(eq(payments.accountId, account.id))
    .orderBy(desc(payments.createdAt));

  const eventRows = paymentRows.length
    ? await db
        .select({
          id: paymentEvents.id,
          paymentId: paymentEvents.paymentId,
          eventType: paymentEvents.eventType,
          fromStatus: paymentEvents.fromStatus,
          toStatus: paymentEvents.toStatus,
          occurredAt: paymentEvents.occurredAt,
        })
        .from(paymentEvents)
        .where(
          inArray(
            paymentEvents.paymentId,
            paymentRows.map((payment) => payment.id),
          ),
        )
        .orderBy(asc(paymentEvents.occurredAt))
    : [];

  return {
    customer: { fullName: customer.fullName },
    account: {
      accountName: account.accountName,
      currencyCode: account.currencyCode,
      openingBalanceMinor: account.openingBalanceMinor,
    },
    beneficiaries: customerBeneficiaries,
    payments: paymentRows.map((payment) => ({
      ...payment,
      events: eventRows
        .filter((event) => event.paymentId === payment.id)
        .map((event) => ({
          id: event.id,
          eventType: event.eventType,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          occurredAt: event.occurredAt,
        })),
    })),
  };
}
