import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCustomerPaymentSource } from "@/db/queries/customer-payments";
import { mapPaymentWorkflowToCustomerView } from "@/modules/payments/web/customer-payment-view";

import { InterventionForm } from "./intervention-form";

export const dynamic = "force-dynamic";

export default async function PaymentInterventionPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const source = await getCustomerPaymentSource(paymentId);

  if (!source) {
    notFound();
  }

  if (
    source.workflow.payment.status !== "CUSTOMER_INTERVENTION" ||
    source.workflow.intervention?.status !== "PENDING"
  ) {
    redirect(`/customer/payments/${paymentId}`);
  }

  const payment = mapPaymentWorkflowToCustomerView(
    source.workflow,
    source.beneficiaryName,
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10">
        <Link className="text-sm text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" href={`/customer/payments/${paymentId}`}>
          ← Payment details
        </Link>

        <header className="mt-8">
          <p className="text-sm font-medium text-amber-300">Simulated payment warning</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Pause and check this payment
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            Deterministic demonstration rules found characteristics that can occur in scam payments. This does not prove that this payment or recipient is fraudulent.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-labelledby="payment-summary-heading">
          <h2 className="font-semibold" id="payment-summary-heading">Payment being checked</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-slate-500">Beneficiary</dt><dd className="mt-1">{payment.beneficiaryName}</dd></div>
            <div><dt className="text-sm text-slate-500">Amount</dt><dd className="mt-1">{payment.formattedAmount}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Reference</dt><dd className="mt-1">{payment.reference}</dd></div>
          </dl>
        </section>

        <section className="mt-8 rounded-2xl border border-amber-400/40 bg-amber-300/10 p-6" aria-labelledby="checks-heading">
          <h2 className="text-xl font-semibold text-amber-100" id="checks-heading">Check independently before continuing</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 leading-6 text-amber-50/80">
            <li>Confirm who you are paying and why the payment is needed.</li>
            <li>Be cautious if you were promised guaranteed returns or quick profit.</li>
            <li>Stop if someone is pressuring you to act quickly.</li>
            <li>Do not follow instructions to ignore payment warnings.</li>
            <li>Verify the organisation using contact details you found independently.</li>
          </ul>
          <p className="mt-5 border-t border-amber-300/20 pt-4 text-sm leading-6 text-amber-50/70">
            SentinelPay is a portfolio simulation. No real payment is frozen, assessed by a bank or transferred.
          </p>
        </section>

        <InterventionForm paymentId={paymentId} />
      </div>
    </main>
  );
}
