# 001 — Project foundation

## Objective

Establish a truthful, maintainable foundation for the SentinelPay seven-day MVP without implementing product workflows.

## Required work

- Add the modular-monolith directory structure.
- Replace the generated page and metadata with SentinelPay foundation content.
- Document product scope, architecture and the initial development log.
- Add a TypeScript validation script and a lockfile-based CI workflow.
- Provide a comments-only environment-variable example.
- Rewrite the repository README to reflect actual status.

## Acceptance criteria

- The landing page is responsive, accessible and uses only local Tailwind styles/assets.
- It names SentinelPay, states the proposition and prominently labels the application as simulated.
- It describes the full planned journey without claiming it works.
- Only repository foundation is shown as complete.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` succeed.
- CI runs those checks for pushes and pull requests targeting `main`.
- No dependency, secret, database, authentication, external API or product workflow is added.

## Non-goals

- Payment, fraud, recovery, reimbursement, evidence, ledger or audit functionality.
- Database design or persistence.
- Authentication or authorisation.
- AI or third-party integrations.
- Deployment and production operations.

## Completion checklist

- [x] Required directories are represented in Git.
- [x] Package scripts include `typecheck`.
- [x] Foundation landing page and metadata are present.
- [x] Product and architecture documentation are present.
- [x] Root README and `.env.example` are present.
- [x] CI workflow is present.
- [x] Local lint, type-check and production build have been recorded as successful.
