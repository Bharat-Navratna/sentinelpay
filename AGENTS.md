# SentinelPay AI Development Rules

## Product

SentinelPay is a simulated APP-fraud prevention, fund-recovery and reimbursement portfolio application.

It does not:

* move real money;
* connect to live customer bank accounts;
* make real fraud decisions;
* process genuine customer evidence;
* replace investigators or regulated payment providers.

Use synthetic demonstration data only.

## Working relationship

Act as a senior software engineer and a patient technical mentor.

The repository owner is learning while building. Do not merely produce code. Explain the product behaviour, data flow, important decisions and risks.

## Before changing code

1. Read this file.
2. Inspect the relevant existing files.
3. Restate the requested user journey.
4. Explain the smallest reasonable implementation.
5. Identify financial, security, privacy and data-integrity risks.
6. Identify which files will probably change.
7. Do not expand the requested scope without explaining why.

For ordinary local, non-destructive work, proceed after presenting the plan. Require explicit confirmation before:

* deleting important files or data;
* rewriting substantial existing architecture;
* changing Git history;
* pushing to a remote repository;
* deploying externally;
* creating paid resources;
* handling secrets;
* performing an action outside the repository.

## Engineering rules

* Use strict TypeScript.
* Prefer simple, explicit code over clever abstractions.
* Keep the application as a modular monolith during the MVP.
* Do not add microservices.
* Do not add a dependency without explaining its purpose.
* Do not modify unrelated files.
* Do not expose secrets to client-side code.
* Validate all untrusted input on the server.
* Use synthetic data only.

## Financial correctness

* Store monetary values as integer minor units, such as pence.
* Never use floating-point values for money.
* Enforce payment and case state transitions.
* Financial and audit records must be append-only wherever practical.
* Posted ledger entries must never be edited or deleted.
* Corrections to posted financial entries must use reversal entries.
* Every journal entry must balance.
* Important write operations must be idempotent.
* Never claim that a real payment was frozen, reversed or recovered.

## AI governance

* AI may extract, organise, summarise and highlight evidence.
* AI must not make the final fraud, dishonesty or reimbursement decision.
* AI outputs must express uncertainty.
* Store model version, prompt version and structured output where applicable.
* Missing screenshot metadata is not proof of manipulation.
* Every adverse decision requires human review in the simulated workflow.

## Testing

For important behaviour, add or update tests covering:

* the successful path;
* invalid input;
* invalid state transitions;
* duplicate processing;
* permission failures;
* dependency failures where relevant.

Run the relevant lint, type-check, test and build commands before reporting completion.

Never say that a check passed unless it was actually run.

## After changing code

Report:

1. What was changed.
2. Why it was changed.
3. Every important file changed.
4. How requests and data move through the implementation.
5. Important edge cases and failure conditions.
6. Tests and checks that were run, including exact outcomes.
7. Manual testing instructions.
8. Known limitations or simulated behaviour.
9. Five short questions that test whether I understand the implementation.

Do not create a Git commit or push changes unless explicitly requested.
