import { randomUUID } from "node:crypto";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { FraudCaseRepository } from "./fraud-case-repository";
import type { FraudCaseWorkflow, NewCaseEvent } from "./fraud-case-types";

export type ServiceDependencies = { repository: FraudCaseRepository; now?: () => Date; uuid?: () => string };
export const dependencies = (input: ServiceDependencies) => ({ repository: input.repository, now: input.now ?? (() => new Date()), uuid: input.uuid ?? randomUUID });
export async function ownedContext(repository: FraudCaseRepository) {
  const context = await repository.loadCustomerContext();
  if (!context) throw new FraudCaseApplicationError("FRAUD_CASE_CONTEXT_NOT_FOUND");
  return context;
}
export async function ownedCase(repository: FraudCaseRepository, caseId: string): Promise<FraudCaseWorkflow> {
  const context = await ownedContext(repository);
  const workflow = await repository.loadCase(caseId, context.accountId);
  if (!workflow) throw new FraudCaseApplicationError("FRAUD_CASE_NOT_FOUND");
  return workflow;
}
export function requireDraft(workflow: FraudCaseWorkflow) {
  if (workflow.fraudCase.status !== "DRAFT") throw new FraudCaseApplicationError("FRAUD_CASE_ALREADY_SUBMITTED");
}
export function event(input: { id: string; caseId: string; type: string; at: Date; evidenceItemId?: string; requestKey?: string; actor?: "CUSTOMER" | "SYSTEM" }): NewCaseEvent {
  return { id: input.id, caseId: input.caseId, evidenceItemId: input.evidenceItemId ?? null, eventType: input.type, actorType: input.actor ?? "CUSTOMER", requestIdempotencyKey: input.requestKey ?? null, metadata: { simulation: true }, occurredAt: input.at };
}
export function createCaseReference(uuid: string): string { return `SP-${uuid.replaceAll("-", "").slice(0, 12).toUpperCase()}`; }
