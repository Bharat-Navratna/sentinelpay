import type { EvidenceStorage } from "../../evidence/application/evidence-storage";
import {
  buildFinalEvidenceObjectLocator,
  buildQuarantineObjectLocator,
  type StorageObjectLocator,
} from "../../evidence/application/evidence-object-keys";
import { ownedCase, type ServiceDependencies } from "./case-service-helpers";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { EvidenceItemRecord } from "./fraud-case-types";
import { removeEvidence } from "./manage-inline-evidence";

export type FileEvidenceCleanupStatus = "COMPLETED" | "PENDING";

export type FileEvidenceCleanupDependencies = ServiceDependencies & {
  storage: EvidenceStorage;
};

export type FileEvidenceCleanupResult = {
  evidenceId: string;
  cleanupStatus: FileEvidenceCleanupStatus;
};

export type RemovedFileEvidenceResult = FileEvidenceCleanupResult & {
  kind: "REMOVED";
};

function fileEvidence(workflow: Awaited<ReturnType<typeof ownedCase>>, evidenceId: string): EvidenceItemRecord {
  const evidence = workflow.evidenceItems.find((item) => item.id === evidenceId);
  if (!evidence) throw new FraudCaseApplicationError("EVIDENCE_NOT_FOUND");
  if (evidence.kind !== "FILE") throw new FraudCaseApplicationError("INVALID_FILE_EVIDENCE_METADATA");
  return evidence;
}

function trustedQuarantineLocator(evidence: EvidenceItemRecord): StorageObjectLocator | null {
  if (!evidence.uploadIdempotencyKey) return null;
  try {
    return buildQuarantineObjectLocator(evidence.uploadIdempotencyKey);
  } catch {
    return null;
  }
}

function trustedRemovedFinalLocator(evidence: EvidenceItemRecord): StorageObjectLocator | null | undefined {
  const storedLocator = evidence.storageObjectKey;
  const sha256 = evidence.sha256;
  const hasLocator = storedLocator !== null;
  const hasHash = sha256 !== null;
  if (!hasLocator && !hasHash) return undefined;
  if (!hasLocator || !hasHash) return null;
  try {
    const locator = buildFinalEvidenceObjectLocator({
      caseId: evidence.caseId,
      evidenceId: evidence.id,
      sha256,
    });
    return locator === storedLocator ? locator : null;
  } catch {
    return null;
  }
}

async function deleteExactObject(storage: EvidenceStorage, locator: StorageObjectLocator): Promise<boolean> {
  try {
    return await storage.deleteObjectBestEffort(locator);
  } catch {
    return false;
  }
}

async function cleanTrustedEvidence(evidence: EvidenceItemRecord, storage: EvidenceStorage): Promise<FileEvidenceCleanupStatus> {
  const required: Array<StorageObjectLocator | null> = [trustedQuarantineLocator(evidence)];
  if (evidence.status === "REMOVED") {
    const finalLocator = trustedRemovedFinalLocator(evidence);
    if (finalLocator !== undefined) required.push(finalLocator);
  }
  const outcomes = await Promise.all(required.map((locator) => locator === null ? false : deleteExactObject(storage, locator)));
  return outcomes.every(Boolean) ? "COMPLETED" : "PENDING";
}

export async function cleanupFileEvidenceStorage(
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceCleanupDependencies,
): Promise<FileEvidenceCleanupResult> {
  const workflow = await ownedCase(deps.repository, input.caseId);
  const evidence = fileEvidence(workflow, input.evidenceId);
  if (evidence.status !== "READY" && evidence.status !== "REJECTED" && evidence.status !== "REMOVED") {
    throw new FraudCaseApplicationError("FILE_EVIDENCE_CLEANUP_NOT_ALLOWED");
  }
  return {
    evidenceId: evidence.id,
    cleanupStatus: await cleanTrustedEvidence(evidence, deps.storage),
  };
}

export async function removeFileEvidence(
  input: { caseId: string; evidenceId: string },
  deps: FileEvidenceCleanupDependencies,
): Promise<RemovedFileEvidenceResult> {
  const before = await ownedCase(deps.repository, input.caseId);
  fileEvidence(before, input.evidenceId);
  const removed = await removeEvidence(input, deps);
  const evidence = fileEvidence(removed, input.evidenceId);
  if (evidence.status !== "REMOVED") throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  return {
    kind: "REMOVED",
    evidenceId: evidence.id,
    cleanupStatus: await cleanTrustedEvidence(evidence, deps.storage),
  };
}
