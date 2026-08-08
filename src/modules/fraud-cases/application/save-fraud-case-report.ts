import { assertScamReportChronology, parseScamReportDraft } from "../domain/scam-report";
import { dependencies, event, ownedCase, ownedContext, requireDraft, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { FraudCaseWorkflow } from "./fraud-case-types";

export async function saveFraudCaseReport(input: { caseId: string; expectedVersion: number; report: unknown }, deps: ServiceDependencies): Promise<FraudCaseWorkflow> {
  const { repository, now, uuid } = dependencies(deps);
  const workflow = await ownedCase(repository, input.caseId); requireDraft(workflow);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new FraudCaseApplicationError("REPORT_STALE");
  const report = parseScamReportDraft(input.report); const context = await ownedContext(repository); const at = now();
  assertScamReportChronology(report, at);
  const result = await repository.saveReportAtomically({ caseId: input.caseId, accountId: context.accountId, expectedVersion: input.expectedVersion, report, updatedAt: at, event: event({ id: uuid(), caseId: input.caseId, type: "REPORT_UPDATED", at }) });
  if (result.kind === "CONFLICT") {
    const latest = await repository.loadCase(input.caseId, context.accountId);
    if (latest?.fraudCase.status === "SUBMITTED") throw new FraudCaseApplicationError("FRAUD_CASE_ALREADY_SUBMITTED");
    throw new FraudCaseApplicationError("REPORT_STALE");
  }
  const updated = await repository.loadCase(input.caseId, context.accountId);
  if (!updated) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return updated;
}
