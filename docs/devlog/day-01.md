# Day 01 — Database foundation

## PostgreSQL, Neon and Drizzle

PostgreSQL is the relational database and source of truth: it stores rows and enforces constraints, relationships and indexes. Neon hosts PostgreSQL and exposes a serverless HTTP connection suitable for this Next.js read path. Drizzle defines the schema and queries in TypeScript and generates versioned PostgreSQL migrations.

## Implemented schema

- Customers own accounts and beneficiaries.
- Accounts have a non-negative opening balance in integer minor units.
- Payments link one account to one beneficiary, require a positive integer amount and use a constrained status enum plus a unique idempotency key.
- Payment events link to a payment, record status movement and JSON metadata, and are only inserted/read by this implementation.

Indexes support the known access patterns: accounts and beneficiaries by customer, payment history by account and creation time, event history by payment and occurrence time, and unique payment lookup by idempotency key.

## Financial and audit decisions

Money is stored as integers because floating-point arithmetic cannot represent every decimal amount exactly. The display layer converts pence to formatted pounds; the stored values remain exact integers. Payment events are conceptually append-only so a later edit cannot rewrite the historical explanation of a payment. Database roles or triggers for stronger immutability are deferred.

## Commands run

- Dependency installation for the five approved packages.
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed` twice
- A read-only query of the seeded dashboard records
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

Outcomes:

- Migration generation created `drizzle/0000_black_banshee.sql`; its SQL was inspected before use.
- Migration application completed successfully against the configured Neon database.
- Two consecutive seed runs each verified one payment, two beneficiaries and three ordered events without duplication.
- The database-backed read returned Bharat Demo, Everyday Account, 1,250,000 opening-balance pence and the £65.00-equivalent settled synthetic payment.
- Lint completed with no errors or warnings.
- TypeScript checking completed with no errors.
- The production build completed with `DATABASE_URL` empty in the process and marked `/customer` as dynamically server-rendered.
- `git diff --check` completed without whitespace errors.

## Problems encountered

- Sandboxed pnpm initially selected a different store from the existing `node_modules`; the approved install was rerun against the existing store.
- pnpm reported ignored transitive esbuild build scripts, which required validation of the installed command-line tools.
- Two inline read-verification attempts failed before database access because shell quoting removed TypeScript string delimiters. Verification was moved into the repeatable seed script.

## Next

- Define and test server-side payment creation in a separate issue.
- Add explicit payment state-transition rules before any status mutation.
- Add authentication and authorisation only when separately designed and approved.
- Keep all future demonstration data synthetic.
