import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerPaymentFormContext } from "@/db/queries/customer-payments";
import { formatCustomerMoney } from "@/modules/payments/web/customer-payment-view";
import { createInitialPaymentFormState } from "@/modules/payments/web/payment-form";

import { PaymentForm } from "./payment-form";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const context = await getCustomerPaymentFormContext();

  if (!context) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10">
        <Link
          className="text-sm text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          href="/customer"
        >
          ← Customer dashboard
        </Link>

        <header className="mt-6">
          <p className="text-sm font-medium text-cyan-300">Simulated payment</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Make a payment
          </h1>
          <p className="mt-4 leading-7 text-slate-400">
            No real money will move. This portfolio demonstration records only
            synthetic payment states and deterministic risk checks.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="account-heading">
          <h2 className="font-semibold" id="account-heading">Source account</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-slate-500">Account</dt>
              <dd className="mt-1">{context.account.accountName}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Currency</dt>
              <dd className="mt-1">{context.account.currencyCode}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Opening balance</dt>
              <dd className="mt-1">
                {formatCustomerMoney(
                  context.account.openingBalanceMinor,
                  context.account.currencyCode,
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-500">
            This is seeded opening-balance context, not a calculated available balance.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="payment-heading">
          <h2 className="text-xl font-semibold" id="payment-heading">Payment details</h2>
          <PaymentForm
            beneficiaries={context.beneficiaries}
            initialState={createInitialPaymentFormState(randomUUID())}
          />
        </section>
      </div>
    </main>
  );
}
