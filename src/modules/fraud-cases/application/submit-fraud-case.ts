import { assertFraudCaseTransition } from "../domain/fraud-case-state-machine";
import { assertPaymentReportable } from "../domain/fraud-case";
import { assertScamReportChronology, isScamReportSubmissionReady } from "../domain/scam-report";
import { dependencies, event, ownedCase, ownedContext, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { FraudCaseWorkflow } from "./fraud-case-types";

export async function submitFraudCase(input: { caseId: string; submissionIdempotencyKey: string }, deps: ServiceDependencies): Promise<FraudCaseWorkflow> {
  const { repository, now, uuid } = dependencies(deps); const workflow = await ownedCase(repository, input.caseId);
  if (workflow.fraudCase.status === "SUBMITTED") return workflow;
  assertPaymentReportable(workflow.payment.status); assertFraudCaseTransition("DRAFT", "SUBMITTED");
  const report = {
    suspectedScamCategory: workflow.report.suspectedScamCategory,
    believedPaymentPurpose: workflow.report.believedPaymentPurpose,
    contactChannel: workflow.report.contactChannel,
    firstContactAt: workflow.report.firstContactAt,
    discoveredAt: workflow.report.discoveredAt,
    discoveryReason: workflow.report.discoveryReason,
    narrative: workflow.report.narrative,
    pressureOrUrgency: workflow.report.pressureOrUrgency,
    guaranteedReturns: workflow.report.guaranteedReturns,
    toldToIgnoreWarnings: workflow.report.toldToIgnoreWarnings,
    remoteAccessRequested: workflow.report.remoteAccessRequested,
    impersonatedOrganisation: workflow.report.impersonatedOrganisation,
    additionalSupportRequested: workflow.report.additionalSupportRequested,
  };
  if (!isScamReportSubmissionReady(report)) throw new FraudCaseApplicationError("REPORT_INCOMPLETE");
  const at = now();
  assertScamReportChronology(report, at);
  if (workflow.evidenceItems.some((item) => item.status === "AWAITING_UPLOAD" || item.status === "VALIDATING")) throw new FraudCaseApplicationError("CASE_SUBMISSION_BLOCKED");
  if (workflow.extractionRuns.some((run) => run.status === "COMPLETED" && !workflow.extractionReviews.some((review) => review.extractionRunId === run.id))) throw new FraudCaseApplicationError("CASE_SUBMISSION_BLOCKED");
  const context = await ownedContext(repository);
  const result = await repository.submitCaseAtomically({ accountId: context.accountId, caseId: input.caseId, expectedReportVersion: workflow.report.version, idempotencyKey: input.submissionIdempotencyKey, submittedAt: at, event: event({ id: uuid(), caseId: input.caseId, type: "CASE_SUBMITTED", at, requestKey: input.submissionIdempotencyKey }) });
  const updated = await repository.loadCase(input.caseId, context.accountId);
  if (!updated) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  if (result.kind === "CONFLICT" && updated.fraudCase.status !== "SUBMITTED") throw new FraudCaseApplicationError("CASE_SUBMISSION_BLOCKED");
  return updated;
}
