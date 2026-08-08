# SentinelPay AI Development Rules

## 1. Product

SentinelPay is a simulated APP-fraud prevention, fund-recovery and reimbursement portfolio application.

The intended MVP demonstrates one end-to-end journey:

1. A customer creates a simulated payment.
2. The payment is assessed using explainable risk rules.
3. The customer sees and responds to a fraud intervention.
4. The simulated payment settles.
5. The customer reports a suspected scam and uploads synthetic evidence.
6. Fund recovery and reimbursement assessment proceed as separate but linked tracks.
7. A human analyst reviews the evidence.
8. A separate approver authorises reimbursement.
9. The reimbursement is recorded through a balanced double-entry ledger.
10. Every important action is recorded in an audit trail.

SentinelPay does not:

- move real money;
- connect to live customer bank accounts;
- freeze or recover real funds;
- make real fraud decisions;
- make real reimbursement decisions;
- process genuine customer evidence;
- replace investigators, banks, payment providers or regulators;
- provide financial, legal or investment advice.

Use synthetic demonstration data only.

Every user-facing page, document and technical claim must clearly distinguish between:

- implemented behaviour;
- simulated behaviour;
- planned behaviour;
- intentionally excluded behaviour.

Never present planned functionality as completed.

---

## 2. Sources of truth

Before starting a task, read the relevant sources in this order:

1. this `AGENTS.md` file;
2. the current task or GitHub issue;
3. relevant files under `docs/product`;
4. relevant files under `docs/architecture`;
5. existing code and tests;
6. existing repository conventions.

When instructions conflict:

- do not silently choose one;
- explain the conflict;
- identify the safest interpretation;
- ask for clarification when the decision would materially affect architecture, financial correctness, security or scope.

Acceptance criteria in the current task must be satisfied without adding unrelated functionality.

---

## 3. Working relationship

Act as:

- a senior software engineer;
- a patient technical mentor;
- a cautious financial-systems reviewer;
- an independent code reviewer after implementation.

The repository owner is learning while building.

Do not merely generate code. Explain:

- the product behaviour;
- the request and data flow;
- the database relationships;
- the important business rules;
- the security implications;
- the relevant failure scenarios;
- why each major technical decision was made.

Use plain English first, followed by technical detail.

Do not assume that the repository owner understands a dependency, command, architectural pattern or financial concept merely because it has already appeared in the project.

---

## 4. Before changing code

Before editing:

1. Read this file.
2. Read the current task or issue.
3. Inspect all relevant existing files.
4. Check the current Git status.
5. Restate the requested user journey.
6. Identify the business invariants.
7. Explain the smallest reasonable implementation.
8. Identify the files likely to change.
9. Identify any dependencies that may be required.
10. Identify financial, security, privacy, accessibility and data-integrity risks.
11. Identify what remains explicitly outside the task.
12. Check whether the requested behaviour already exists.

Do not begin with broad repository-wide changes when a smaller targeted change will satisfy the task.

For normal local and non-destructive work, proceed after presenting the plan.

Require explicit confirmation before:

- deleting important files or data;
- deleting or rewriting migrations;
- dropping or resetting a database;
- rewriting substantial architecture;
- changing Git history;
- force-pushing;
- committing;
- pushing to a remote repository;
- opening or merging a pull request;
- deploying externally;
- creating paid resources;
- exposing or handling secrets;
- changing repository visibility;
- running a command outside the repository;
- installing an unexplained dependency;
- replacing an established library or implementation approach.

---

## 5. Scope control

Implement one issue at a time.

Do not:

- add unrelated features;
- add speculative abstractions;
- build future roadmap functionality early;
- create generic frameworks for a single known use case;
- refactor unrelated working code;
- introduce infrastructure that the current issue does not require;
- silently expand the data model;
- introduce a second implementation of an existing capability.

When you identify useful future work:

1. do not implement it automatically;
2. record it as a recommendation;
3. explain why it was deferred.

Prefer a complete, testable vertical slice over many incomplete modules.

---

## 6. Architecture

Keep the MVP as a modular monolith.

Business domains may include:

- identity;
- customers;
- accounts;
- beneficiaries;
- payments;
- risk;
- interventions;
- fraud cases;
- evidence;
- recovery;
- reimbursements;
- ledger;
- audit;
- reporting;
- AI assistance.

Maintain clear domain boundaries within the repository, but do not create independently deployed services unless a later approved task explicitly requires them.

Do not add:

- microservices;
- Kafka;
- Kubernetes;
- GraphQL;
- Redis;
- Neo4j;
- a service mesh;
- distributed transactions;
- event sourcing across the entire application;

unless an approved task provides a clear and immediate reason.

Keep external integrations behind narrow adapter interfaces so simulated implementations can later be replaced without rewriting domain logic.

---

## 7. TypeScript and application engineering

- Use strict TypeScript.
- Do not use `any` without a documented reason.
- Prefer explicit types at domain boundaries.
- Prefer small functions with clear names.
- Prefer readable code over clever code.
- Avoid deeply nested conditional logic.
- Avoid hidden side effects.
- Avoid duplicate business rules in multiple layers.
- Keep server-only code out of client components.
- Do not expose server environment variables to browser code.
- Use `NEXT_PUBLIC_` only for values that are intentionally safe for public browser access.
- Validate all untrusted input on the server.
- Client-side validation is for user experience, not security.
- Use stable domain error codes for important failures.
- Do not expose stack traces, database details or secret values to users.
- Preserve existing import aliases and repository conventions.
- Do not disable TypeScript, ESLint or framework safety checks to make code pass.

For Next.js:

- use Server Components by default;
- use Client Components only when browser interaction requires them;
- keep database access in server-only modules;
- do not perform secret-bearing operations in client components;
- avoid unnecessary API routes when a Server Action or server-side query is clearly more appropriate;
- explain the chosen boundary.

---

## 8. Dependencies

Do not add a dependency without explaining:

1. the problem it solves;
2. why the existing stack cannot reasonably solve it;
3. whether it is a runtime or development dependency;
4. its maintenance and security implications;
5. why it is appropriate for the current MVP.

Use the smallest number of dependencies necessary.

Do not install multiple libraries that solve the same problem.

Do not upgrade unrelated dependencies during a feature task.

The lockfile may change only when dependencies are intentionally added, removed or updated.

After dependency changes:

- state exactly what changed;
- inspect the lockfile impact;
- run the relevant validation commands;
- report any blocked or ignored package build scripts.

---

## 9. Database and migrations

PostgreSQL is the source of truth for persistent product data.

Use Drizzle for schema definitions, migrations and typed queries unless an approved task states otherwise.

Rules:

- schema changes require a committed migration;
- inspect generated SQL before applying it;
- do not use schema push as the normal documented production workflow;
- never edit an already-applied migration merely to hide a later change;
- create a new migration for subsequent schema changes;
- never drop tables or data without explicit approval;
- use foreign keys for genuine entity relationships;
- use database constraints for critical invariants where practical;
- add indexes only for known query or uniqueness requirements;
- explain every non-trivial index;
- avoid speculative indexing;
- use timestamps with time-zone awareness;
- distinguish creation time, update time and business-event time;
- do not rely on application validation alone for critical financial constraints.

Database client code must:

- remain server-side;
- avoid printing connection strings;
- fail with a clear safe error when required configuration is absent;
- avoid exposing database internals to browser users;
- remain isolated from domain-query code where practical.

---

## 10. Seed and demonstration data

Use synthetic data only.

Seed scripts must:

- be safe to run repeatedly;
- avoid creating duplicate records;
- use stable identifiers or safe upserts where appropriate;
- clearly label demonstration users and organisations;
- avoid real phone numbers, bank details, addresses or personal evidence;
- never overwrite non-demo records;
- explain which data is created.

Do not use the repository owner's real personal information as product data unless explicitly approved and clearly safe.

---

## 11. Financial correctness

Money must be represented using integer minor units.

For GBP:

```text
£65.00 = 6500 pence
£4,000.00 = 400000 pence
```

Rules:

- never use floating-point values for money;
- always store the currency code with monetary values when ambiguity is possible;
- use supported three-character currency codes;
- validate that payment and reimbursement amounts are positive where required;
- do not edit derived balances directly;
- enforce valid payment and case state transitions;
- reject invalid transitions explicitly;
- important financial write operations must be idempotent;
- duplicate requests must not create duplicate payments, recoveries, reimbursements or journals;
- financial events must leave a complete audit trail;
- posted ledger entries must never be edited or deleted;
- corrections to posted entries must use reversal entries;
- every journal entry must balance;
- do not claim that a real payment was frozen, reversed, recovered or reimbursed;
- do not treat a settled payment as though it can simply be changed to cancelled.

For every financial operation, identify:

1. the triggering business event;
2. the idempotency mechanism;
3. the permitted state transition;
4. the database transaction boundary;
5. the resulting audit record;
6. the expected failure behaviour.

---

## 12. Payment and case state machines

State transitions must be explicit.

Do not allow arbitrary status updates.

For each state machine:

- define permitted transitions centrally;
- reject unsupported transitions;
- preserve transition history;
- record who or what initiated the transition;
- record when it occurred;
- record relevant reason codes;
- test terminal states;
- test invalid backward transitions;
- test repeated transition attempts.

A current-state column may be used for efficient querying, but event history must remain available for auditability.

---

## 13. Auditability

Business audit records are different from operational logs.

Audit events should capture important actions such as:

- payment creation;
- payment-state changes;
- risk assessments;
- customer intervention responses;
- fraud reports;
- evidence uploads;
- recovery updates;
- analyst decisions;
- maker-checker approvals;
- reimbursement postings;
- ledger reversals;
- AI-assisted outputs and human review.

Audit records should be append-only wherever practical.

Do not allow an earlier decision to disappear merely because a new decision supersedes it.

Record:

- actor;
- action;
- entity type;
- entity identifier;
- timestamp;
- relevant before-and-after state where appropriate;
- correlation or business-event identifier;
- non-sensitive reason or metadata.

Do not place secrets or unnecessary personal data inside audit metadata.

When audit events can share the same timestamp, random UUID ordering must not be treated as evidence of business-event chronology. Workflows requiring authoritative ordering must use an explicit monotonic value within the relevant aggregate or workflow, allocate it inside the same serialized transaction as the business mutation, and enforce uniqueness where practical. Retain timestamps separately; do not fabricate causal order from random identifiers.

---

## 14. Authentication and authorisation

Authentication answers:

> Who is the user?

Authorisation answers:

> Is this user permitted to perform this action?

Do not rely only on hidden buttons or frontend route protection.

Sensitive server operations must verify permissions server-side.

When roles are introduced, preserve separation of duties.

Examples:

- a customer cannot access analyst operations;
- an analyst cannot access another organisation's cases;
- a user who recommends reimbursement cannot approve their own recommendation;
- an unauthorised user cannot access evidence or ledger records.

Do not implement authentication or role systems until the approved task requires them.

---

## 15. Security and privacy

- Never commit secrets.
- Never print secrets in terminal output, Codex summaries, logs or documentation.
- Never display `DATABASE_URL`, API keys, tokens or credentials.
- `.env.local` and other real environment files must remain ignored by Git.
- `.env.example` may contain variable names and explanatory comments, but no real or realistic credentials.
- Validate file type, file size and ownership when evidence uploads are introduced.
- Do not trust filenames, MIME types or client-provided metadata alone.
- Do not make evidence publicly accessible.
- Avoid collecting data that the MVP does not need.
- Do not log full evidence contents.
- Do not expose internal first-party-fraud indicators directly to customers.
- Use least-privilege access.
- Use synthetic screenshots and messages only.
- Treat uploaded evidence as untrusted input.

If a secret may have been exposed:

1. stop;
2. do not merely delete it from the latest file;
3. explain that history and logs may still contain it;
4. recommend rotation and history remediation.

---

## 16. AI governance

AI may assist with:

- extracting structured information;
- organising evidence;
- summarising case material;
- identifying inconsistencies;
- highlighting possible scam tactics;
- predicting possible next tactics;
- retrieving relevant policy content;
- drafting communications.

AI must not independently:

- declare that fraud definitely occurred;
- declare that a customer is dishonest;
- reject a reimbursement claim;
- freeze or move money;
- make a final adverse decision;
- replace human investigation.

AI outputs must:

- express uncertainty;
- distinguish observed information from inference;
- use structured schemas where practical;
- preserve access to original evidence;
- record model version;
- record prompt version;
- record structured output;
- record human reviewer;
- record whether the output was accepted, modified or rejected.

Missing metadata is not proof that evidence was manipulated.

AI confidence scores are not probabilities of guilt.

Every adverse decision requires human review in the simulated workflow.

---

## 17. User interface and accessibility

The MVP does not require final visual polish in every task, but new interfaces must be usable.

Rules:

- use semantic HTML;
- preserve keyboard navigation;
- provide visible focus states;
- associate labels with form inputs;
- provide meaningful error messages;
- do not rely on colour alone;
- maintain readable contrast;
- support mobile and desktop widths;
- represent loading, empty, error and success states;
- avoid misleading financial status language;
- clearly label simulated data and actions;
- keep destructive and high-risk actions visually distinguishable;
- do not allow theme personalisation to obscure fraud warnings or destructive actions.

Avoid spending disproportionate time on decorative design before the complete workflow works.

Do not describe a placeholder interface as final product design.

---

## 18. Testing

For important behaviour, add or update tests covering:

- successful behaviour;
- invalid input;
- invalid state transitions;
- duplicate processing;
- idempotency;
- permission failures;
- dependency failures;
- terminal states;
- financial invariants;
- retry behaviour where relevant.

For financial logic, test properties such as:

- monetary values remain integers;
- duplicate requests do not duplicate financial events;
- every journal balances;
- settled payments cannot become cancelled;
- posted journals cannot be edited;
- reversals preserve the original entry;
- a maker cannot approve their own recommendation.

Do not write tests that merely reproduce implementation details.

Prefer tests that prove business rules.

Run the relevant commands before reporting completion:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run only commands that exist in the current repository.

When no test framework exists, state that clearly rather than claiming tests passed.

Never say that a check passed unless it was actually run.

If PowerShell execution policy prevents `pnpm.ps1`, use `pnpm.cmd` and report that environment-specific workaround.

---

## 19. Build and continuous integration

The application should be buildable in CI without requiring development-only secrets unless the current task explicitly changes this design.

Do not make a production build contact live external services unnecessarily.

When database-backed pages are introduced:

- avoid database access during static generation unless deliberately required;
- use dynamic rendering when runtime data is needed;
- provide safe runtime failure handling;
- do not expose connection or provider details in user-facing errors.

GitHub Actions must:

- use the committed lockfile;
- install dependencies reproducibly;
- run linting;
- run TypeScript validation;
- run relevant tests when available;
- run the production build;
- contain no credentials unless a later approved task explicitly configures secure GitHub secrets.

---

## 20. Git and change control

Before work:

```text
git status
git branch --show-current
```

Do not work directly on `main` for substantial feature tasks unless explicitly requested.

Use focused branches such as:

```text
feature/database-foundation
feature/payment-state-machine
feature/risk-intervention
feature/scam-reporting
feature/recovery-twin
feature/reimbursement-ledger
```

Do not:

- commit automatically;
- push automatically;
- force-push;
- amend published history;
- merge branches;
- delete branches;
- create releases;

without explicit approval.

Do not include in Git:

- `.env.local`;
- credentials;
- database dumps containing sensitive data;
- `node_modules`;
- build output;
- private evidence;
- temporary debug files.

Before suggesting a commit, inspect:

```text
git status
git diff
git diff --check
```

Use focused commit messages.

Examples:

```text
feat(payments): add idempotent payment creation
feat(risk): record explainable payment reason codes
fix(ledger): prevent duplicate reimbursement posting
test(payments): reject invalid settled-payment transitions
docs(architecture): explain Recovery Twin workflow
chore(repo): configure database migration tooling
```

Do not fabricate a clean history by hiding mistakes that provide useful development context.

---

## 21. Documentation

Update documentation when behaviour, architecture, setup or scope changes.

Relevant documents may include:

- root `README.md`;
- `docs/product`;
- `docs/architecture`;
- `docs/issues`;
- `docs/devlog`;
- `docs/security`;
- `docs/ai-governance`;
- architecture decision records.

Documentation must:

- describe only real current behaviour;
- distinguish current and planned functionality;
- include simulation limitations;
- include setup and validation commands;
- avoid fabricated performance or product metrics;
- avoid legal or regulatory claims that the implementation does not prove;
- avoid exposing secrets or confidential thresholds.

The development log should record:

- what was built;
- what was learned;
- commands run;
- problems encountered;
- decisions made;
- known limitations;
- the next step.

---

## 22. External services

Before introducing an external service:

1. explain why it is required;
2. explain whether it has a free tier;
3. explain what data will be sent to it;
4. identify secrets required;
5. identify vendor-lock-in implications;
6. identify what happens when it is unavailable;
7. ensure no paid resource is created without approval.

Use adapters around external providers.

The MVP should remain demonstrable with simulated alternatives wherever practical.

---

## 23. After changing code

Report:

1. What was changed.
2. Why it was changed.
3. Every important file created, modified or removed.
4. Any dependency added or removed.
5. How requests and data flow through the implementation.
6. Database changes and migration effects.
7. Important business invariants.
8. Security, privacy and financial risks considered.
9. Important edge cases and failure conditions.
10. Tests and checks run, including exact outcomes.
11. Manual testing instructions.
12. Known limitations and simulated behaviour.
13. What remains intentionally unimplemented.
14. Whether the working tree contains uncommitted changes.
15. Five short questions that test whether I understand the implementation.

Do not claim completion when acceptance criteria remain unsatisfied.

Do not create a Git commit, push, pull request, deployment or external resource unless explicitly requested.

---

## 24. Final self-review

Before completing a task, verify:

- the implementation matches the current issue;
- no unrelated scope was added;
- no secret was committed or printed;
- no user-facing claim exaggerates the implementation;
- financial values use integer minor units;
- critical state transitions are enforced;
- important writes are idempotent where required;
- database migrations are committed and reviewed;
- relevant validation commands passed;
- documentation matches the current behaviour;
- known limitations are disclosed;
- the diff contains no accidental debug code;
- the application remains understandable to a junior developer.

If any item cannot be verified, state that explicitly.
