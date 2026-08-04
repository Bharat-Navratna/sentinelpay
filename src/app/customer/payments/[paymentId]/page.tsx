import Link from "next/link";
import { notFound } from "next/navigation";

import { getCustomerPaymentSource } from "@/db/queries/customer-payments";
import { mapPaymentWorkflowToCustomerView } from "@/modules/payments/web/customer-payment-view";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const source = await getCustomerPaymentSource(paymentId);

  if (!source) {
    notFound();
  }

  const payment = mapPaymentWorkflowToCustomerView(
    source.workflow,
    source.beneficiaryName,
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10">
        <nav className="flex flex-wrap gap-4 text-sm" aria-label="Payment navigation">
          <Link className="text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" href="/customer">
            ← Customer dashboard
          </Link>
          <Link className="text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" href="/customer/payments/new">
            Create another simulated payment
          </Link>
        </nav>

        <header className="mt-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-cyan-300">Simulated payment</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {payment.beneficiaryName}
            </h1>
            <p className="mt-2 text-slate-400">{payment.reference}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{payment.formattedAmount}</p>
            <p className="mt-3 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
              {payment.statusLabel}
            </p>
          </div>
        </header>

        {payment.requiresCustomerAction ? (
          <section className="mt-8 rounded-xl border border-amber-400/40 bg-amber-300/10 p-5" aria-labelledby="action-heading">
            <h2 className="font-semibold text-amber-100" id="action-heading">
              Your review is needed
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-50/80">
              Review the deterministic demonstration warning before deciding whether to cancel or continue.
            </p>
            <Link className="mt-4 inline-flex rounded-lg bg-amber-200 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200" href={`/customer/payments/${payment.paymentId}/intervention`}>
              Review payment warning
            </Link>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="summary-heading">
          <h2 className="text-xl font-semibold" id="summary-heading">Payment summary</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-sm text-slate-500">Beneficiary</dt><dd className="mt-1">{payment.beneficiaryName}</dd></div>
            <div><dt className="text-sm text-slate-500">Amount</dt><dd className="mt-1">{payment.formattedAmount}</dd></div>
            <div><dt className="text-sm text-slate-500">Reference</dt><dd className="mt-1">{payment.reference}</dd></div>
            <div><dt className="text-sm text-slate-500">Created</dt><dd className="mt-1">{payment.createdAtLabel}</dd></div>
          </dl>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="timeline-heading">
          <h2 className="text-xl font-semibold" id="timeline-heading">Event timeline</h2>
          <ol className="mt-5 space-y-5 border-l border-slate-700 pl-5">
            {payment.timeline.map((event) => (
              <li key={event.id}>
                <p className="font-medium">{event.label}</p>
                <time className="mt-1 block text-sm text-slate-500" dateTime={event.occurredAt.toISOString()}>
                  {event.occurredAtLabel}
                </time>
              </li>
            ))}
          </ol>
        </section>

        <aside className="mt-8 rounded-xl border border-amber-400/30 bg-amber-300/10 p-5 text-sm leading-6 text-amber-50/80">
          This is a portfolio demonstration. No real bank assessed this payment and no real money was transferred.
        </aside>
      </div>
    </main>
  );
}
