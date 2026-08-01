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
- avoid unnecessary API routes when a server action or server-side query is clearly more appropriate;
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