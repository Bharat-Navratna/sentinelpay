import Link from "next/link";
import { notFound } from "next/navigation";

import { getDemoCustomerDashboard } from "@/db/queries/customer-dashboard";

export const dynamic = "force-dynamic";

function formatMoney(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
  }).format(amountMinor / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

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
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
            Synthetic demo
          </span>
        </header>

        <section
          className="mt-8 rounded-xl border border-amber-400/30 bg-amber-300/10 p-5 text-amber-50"
          aria-labelledby="simulation-heading"
        >
          <h2 id="simulation-heading" className="font-semibold">
            Simulation only
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/80">
            All records on this page are synthetic. No real account is connected,
            and no real payment has been sent, settled or recovered.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="customer-heading">
          <p className="text-sm font-medium text-cyan-300">Demo customer</p>
          <h2 id="customer-heading" className="mt-1 text-2xl font-semibold">
            {dashboard.customer.fullName}
          </h2>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-sm text-slate-400">Account</p>
                <p className="mt-1 font-medium">{dashboard.account.accountName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Currency</p>
                <p className="mt-1 font-medium">{dashboard.account.currencyCode}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Opening balance</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(
                    dashboard.account.openingBalanceMinor,
                    dashboard.account.currencyCode,
                  )}
                </p>
              </div>
            </div>
            <p className="mt-5 border-t border-slate-800 pt-4 text-sm text-slate-500">
              This is the seeded opening balance, not a calculated live balance.
            </p>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="beneficiaries-heading">
          <h2 id="beneficiaries-heading" className="text-2xl font-semibold">
            Beneficiaries
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {dashboard.beneficiaries.map((beneficiary) => (
              <li key={beneficiary.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="font-semibold">{beneficiary.displayName}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Sort code</dt>
                    <dd className="mt-1 text-slate-300">{beneficiary.maskedSortCode}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Account</dt>
                    <dd className="mt-1 text-slate-300">
                      {beneficiary.maskedAccountNumber}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="payments-heading">
          <h2 id="payments-heading" className="text-2xl font-semibold">
            Payment history
          </h2>
          <div className="mt-5 space-y-6">
            {dashboard.payments.map((payment) => (
              <article key={payment.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{payment.beneficiaryName}</h3>
                    <p className="mt-1 text-sm text-slate-400">{payment.reference}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatDate(payment.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold">
                      {formatMoney(payment.amountMinor, payment.currencyCode)}
                    </p>
                    <p className="mt-2 inline-block rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      {payment.status}
                    </p>
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-800 pt-5">
                  <h4 className="font-medium">Event timeline</h4>
                  <ol className="mt-4 space-y-4 border-l border-slate-700 pl-5">
                    {payment.events.map((event) => (
                      <li key={event.id}>
                        <p className="font-medium text-slate-200">{event.eventType}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {event.fromStatus ? `${event.fromStatus} → ` : ""}
                          {event.toStatus} · {formatDate(event.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-slate-700 p-5" aria-labelledby="not-implemented-heading">
          <h2 id="not-implemented-heading" className="font-semibold">
            Payment creation is not implemented
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This foundation is read-only. It cannot create, authorise, settle,
            cancel or reject a payment.
          </p>
        </section>
      </div>
    </main>
  );
}
