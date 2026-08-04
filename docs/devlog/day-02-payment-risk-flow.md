# Day 02: Payment risk flow

## Built

- Pure integer-money, payment-state and deterministic-risk rules.
- Risk-assessment and intervention persistence with database constraints.
- Atomic payment creation and conditional intervention resolution using the Neon HTTP driver.
- In-memory application tests for idempotency and competing decisions.
- Dynamic customer creation, warning and detail routes.
- Zod-backed Server Actions with safe error translation.
- Customer-safe mapping that omits internal risk and event metadata.
- Dashboard navigation, payment status and intervention actions.
- CI test execution before lint, type-check and build.

## Request and data flow

The browser submits untrusted form data to a Server Action. Zod checks the web shape, after which the application service derives the trusted account and GBP currency, invokes the existing domain rules and asks the Drizzle adapter for an atomic persistence operation. Pages reload server-side data and map it into an explicitly safe customer model.

## Decisions and lessons

- The same hidden UUID remains in form state after validation errors, making resubmission idempotent.
- Browser values never decide ownership, currency, status or risk.
- Event ordering uses explicit timestamps and a stable database secondary ID order.
- Customer pages describe possible scam characteristics without claiming that fraud occurred.
- Scores, thresholds, matched terms, internal facts and raw metadata remain server-internal.
- Next.js `redirect()` uses a framework control-flow signal. Server Actions therefore finish application-error handling first, then revalidate routes and redirect outside the broad `try/catch`; otherwise a committed mutation can be misreported as a form error. The already-cancelled workflow remained cancelled, and its identical retry did not append another event.

## Manual browser verification

Manual testing confirmed that:

1. an ordinary known-payee payment reached simulated settlement;
2. a suspicious payment could be cancelled;
3. continuation without acknowledgement performed no write and displayed an error;
4. acknowledged continuation reached simulated settlement;
5. refreshing payment details did not append duplicate events;
6. dashboard and payment timelines displayed the resulting states; and
7. customer pages exposed no risk scores, thresholds, weights, internal facts or raw event metadata.

## Known limitations

- No authentication or production authorisation.
- No live payment provider or real balance calculation.
- No PostgreSQL integration tests in CI.
- No AI or later fraud-case workflow.
- The retroactively corrected historical fixture has development-only provenance: its score-zero assessment treats the fixture as established history rather than recreating an earlier real-time assessment.

## Validation

Commands used for the completed milestone:

```text
pnpm test:run
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

## Next

The next separately approved milestone may begin scam reporting and synthetic evidence capture. Authentication should be designed before any real multi-user or sensitive-data behavior.
