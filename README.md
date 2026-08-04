# SentinelPay

SentinelPay is a portfolio application exploring an AI-assisted approach to authorised push payment (APP) fraud prevention, fund recovery and reimbursement.

> **Simulation only:** SentinelPay does not move real money, connect to live bank accounts, make real fraud decisions, process genuine customer evidence, or replace investigators or regulated payment providers. All stored demonstration records are synthetic.

## MVP journey

Payment creation and deterministic customer intervention are implemented as a simulation. Scam reporting, fund recovery, human-owned reimbursement assessment and balanced ledger posting remain planned.

## Current status

Implemented:

- Next.js project foundation and CI.
- PostgreSQL schema and generated migration workflow using Drizzle.
- Lazy server-side Neon HTTP database connection.
- Idempotent synthetic seed data.
- Synthetic customer dashboard at `/customer`.
- Idempotent simulated GBP payment creation using integer pence.
- Explainable `deterministic-v1` risk assessment.
- Customer cancellation or explicitly acknowledged continuation.
- Customer-safe payment details and ordered event timelines.
- Atomic Neon HTTP batch persistence and conditional intervention resolution.

Not implemented: authentication, real payment execution, AI or machine learning, scam reporting, evidence handling, recovery, reimbursement decisions and ledger posting.

## Installed technology

- Next.js 16.2.12 and React 19.2.4
- strict TypeScript and Tailwind CSS 4
- PostgreSQL hosted by Neon
- Drizzle ORM and Drizzle Kit
- Neon serverless HTTP driver
- ESLint and pnpm

## Local setup

Prerequisites: Node.js 24 and pnpm 11.18.0.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to the private Neon PostgreSQL connection string. Never commit that file or paste its value into logs or documentation.

Generate and apply migrations, then seed the synthetic demonstration records:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Start the application:

```powershell
pnpm dev
```

Open `http://localhost:3000` for the project page or `http://localhost:3000/customer` for the database-backed synthetic dashboard.

## Commands

```text
pnpm dev          Start the development server
pnpm build        Create a production build
pnpm start        Serve a completed production build
pnpm lint         Run ESLint
pnpm typecheck    Check strict TypeScript without emitting files
pnpm test         Run Vitest in watch mode
pnpm test:run     Run the complete test suite once
pnpm db:generate  Generate SQL migrations from schema changes
pnpm db:migrate   Apply unapplied migrations
pnpm db:seed      Insert the stable synthetic demonstration records safely
pnpm db:studio    Open Drizzle Studio for local development inspection
```

Use migrations—not schema push—as the schema-change workflow.

## Repository structure

```text
src/app/           Next.js routes, layout and global styles
src/db/            Schema, Neon client, seed and database queries
src/components/    Future shared presentation components
src/lib/           Future shared utilities
src/modules/       Future domain modules inside the monolith
drizzle/           Generated SQL migrations and migration metadata
docs/              Product, architecture, issue and development notes
.github/workflows/ Continuous integration
```

## Documentation

- [MVP scope](docs/product/mvp-scope.md)
- [System overview](docs/architecture/system-overview.md)
- [Issue 001: project foundation](docs/issues/001-project-foundation.md)
- [Issue 002: database foundation](docs/issues/002-database-foundation.md)
- [Issue 003: payment risk flow](docs/issues/003-payment-risk-flow.md)
- [Day 00 development log](docs/devlog/day-00.md)
- [Day 01 development log](docs/devlog/day-01.md)
- [Day 02 payment-risk development log](docs/devlog/day-02-payment-risk-flow.md)

## Security and limitations

`DATABASE_URL` is server-only and checked only when a database operation runs, allowing tests and CI builds to run without the secret. There is no authentication, so every customer route is restricted by convention to one fixed synthetic customer and is not production-safe. The displayed opening balance is seeded context, not a calculated available balance or ledger balance.

## AI-assisted development disclosure

AI assistance is used for planning, implementation review and documentation. The repository owner remains responsible for understanding, testing and approving the code. Future product AI may organise evidence but must express uncertainty and cannot make final fraud, dishonesty or reimbursement decisions.
