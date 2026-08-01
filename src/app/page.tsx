import Link from "next/link";

const journeyStages = [
  "Suspicious payment",
  "Risk intervention",
  "Scam report",
  "Fund recovery",
  "Reimbursement assessment",
  "Ledger posting",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <span className="text-lg font-semibold tracking-tight">SentinelPay</span>
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
            Foundation stage
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Simulated portfolio application
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              SentinelPay
            </h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-300 sm:text-2xl">
              AI-assisted APP fraud prevention, fund recovery and reimbursement
              platform
            </p>

            <div
              className="mt-10 max-w-3xl rounded-2xl border border-amber-400/30 bg-amber-300/10 p-5"
              role="note"
              aria-label="Simulation notice"
            >
              <h2 className="font-semibold text-amber-100">Simulation only</h2>
              <p className="mt-2 leading-7 text-amber-50/80">
                This portfolio project does not move real money, connect to bank
                accounts, or make real fraud or reimbursement decisions. All
                future demonstrations will use synthetic data and require human
                oversight.
              </p>
            </div>
            <Link
              className="mt-8 inline-flex rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              href="/customer"
            >
              View synthetic customer dashboard
            </Link>
          </div>

          <aside className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 sm:p-8">
            <p className="text-sm font-medium text-cyan-300">Project status</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Repository foundation complete
            </h2>
            <p className="mt-4 leading-7 text-slate-400">
              The application structure, project documentation, landing page,
              validation scripts and continuous integration baseline are in
              place. Product workflows are not implemented yet.
            </p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
              <div className="h-full w-1/6 rounded-full bg-cyan-400" />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Foundation is the only completed phase; this bar is illustrative,
              not a delivery metric.
            </p>
          </aside>
        </section>

        <section className="border-t border-slate-800 py-12" aria-labelledby="journey-heading">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-cyan-300">Planned MVP journey</p>
            <h2 id="journey-heading" className="mt-2 text-2xl font-semibold text-white">
              One traceable path from concern to accountable outcome
            </h2>
            <p className="mt-4 leading-7 text-slate-400">
              The future MVP will demonstrate how a synthetic case could move
              through each stage. These stages describe the plan, not currently
              working features.
            </p>
          </div>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {journeyStages.map((stage, index) => (
              <li key={stage} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <span className="text-xs font-semibold text-cyan-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 font-medium text-slate-200">{stage}</p>
                <p className="mt-1 text-sm text-slate-500">Planned</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="border-t border-slate-800 py-6 text-sm text-slate-500">
          Built as a learning-focused, synthetic demonstration—not a regulated
          financial service.
        </footer>
      </div>
    </main>
  );
}
