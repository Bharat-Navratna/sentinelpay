"use client";

export default function CustomerError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-sm font-medium text-amber-300">Dashboard unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold">We could not load the synthetic customer data.</h1>
        <p className="mt-4 leading-7 text-slate-400">
          Check the local database configuration and try again. No payment or
          customer action was attempted.
        </p>
        <button
          className="mt-6 rounded-lg bg-cyan-300 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
