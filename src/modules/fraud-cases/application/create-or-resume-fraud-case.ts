import { assertPaymentReportable } from "../domain/fraud-case";
import { dependencies, event, ownedContext, createCaseReference, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { FraudCaseWorkflow } from "./fraud-case-types";

export async function createOrResumeFraudCase(paymentId: string, input: ServiceDependencies): Promise<FraudCaseWorkflow> {
  const { repository, now, uuid } = dependencies(input);
  const context = await ownedContext(repository);
  const payment = await repository.loadOwnedPayment(paymentId, context.accountId);
  if (!payment) throw new FraudCaseApplicationError("PAYMENT_NOT_OWNED");
  assertPaymentReportable(payment.status);
  const existing = await repository.findCaseByPaymentId(paymentId, context.accountId);
  if (existing) return existing;
  const createdAt = now(); const caseId = uuid();
  const result = await repository.createCaseAtomically({
    fraudCase: { id: caseId, paymentId, caseReference: createCaseReference(uuid()), status: "DRAFT", createdAt, updatedAt: createdAt, submittedAt: null, submissionIdempotencyKey: null },
    report: { caseId, suspectedScamCategory: null, believedPaymentPurpose: null, contactChannel: null, firstContactAt: null, discoveredAt: null, discoveryReason: null, narrative: null, pressureOrUrgency: null, guaranteedReturns: null, toldToIgnoreWarnings: null, remoteAccessRequested: null, impersonatedOrganisation: null, additionalSupportRequested: null, version: 1, createdAt, updatedAt: createdAt },
    event: event({ id: uuid(), caseId, type: "CASE_DRAFT_CREATED", at: createdAt }),
  }, context.accountId);
  const workflow = await repository.findCaseByPaymentId(paymentId, context.accountId);
  if (!workflow || (result.kind !== "CREATED" && result.kind !== "PAYMENT_RACE")) throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return workflow;
}
