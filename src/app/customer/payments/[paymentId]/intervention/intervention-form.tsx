"use client";

import { useActionState } from "react";

import { resolvePaymentInterventionAction } from "../../actions";

const initialState = {
  acknowledgementError: null,
  formError: null,
};

export function InterventionForm({ paymentId }: { paymentId: string }) {
  const [state, formAction, isPending] = useActionState(
    resolvePaymentInterventionAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <input name="paymentId" type="hidden" value={paymentId} />

      {state.formError ? (
        <p className="rounded-lg border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-100" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-700 bg-slate-950 p-5">
        <div className="flex items-start gap-3">
          <input
            aria-describedby={state.acknowledgementError ? "acknowledgement-error" : undefined}
            aria-invalid={Boolean(state.acknowledgementError)}
            className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-900 text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            disabled={isPending}
            id="acknowledgementConfirmed"
            name="acknowledgementConfirmed"
            type="checkbox"
            value="true"
          />
          <label className="leading-6" htmlFor="acknowledgementConfirmed">
            I have paused, checked the payment details and understand that SentinelPay is only a simulation.
          </label>
        </div>
        {state.acknowledgementError ? (
          <p className="mt-3 text-sm text-red-300" id="acknowledgement-error" role="alert">
            {state.acknowledgementError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="rounded-lg bg-amber-200 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          name="decision"
          type="submit"
          value="CANCEL"
        >
          {isPending ? "Recording decision…" : "Cancel simulated payment"}
        </button>
        <button
          className="rounded-lg border border-slate-600 px-5 py-3 font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          name="decision"
          type="submit"
          value="CONTINUE"
        >
          {isPending ? "Recording decision…" : "Acknowledge and continue"}
        </button>
      </div>
    </form>
  );
}
