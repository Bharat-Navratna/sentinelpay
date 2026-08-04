# SentinelPay seven-day MVP scope

## Problem

APP fraud journeys are difficult to understand as one continuous process. Risk intervention, customer reporting, recovery activity, reimbursement review, accounting and audit are often demonstrated separately. SentinelPay will show how those responsibilities can form one traceable, human-governed workflow without operating a real financial service.

## Target users

- Customers represented by synthetic personas who need clear warnings and reporting steps.
- Fraud operations investigators who need an ordered case history.
- Reimbursement reviewers who need evidence and policy context while retaining final authority.
- Portfolio reviewers and developers evaluating the design and engineering decisions.

## Single end-to-end MVP journey

A synthetic customer initiates a suspicious payment. A simulated risk signal produces an intervention, after which the customer submits a synthetic scam report. An investigator records a simulated recovery attempt. AI may organise and summarise synthetic evidence, but a human completes the reimbursement assessment. The resulting simulated financial outcome is posted to a balanced ledger and recorded in an audit trail.

## Included in the seven-day MVP

- Synthetic payment initiation and risk context.
- A clear risk-intervention experience.
- Scam-report capture using synthetic evidence only.
- Case status and investigator workflow.
- Simulated recovery activity and outcomes.
- AI-assisted evidence organisation with uncertainty and human review.
- Human-owned reimbursement assessment.
- Integer-minor-unit, balanced simulated ledger posting.
- Append-only audit events and basic validation of state transitions.

## Explicitly excluded

- Real money movement or payment-network connectivity.
- Live bank-account access or open-banking integrations.
- Real fraud detection, automated adverse decisions or regulated advice.
- Genuine customer identities, transactions or evidence.
- Production authentication, deployment, monitoring and operational support.
- Multi-service or microservice architecture.

## Synthetic-data and simulation limitations

All personas, payments, evidence, risk signals, recovery actions, decisions and ledger entries must be synthetic. A displayed freeze, return, recovery or reimbursement represents only a simulated state change. Results cannot establish how a bank, investigator, payment provider or regulator would decide a real case, and AI output must never be treated as a final decision.

## Current implementation boundary

Implemented now:

- creation of synthetic GBP payments using integer pence;
- deterministic demonstration risk assessment;
- customer warning, cancellation and acknowledged continuation;
- simulated settlement states and ordered payment events;
- customer-safe payment detail and dashboard views.

These operations change demonstration records only. They do not move money or establish that fraud occurred. Authentication and every later case, evidence, recovery, reimbursement, ledger and AI stage remain planned or intentionally excluded from the current milestone.
