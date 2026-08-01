# 002 — Database foundation and synthetic customer dashboard

## Objective

Add a PostgreSQL persistence foundation and a read-only customer dashboard backed by synthetic Neon data.

## Implementation status

- [x] Drizzle schema defines customers, accounts, beneficiaries, payments and payment events.
- [x] Financial values use constrained integer minor units.
- [x] Foreign keys, the payment status enum and known-query indexes are defined.
- [x] Neon HTTP connection creation is isolated and lazy.
- [x] Drizzle Kit uses `.env.local` and migration files under `drizzle`.
- [x] The seed uses stable identifiers and conflict-safe inserts.
- [x] `/customer` reads through a dedicated query layer and is dynamically rendered.
- [x] Database failures produce a safe browser error boundary.
- [x] Documentation and database scripts are updated.
- [x] Migration generation, application, double seed and final validation are recorded as successful.

## Acceptance criteria

- Migration SQL creates all specified tables, enum values, constraints, foreign keys and indexes.
- Migration and seed commands fail safely when `DATABASE_URL` is missing.
- Repeated seeding does not duplicate the synthetic records.
- The dashboard displays database-backed customer, account, beneficiary, payment and event information.
- Builds and CI do not require `DATABASE_URL`.
- `.env.local` stays ignored and no connection string enters Git or browser output.
- No authentication, payment mutation, risk decision, AI or ledger behaviour is introduced.

## Non-goals

- Authentication or customer selection.
- Payment creation or state-transition enforcement.
- Current-balance calculation.
- Fraud detection, evidence, recovery, reimbursement, ledger or AI functionality.
- Database-level triggers or roles enforcing append-only events.
- Deployment or production database operations.
