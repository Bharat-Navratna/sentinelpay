"use client";

import { useActionState } from "react";

import { createPaymentAction } from "../actions";
import type { PaymentFormState } from "@/modules/payments/web/payment-form";

type BeneficiaryOption = {
  id: string;
  displayName: string;
  maskedAccountNumber: string;
  maskedSortCode: string;
};

export function PaymentForm({
  beneficiaries,
  initialState,
}: {
  beneficiaries: BeneficiaryOption[];
  initialState: PaymentFormState;
}) {
  const [state, formAction, isPending] = useActionState(
    createPaymentAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      <input
        name="idempotencyKey"
        type="hidden"
        value={state.values.idempotencyKey}
      />

      {state.formError ? (
        <p
          className="rounded-lg border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-100"
          role="alert"
        >
          {state.formError}
        </p>
      ) : null}

      <div>
        <label className="block font-medium" htmlFor="beneficiaryId">
          Beneficiary
        </label>
        <select
          aria-describedby={
            state.fieldErrors.beneficiaryId ? "beneficiary-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors.beneficiaryId)}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          defaultValue={state.values.beneficiaryId}
          disabled={isPending}
          id="beneficiaryId"
          name="beneficiaryId"
        >
          <option value="">Choose a beneficiary</option>
          {beneficiaries.map((beneficiary) => (
            <option key={beneficiary.id} value={beneficiary.id}>
              {beneficiary.displayName} — {beneficiary.maskedSortCode} / {beneficiary.maskedAccountNumber}
            </option>
          ))}
        </select>
        {state.fieldErrors.beneficiaryId ? (
          <p className="mt-2 text-sm text-red-300" id="beneficiary-error">
            {state.fieldErrors.beneficiaryId}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block font-medium" htmlFor="amount">
          Amount in pounds
        </label>
        <div className="mt-2 flex rounded-lg border border-slate-700 bg-slate-950 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-300">
          <span className="px-3 py-3 text-slate-400" aria-hidden="true">
            £
          </span>
          <input
            aria-describedby={state.fieldErrors.amount ? "amount-error" : "amount-help"}
            aria-invalid={Boolean(state.fieldErrors.amount)}
            className="min-w-0 flex-1 bg-transparent px-1 py-3 text-slate-100 outline-none"
            defaultValue={state.values.amount}
            disabled={isPending}
            id="amount"
            inputMode="decimal"
            name="amount"
            placeholder="65.00"
            type="text"
          />
        </div>
        <p className="mt-2 text-sm text-slate-500" id="amount-help">
          Enter a positive GBP amount with up to two decimal places.
        </p>
        {state.fieldErrors.amount ? (
          <p className="mt-2 text-sm text-red-300" id="amount-error">
            {state.fieldErrors.amount}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block font-medium" htmlFor="reference">
          Payment reference
        </label>
        <input
          aria-describedby={state.fieldErrors.reference ? "reference-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors.reference)}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          defaultValue={state.values.reference}
          disabled={isPending}
          id="reference"
          maxLength={140}
          name="reference"
          type="text"
        />
        {state.fieldErrors.reference ? (
          <p className="mt-2 text-sm text-red-300" id="reference-error">
            {state.fieldErrors.reference}
          </p>
        ) : null}
      </div>

      <button
        className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Creating simulated payment…" : "Review simulated payment"}
      </button>
    </form>
  );
}
