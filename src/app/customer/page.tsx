import Link from "next/link";
import { notFound } from "next/navigation";

import { getDemoCustomerDashboard } from "@/db/queries/customer-dashboard";
import {
  formatCustomerDate,
  formatCustomerMoney,
  getCustomerPaymentEventLabel,
  getCustomerPaymentStatusLabel,
} from "@/modules/payments/web/customer-payment-view";

export const dynamic = "force-dynamic";

export default async function CustomerPage() {
  const dashboard = await getDemoCustomerDashboard();

  if (!dashboard) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/">
              ← SentinelPay
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Customer dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
              Synthetic demo
            </span>
            <Link
              className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              href="/customer/payments/new"
            >
              Make a simulated payment
            </Link>
          </div>
        </header>

        <section className="mt-8 rounded-xl border border-amber-400/30 bg-amber-300/10 p-5 text-amber-50" aria-labelledby="simulation-heading">
          <h2 className="font-semibold" id="simulation-heading">Simulation only</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/80">
            All records are synthetic. No real account is connected and no real payment is sent, settled or recovered.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="customer-heading">
          <p className="text-sm font-medium text-cyan-300">Demo customer</p>
          <h2 className="mt-1 text-2xl font-semibold" id="customer-heading">
            {dashboard.customer.fullName}
          </h2>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div><p className="text-sm text-slate-400">Account</p><p className="mt-1 font-medium">{dashboard.account.accountName}</p></div>
              <div><p className="text-sm text-slate-400">Currency</p><p className="mt-1 font-medium">{dashboard.account.currencyCode}</p></div>
              <div>
                <p className="text-sm text-slate-400">Opening balance</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatCustomerMoney(dashboard.account.openingBalanceMinor, dashboard.account.currencyCode)}
                </p>
              </div>
            </div>
            <p className="mt-5 border-t border-slate-800 pt-4 text-sm text-slate-500">
              This is the seeded opening balance, not a calculated live or available balance.
            </p>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="beneficiaries-heading">
          <h2 className="text-2xl font-semibold" id="beneficiaries-heading">Beneficiaries</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {dashboard.beneficiaries.map((beneficiary) => (
              <li className="rounded-xl border border-slate-800 bg-slate-900 p-5" key={beneficiary.id}>
                <h3 className="font-semibold">{beneficiary.displayName}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Sort code</dt><dd className="mt-1 text-slate-300">{beneficiary.maskedSortCode}</dd></div>
                  <div><dt className="text-slate-500">Account</dt><dd className="mt-1 text-slate-300">{beneficiary.maskedAccountNumber}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="payments-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold" id="payments-heading">Recent simulated payments</h2>
            <Link className="font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" href="/customer/payments/new">
              Make another payment →
            </Link>
          </div>
          <div className="mt-5 space-y-6">
            {dashboard.payments.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-400">
                No simulated payments have been recorded.
              </p>
            ) : null}
            {dashboard.payments.map((payment) => (
              <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6" key={payment.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      <Link className="hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" href={`/customer/payments/${payment.id}`}>
                        {payment.beneficiaryName}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">{payment.reference}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatCustomerDate(payment.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold">{formatCustomerMoney(payment.amountMinor, payment.currencyCode)}</p>
                    <p className="mt-2 inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                      {getCustomerPaymentStatusLabel(payment.status)}
                    </p>
                  </div>
                </div>

                {payment.status === "CUSTOMER_INTERVENTION" && payment.interventionStatus === "PENDING" ? (
                  <div className="mt-5 rounded-lg border border-amber-400/40 bg-amber-300/10 p-4">
                    <p className="text-sm text-amber-50/80">This simulated payment needs your review before it can continue.</p>
                    <Link className="mt-3 inline-flex font-semibold text-amber-200 hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200" href={`/customer/payments/${payment.id}/intervention`}>
                      Review payment warning →
                    </Link>
                  </div>
                ) : null}

                <div className="mt-6 border-t border-slate-800 pt-5">
                  <h4 className="font-medium">Event timeline</h4>
                  <ol className="mt-4 space-y-4 border-l border-slate-700 pl-5">
                    {payment.events.map((event) => (
                      <li key={event.id}>
                        <p className="font-medium text-slate-200">{getCustomerPaymentEventLabel(event.eventType)}</p>
                        <time className="mt-1 block text-sm text-slate-500" dateTime={event.occurredAt.toISOString()}>
                          {formatCustomerDate(event.occurredAt)}
                        </time>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-slate-700 p-5" aria-labelledby="payment-simulation-heading">
          <h2 className="font-semibold" id="payment-simulation-heading">Payment workflow is simulated</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            You can create and resolve demonstration payments, but no real bank account or payment network is connected and no real balance changes.
          </p>
        </section>
      </div>
    </main>
  );
}
