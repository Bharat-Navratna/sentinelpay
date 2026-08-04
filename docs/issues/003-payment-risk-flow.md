# Issue 003: Payment creation and deterministic intervention

## Outcome

SentinelPay now implements its first interactive, simulated customer payment workflow.

A fixed synthetic customer can:

1. open `/customer/payments/new`;
2. choose a synthetic beneficiary;
3. enter a GBP amount and reference;
4. create an idempotent simulated payment;
5. receive an ALLOW result that ends in simulated settlement, or an INTERVENE result that requires a customer response;
6. cancel the flagged payment or explicitly acknowledge the warning and continue;
7. inspect a customer-safe, ordered event timeline.

No real money moves and no real bank or fraud decision is involved.

## Business rules

Amounts are parsed from decimal text into positive integer pence without floating-point multiplication. Payment state transitions are centrally constrained and terminal states cannot be left.

`deterministic-v1` uses three explainable internal demonstration reasons: a new payee, an amount outlier and investment-scam language. Scores, weights, thresholds, matched terms and internal facts are persisted for technical reproducibility but excluded from customer view models and pages.

`RECENT_DEVICE_CHANGE` is not implemented because there is no authenticated device history.

## Idempotency and atomicity

The canonical request contains trusted account ID, beneficiary, integer amount, trusted currency and trimmed reference. The same UUID key and payload returns the existing workflow; conflicting reuse is rejected.

Payment, assessment, optional intervention and events are submitted in one Drizzle batch using the Neon HTTP non-interactive transaction mechanism. Intervention updates use expected payment/intervention states, locked eligibility and transition-dependent event inserts.

## Web boundary

Server Actions use Zod for input shape and translate known failures into safe form messages. The committed application services remain authoritative for money, ownership, idempotency, risk and transitions. Dynamic Server Components perform runtime reads, while small Client Components provide `useActionState`, pending states and accessible form errors.

## Limitations

- One fixed synthetic customer; no authentication or multi-customer selection.
- No real payment execution or ledger-backed balance.
- No AI, scam report, evidence, analyst, recovery or reimbursement workflow.
- Unit/application tests do not execute the SQL against PostgreSQL.
- The stable historical fixture was assessed retroactively. Its score-zero facts use the fixture as established history, so they are development provenance rather than a production reconstruction of prior payment history.

## Validation

The repository validates this work with:

```text
pnpm test:run
pnpm lint
pnpm typecheck
pnpm build
```

CI runs those checks without database credentials and does not apply migrations.
