# System overview

## Why a modular monolith

The MVP begins as one Next.js application so routes, business rules and presentation remain easy to trace, run and change during a seven-day build. Domain boundaries can still be explicit without adding deployment, networking, consistency and observability costs from microservices. Modules can be separated later only if demonstrated operational needs justify it.

## Current application structure

- `src/app` contains App Router routes, the root layout and global Tailwind entry point.
- `src/components` is reserved for reusable UI.
- `src/lib` is reserved for shared, domain-independent utilities.
- `src/modules` is reserved for domain-owned types, rules and services.
- `docs` records product scope, architecture, delivery issues and learning notes.

At present, only the static foundation landing page is implemented.

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

## Planned request and data flow

1. A browser request reaches a Next.js route in `src/app`.
2. The route validates untrusted input on the server.
3. It calls the appropriate domain service in `src/modules`.
4. The domain enforces permissions, state transitions, idempotency and financial invariants.
5. A future persistence adapter records domain state, append-only audit events and balanced ledger entries atomically where required.
6. The route returns a safe view model for rendering. AI-derived fields will include model version, prompt version, structured output and uncertainty, and remain subject to human review.

## Intentionally not implemented

There are currently no domain services, route handlers, persistence adapters, database, authentication, external APIs, AI integration, payment processing, fraud decisions, evidence processing, recovery actions, reimbursement decisions or ledger postings. These are architectural intentions, not claims of working capability.
