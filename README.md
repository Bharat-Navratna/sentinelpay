# SentinelPay

SentinelPay is a portfolio application exploring an AI-assisted approach to authorised push payment (APP) fraud prevention, fund recovery and reimbursement.

> **Simulation only:** SentinelPay does not move real money, connect to live bank accounts, make real fraud decisions, process genuine customer evidence, or replace investigators or regulated payment providers. Demonstrations will use synthetic data.

## Planned MVP journey

The seven-day MVP is intended to demonstrate one traceable journey:

1. A customer starts a suspicious payment.
2. A risk signal triggers an intervention.
3. The customer submits a scam report.
4. An investigator records a simulated fund-recovery attempt.
5. A human reviews a reimbursement assessment supported, but not decided, by AI.
6. The simulated outcome is posted to a balanced ledger with an audit trail.

## Current status

Only the repository foundation is complete: the Next.js scaffold, modular-monolith directories, project documentation, landing page, validation scripts and CI workflow. The planned financial and fraud workflows are not implemented.

## Installed technology

- Next.js 16.2.12 with the App Router
- React 19.2.4
- TypeScript 5 in strict mode
- Tailwind CSS 4 through PostCSS
- ESLint 9 with the Next.js configuration
- pnpm and a committed lockfile

No database, authentication, AI service, external API or component library has been added.

## Local setup

Prerequisites: Node.js 24 and pnpm 11.18.0.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` in a browser.

## Validation

```powershell
pnpm lint
pnpm typecheck
pnpm build
```

## Repository structure

```text
src/app/          Next.js routes, root layout and global styles
src/components/   Shared presentation components (currently empty)
src/lib/          Shared application utilities (currently empty)
src/modules/      Future domain modules within the monolith (currently empty)
docs/product/     Product scope and constraints
docs/architecture/ Architecture decisions and system flow
docs/devlog/      Day-by-day learning notes
docs/issues/      Task definitions and acceptance criteria
.github/workflows/ Continuous integration configuration
public/           Static local assets from the scaffold
```

## Project documentation

- [MVP scope](docs/product/mvp-scope.md)
- [System overview](docs/architecture/system-overview.md)
- [Project foundation issue](docs/issues/001-project-foundation.md)
- [Day 00 development log](docs/devlog/day-00.md)

## Limitations

This is an early educational foundation. It has no persistence, user accounts, case management, payment processing, risk engine, evidence handling, recovery workflow, reimbursement workflow, ledger or AI integration. It must not be used with real customer, banking or evidence data.

## AI-assisted development disclosure

AI assistance is used during development for planning, implementation review and documentation. The repository owner remains responsible for understanding, testing and approving the code. Any future product AI output will be presented with uncertainty and will not make final fraud, dishonesty or reimbursement decisions.
