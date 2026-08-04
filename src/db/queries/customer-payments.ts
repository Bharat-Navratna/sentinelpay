import { asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { accounts, beneficiaries, customers, payments } from "@/db/schema";
import type { PaymentWorkflow } from "@/modules/payments/application/payment-types";
import { DrizzlePaymentRepository } from "@/modules/payments/infrastructure/drizzle-payment-repository";

const DEMO_CUSTOMER_EMAIL = "demo.customer@sentinelpay.local";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CustomerPaymentFormContext = {
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
  }>;
};

export type CustomerPaymentSource = {
  workflow: PaymentWorkflow;
  beneficiaryName: string;
};

export async function getCustomerPaymentFormContext(): Promise<CustomerPaymentFormContext | null> {
  const db = getDatabase();
  const [account] = await db
    .select({
      customerId: customers.id,
      accountName: accounts.accountName,
      currencyCode: accounts.currencyCode,
      openingBalanceMinor: accounts.openingBalanceMinor,
    })
    .from(customers)
    .innerJoin(accounts, eq(accounts.customerId, customers.id))
    .where(eq(customers.email, DEMO_CUSTOMER_EMAIL))
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
    })
    .from(beneficiaries)
    .where(eq(beneficiaries.customerId, account.customerId))
    .orderBy(asc(beneficiaries.createdAt));

  return {
    account: {
      accountName: account.accountName,
      currencyCode: account.currencyCode,
      openingBalanceMinor: account.openingBalanceMinor,
    },
    beneficiaries: customerBeneficiaries,
  };
}

export async function getCustomerPaymentSource(
  paymentId: string,
): Promise<CustomerPaymentSource | null> {
  if (!UUID_PATTERN.test(paymentId)) {
    return null;
  }

  const db = getDatabase();
  const [ownedPayment] = await db
    .select({
      accountId: accounts.id,
      beneficiaryName: beneficiaries.displayName,
    })
    .from(payments)
    .innerJoin(accounts, eq(payments.accountId, accounts.id))
    .innerJoin(customers, eq(accounts.customerId, customers.id))
    .innerJoin(beneficiaries, eq(payments.beneficiaryId, beneficiaries.id))
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!ownedPayment) {
    return null;
  }

  const [demoContext] = await db
    .select({ accountId: accounts.id })
    .from(customers)
    .innerJoin(accounts, eq(accounts.customerId, customers.id))
    .where(eq(customers.email, DEMO_CUSTOMER_EMAIL))
    .orderBy(asc(accounts.createdAt))
    .limit(1);

  if (!demoContext || ownedPayment.accountId !== demoContext.accountId) {
    return null;
  }

  const workflow = await new DrizzlePaymentRepository(db).loadPaymentWorkflow(
    paymentId,
  );

  return workflow
    ? { workflow, beneficiaryName: ownedPayment.beneficiaryName }
    : null;
}
