import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { EvidenceStorage, EvidenceUploadGrant, PutValidatedObjectResult, StoredObjectMetadata } from "../../evidence/application/evidence-storage";
import { buildFinalEvidenceObjectLocator, buildQuarantineObjectLocator, type StorageObjectLocator } from "../../evidence/application/evidence-object-keys";
import type { FileEvidenceValidator } from "../../evidence/application/file-evidence-validator";
import { InMemoryEvidenceStorage } from "../../evidence/application/testing/in-memory-evidence-storage";
import { MAX_EVIDENCE_FILE_BYTES } from "../../evidence/domain/evidence";
import { saveFraudCaseReport } from "./save-fraud-case-report";
import { cleanupFileEvidenceStorage, removeFileEvidence, type FileEvidenceCleanupDependencies } from "./cleanup-file-evidence";
import { createOrResumeFraudCase } from "./create-or-resume-fraud-case";
import type { RemoveEvidenceCommand } from "./fraud-case-types";
import { claimFileEvidenceValidation, createFileEvidence } from "./manage-file-evidence";
import { confirmAndProcessFileEvidenceUpload } from "./orchestrate-file-evidence";
import { submitFraudCase } from "./submit-fraud-case";
import { InMemoryFraudCaseRepository } from "./testing/in-memory-fraud-case-repository";

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "20000000-0000-4000-8000-000000000001";
const PAYMENT_ID = "40000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "50000000-0000-4000-8000-000000000001";
const BYTES = new Uint8Array([1, 2, 3]);

class CleanupStorage implements EvidenceStorage {
  readonly deleted: StorageObjectLocator[] = [];
  deleteResult: boolean | undefined;
  throwOnDelete = false;
  constructor(readonly base = new InMemoryEvidenceStorage(), private readonly order?: string[]) {}
  seed(locator: StorageObjectLocator, bytes = BYTES) { this.base.seedObject(locator, bytes); }
  createUploadGrant(input: { locator: StorageObjectLocator; contentType: string; expiresAt: Date }): Promise<EvidenceUploadGrant> { return this.base.createUploadGrant(input); }
  headObject(locator: StorageObjectLocator): Promise<StoredObjectMetadata> { return this.base.headObject(locator); }
  readObjectBounded(locator: StorageObjectLocator, maximumBytes: number): Promise<Uint8Array> { return this.base.readObjectBounded(locator, maximumBytes); }
  putValidatedObject(locator: StorageObjectLocator, bytes: Uint8Array, contentType: string): Promise<PutValidatedObjectResult> { return this.base.putValidatedObject(locator, bytes, contentType); }
  async deleteObjectBestEffort(locator: StorageObjectLocator): Promise<boolean> {
    this.order?.push(`delete:${locator}`); this.deleted.push(locator);
    if (this.throwOnDelete) throw new Error("raw provider detail");
    if (this.deleteResult !== undefined) return this.deleteResult;
    return this.base.deleteObjectBestEffort(locator);
  }
}

class OrderedRepository extends InMemoryFraudCaseRepository {
  constructor(private readonly order: string[]) { super({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [payment()]); }
  override async removeEvidenceAtomically(command: RemoveEvidenceCommand) {
    this.order.push("db:remove");
    return super.removeEvidenceAtomically(command);
  }
}

class FailingRemoveRepository extends InMemoryFraudCaseRepository {
  override async removeEvidenceAtomically() { return { kind: "CONFLICT" } as const; }
}

const payment = () => ({ id: PAYMENT_ID, accountId: ACCOUNT_ID, beneficiaryId: randomUUID(), beneficiaryName: "Synthetic", amountMinor: 10_000, currencyCode: "GBP", reference: "Synthetic", status: "SETTLED" as const, createdAt: new Date("2026-08-01T00:00:00Z") });
const validator: FileEvidenceValidator = { validate: async ({ bytes }) => ({ detectedMimeType: "image/png", sizeBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), pdfPageCount: null }) };

async function setup(input: { repository?: InMemoryFraudCaseRepository; storage?: CleanupStorage } = {}) {
  const repository = input.repository ?? new InMemoryFraudCaseRepository({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [payment()]);
  const storage = input.storage ?? new CleanupStorage();
  const deps: FileEvidenceCleanupDependencies & { validator: FileEvidenceValidator } = { repository, storage, validator, now: () => new Date("2026-08-09T12:00:00Z"), uuid: randomUUID };
  const workflow = await createOrResumeFraudCase(PAYMENT_ID, deps);
  const evidence = await createFileEvidence({ caseId: workflow.fraudCase.id, category: "EMAIL", originalFilename: "synthetic.png", declaredMimeType: "image/png", uploadIdempotencyKey: UPLOAD_ID }, deps);
  const quarantine = buildQuarantineObjectLocator(UPLOAD_ID);
  return { repository, storage, deps, workflow, evidence, quarantine };
}

async function ready(value: Awaited<ReturnType<typeof setup>>) {
  value.storage.seed(value.quarantine);
  await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
  const loaded = await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID);
  return loaded!.evidenceItems.find((item) => item.id === value.evidence.id)!;
}

describe("FILE evidence cleanup and removal", () => {
  it("removes AWAITING_UPLOAD in PostgreSQL authority before exact quarantine cleanup", async () => {
    const order: string[] = []; const repository = new OrderedRepository(order); const storage = new CleanupStorage(new InMemoryEvidenceStorage(), order);
    const value = await setup({ repository, storage }); storage.seed(value.quarantine);
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toEqual({ kind: "REMOVED", evidenceId: value.evidence.id, cleanupStatus: "COMPLETED" });
    expect(order).toEqual(["db:remove", `delete:${value.quarantine}`]);
    expect((await repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))?.events.filter((event) => event.eventType === "EVIDENCE_REMOVED")).toHaveLength(1);
  });

  it("treats missing quarantine as completed AWAITING_UPLOAD removal cleanup", async () => {
    const value = await setup();
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REMOVED", cleanupStatus: "COMPLETED" });
  });

  it("removes READY before deleting exact quarantine and final objects while preserving provenance", async () => {
    const value = await setup(); const before = await ready(value); const finalLocator = before.storageObjectKey as StorageObjectLocator;
    value.storage.seed(value.quarantine);
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REMOVED", cleanupStatus: "COMPLETED" });
    const after = (await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))!.evidenceItems[0];
    expect(after).toMatchObject({ status: "REMOVED", originalFilename: before.originalFilename, uploadIdempotencyKey: before.uploadIdempotencyKey, detectedMimeType: before.detectedMimeType, sizeBytes: before.sizeBytes, sha256: before.sha256, storageObjectKey: before.storageObjectKey, validatedAt: before.validatedAt });
    await expect(value.storage.readObjectBounded(value.quarantine, MAX_EVIDENCE_FILE_BYTES)).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_FOUND" });
    await expect(value.storage.readObjectBounded(finalLocator, MAX_EVIDENCE_FILE_BYTES)).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_FOUND" });
  });

  it("removes REJECTED and deletes quarantine without speculative final deletion", async () => {
    const value = await setup(); value.storage.seed(value.quarantine);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected claim.");
    await value.repository.finalizeFileRejectedAtomically({ accountId: ACCOUNT_ID, caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, safeFailureCode: "FILE_TYPE_UNSUPPORTED", completedAt: new Date(), event: { id: randomUUID(), caseId: value.workflow.fraudCase.id, evidenceItemId: value.evidence.id, eventType: "EVIDENCE_REJECTED", actorType: "SYSTEM", requestIdempotencyKey: null, metadata: { simulation: true }, occurredAt: new Date() } });
    value.storage.deleted.length = 0;
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REMOVED", cleanupStatus: "COMPLETED" });
    expect(value.storage.deleted).toEqual([value.quarantine]);
  });

  it("rejects VALIDATING removal and performs no cleanup", async () => {
    const value = await setup(); value.storage.seed(value.quarantine);
    await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_REMOVAL_NOT_ALLOWED" });
    expect(value.storage.deleted).toEqual([]);
  });

  it("rejects removal after submission and performs no cleanup", async () => {
    const value = await setup(); await ready(value);
    await saveFraudCaseReport({ caseId: value.workflow.fraudCase.id, expectedVersion: 1, report: { suspectedScamCategory: "OTHER", believedPaymentPurpose: "Synthetic purpose", contactChannel: "EMAIL", discoveredAt: new Date("2026-08-01T00:00:00Z"), discoveryReason: "Synthetic discovery reason", narrative: "A sufficiently long synthetic narrative for submission.", pressureOrUrgency: "NO", guaranteedReturns: "NO", toldToIgnoreWarnings: "NO", remoteAccessRequested: "NO", additionalSupportRequested: false } }, value.deps);
    await submitFraudCase({ caseId: value.workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, value.deps);
    value.storage.deleted.length = 0;
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_REMOVAL_NOT_ALLOWED" });
    expect(value.storage.deleted).toEqual([]);
  });

  it("performs no cleanup when the authoritative removal mutation fails", async () => {
    const repository = new FailingRemoveRepository({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [payment()]);
    const value = await setup({ repository }); value.storage.seed(value.quarantine);
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FRAUD_CASE_PERSISTENCE_CONFLICT" });
    expect(value.storage.deleted).toEqual([]);
    expect((await repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))?.evidenceItems[0].status).toBe("AWAITING_UPLOAD");
  });

  it("retries already-REMOVED cleanup without another lifecycle event", async () => {
    const value = await setup(); value.storage.deleteResult = false;
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ cleanupStatus: "PENDING" });
    value.storage.deleteResult = undefined;
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ cleanupStatus: "COMPLETED" });
    expect((await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))?.events.filter((event) => event.eventType === "EVIDENCE_REMOVED")).toHaveLength(1);
  });

  it.each([false, "throw"] as const)("keeps REMOVED authoritative when cleanup is %s", async (failure) => {
    const value = await setup();
    if (failure === false) value.storage.deleteResult = false;
    else value.storage.throwOnDelete = true;
    await expect(removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REMOVED", cleanupStatus: "PENDING" });
    expect((await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))?.evidenceItems[0].status).toBe("REMOVED");
  });

  it("cleans READY quarantine only and preserves the final object", async () => {
    const value = await setup(); const evidence = await ready(value); const finalLocator = evidence.storageObjectKey as StorageObjectLocator;
    value.storage.seed(value.quarantine);
    const eventCount = (await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))!.events.length;
    await expect(cleanupFileEvidenceStorage({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ cleanupStatus: "COMPLETED" });
    await expect(value.storage.readObjectBounded(finalLocator, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(BYTES);
    expect(value.storage.deleted).not.toContain(finalLocator);
    expect((await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))!.events).toHaveLength(eventCount);
  });

  it.each(["AWAITING_UPLOAD", "VALIDATING"] as const)("does not cleanup %s evidence", async (status) => {
    const value = await setup(); value.storage.seed(value.quarantine);
    if (status === "VALIDATING") await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    await expect(cleanupFileEvidenceStorage({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FILE_EVIDENCE_CLEANUP_NOT_ALLOWED" });
    expect(value.storage.deleted).toEqual([]);
  });

  it("fails closed on mismatched retained final metadata and leaves unrelated objects untouched", async () => {
    const value = await setup(); await ready(value); await removeFileEvidence({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    const unrelatedId = randomUUID(); const unrelated = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: unrelatedId, sha256: "f".repeat(64) });
    value.storage.seed(unrelated);
    const removed = (await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))!.evidenceItems[0];
    value.repository.addEvidenceFixture(value.workflow.fraudCase.id, { ...removed, id: randomUUID(), storageObjectKey: unrelated, sha256: "a".repeat(64), uploadIdempotencyKey: randomUUID() });
    const corruptId = (await value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID))!.evidenceItems.at(-1)!.id;
    await expect(cleanupFileEvidenceStorage({ caseId: value.workflow.fraudCase.id, evidenceId: corruptId }, value.deps)).resolves.toMatchObject({ cleanupStatus: "PENDING" });
    await expect(value.storage.readObjectBounded(unrelated, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(BYTES);
  });

  it("cannot cleanup another case or evidence item by locator", async () => {
    const value = await setup(); const unrelated = buildQuarantineObjectLocator(randomUUID()); value.storage.seed(unrelated);
    await expect(cleanupFileEvidenceStorage({ caseId: value.workflow.fraudCase.id, evidenceId: randomUUID() }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND" });
    await expect(cleanupFileEvidenceStorage({ caseId: randomUUID(), evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FRAUD_CASE_NOT_FOUND" });
    expect(value.storage.deleted).toEqual([]);
    await expect(value.storage.readObjectBounded(unrelated, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(BYTES);
  });
});
