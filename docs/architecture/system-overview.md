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

The repository foundation and a read-only, synthetic customer dashboard are implemented. Payment mutations and the later fraud journey remain unimplemented.

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

## Planned domain request and data flow

1. A browser request reaches a Next.js route in `src/app`.
2. The route validates untrusted input on the server.
3. It calls the appropriate domain service in `src/modules`.
4. The domain enforces permissions, state transitions, idempotency and financial invariants.
5. A future persistence adapter records domain state, append-only audit events and balanced ledger entries atomically where required.
6. The route returns a safe view model for rendering. AI-derived fields will include model version, prompt version, structured output and uncertainty, and remain subject to human review.

## Intentionally not implemented

There are currently no authentication, payment mutations, state-transition services, risk decisions, evidence processing, recovery actions, reimbursement decisions, ledger postings or AI integration. Neon persistence currently supports only the seeded, read-only dashboard demonstration.

## Database indexes

- `accounts_customer_id_idx` supports listing a customer’s accounts.
- `beneficiaries_customer_id_idx` supports listing a customer’s saved beneficiaries.
- `payments_account_id_created_at_idx` supports an account’s payment history in creation order.
- `payment_events_payment_id_occurred_at_idx` supports an ordered event timeline for one payment.
- `payments_idempotency_key_idx` enforces uniqueness and supports future duplicate-request lookup.
