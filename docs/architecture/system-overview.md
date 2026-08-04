# System overview

## Why a modular monolith

The MVP begins as one Next.js application so routes, business rules and presentation remain easy to trace, run and change during a seven-day build. Domain boundaries can still be explicit without adding deployment, networking, consistency and observability costs from microservices. Modules can be separated later only if demonstrated operational needs justify it.

## Current application structure

- `src/app` contains App Router routes, the root layout and global Tailwind entry point.
- `src/components` is reserved for reusable UI.
- `src/lib` is reserved for shared, domain-independent utilities.
- `src/modules` is reserved for domain-owned types, rules and services.
- `src/db` contains the PostgreSQL schema, isolated Neon HTTP client, seed and typed dashboard query.
- `drizzle` contains generated, versioned SQL migrations.
- `docs` records product scope, architecture, delivery issues and learning notes.

The repository foundation, synthetic customer dashboard, simulated payment creation, deterministic risk assessment and customer intervention resolution are implemented. Later scam-reporting, recovery, reimbursement, ledger and AI workflows remain unimplemented.

## Planned domains

- **Payments:** synthetic payment intent and lifecycle.
- **Risk:** simulated signals and explainable risk context.
- **Interventions:** warnings and customer responses.
- **Fraud cases:** reports, ownership and enforced case states.
- **Evidence:** synthetic artefacts, provenance and AI-assisted organisation.
- **Recovery:** simulated recovery requests and outcomes.
- **Reimbursements:** human-reviewed assessment and outcome.
- **Ledger:** balanced entries stored in integer minor units, with reversals for corrections.
- **Audit:** append-only records of important actions and decisions.

## Current dashboard request and data flow

1. A browser requests `/customer`.
2. Next.js dynamically renders the Server Component without exposing database code to the browser.
3. The page calls the dashboard query in `src/db/queries`.
4. The query asks the lazy client for a Drizzle database instance; only then is `DATABASE_URL` checked and the Neon HTTP driver created.
5. Drizzle translates the typed selections, joins and filters into PostgreSQL SQL sent to Neon.
6. The query shapes rows into a dashboard view model and the server renders HTML.
7. Connection or query failures are handled by a generic route error boundary that reveals no database details.

## Implemented payment request and data flow

1. A dynamic Server Component loads the fixed synthetic account and customer-safe data.
2. A Client Component handles only form interaction and pending/error presentation.
3. A Server Action parses untrusted `FormData` with Zod.
4. The action calls the application service through the Drizzle repository adapter.
5. Existing pure domain functions enforce integer money, deterministic risk and permitted state transitions.
6. Initial workflow records are written through one Drizzle batch backed by Neon’s non-interactive transaction array.
7. Intervention resolution uses expected-state CTE updates so events depend on successful transitions.
8. A customer-safe mapper removes scores, internal facts, reasons and event metadata before rendering.

Application tests use an in-memory repository and require no database connection. There are currently no automated PostgreSQL integration tests.

## Intentionally not implemented

There is currently no authentication, real payment execution, evidence processing, recovery action, reimbursement decision, ledger posting or product AI integration. The customer routes operate only on fixed synthetic data and are not suitable for production use.

## Database indexes

- `accounts_customer_id_idx` supports listing a customer’s accounts.
- `beneficiaries_customer_id_idx` supports listing a customer’s saved beneficiaries.
- `payments_account_id_created_at_idx` supports an account’s payment history in creation order.
- `payment_events_payment_id_occurred_at_idx` supports an ordered event timeline for one payment.
- `payments_idempotency_key_idx` enforces uniqueness and supports future duplicate-request lookup.
- `payment_risk_assessments_payment_id_idx` enforces one assessment per payment and supports lookup.
- `payment_interventions_payment_id_idx` enforces one intervention per payment and supports lookup.
