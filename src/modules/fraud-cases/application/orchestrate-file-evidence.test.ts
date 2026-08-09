import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { EvidenceStorage, EvidenceUploadGrant, PutValidatedObjectResult, StoredObjectMetadata } from "../../evidence/application/evidence-storage";
import { EvidenceStorageError } from "../../evidence/application/evidence-storage-errors";
import { buildFinalEvidenceObjectLocator, buildQuarantineObjectLocator, type StorageObjectLocator } from "../../evidence/application/evidence-object-keys";
import { fileValidationErrorCodes, FileValidationError, type FileEvidenceValidator, type ValidatedFileEvidence } from "../../evidence/application/file-evidence-validator";
import { InMemoryEvidenceStorage } from "../../evidence/application/testing/in-memory-evidence-storage";
import { MAX_EVIDENCE_FILE_BYTES } from "../../evidence/domain/evidence";
import { ServerFileEvidenceValidator } from "../../evidence/infrastructure/validate-file-evidence";
import { createOrResumeFraudCase } from "./create-or-resume-fraud-case";
import { FraudCaseApplicationError } from "./fraud-case-application-errors";
import type { AtomicResult } from "./fraud-case-repository";
import type { FinalizeFileReadyCommand } from "./fraud-case-types";
import { claimFileEvidenceValidation, createFileEvidence, finalizeFileEvidenceReady, finalizeFileEvidenceRejected, reserveValidatedFileMetadata, retryStaleFileEvidenceValidation } from "./manage-file-evidence";
import {
  confirmAndProcessFileEvidenceUpload,
  issueFileEvidenceUploadGrant,
  processClaimedFileEvidenceUpload,
  recoverStaleFileEvidenceValidation,
  type FileEvidenceOrchestrationDependencies,
} from "./orchestrate-file-evidence";
import { InMemoryFraudCaseRepository } from "./testing/in-memory-fraud-case-repository";

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "20000000-0000-4000-8000-000000000001";
const PAYMENT_ID = "40000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "50000000-0000-4000-8000-000000000001";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=", "base64"));

class RecordingStorage implements EvidenceStorage {
  readonly calls: string[] = [];
  readonly putResults: PutValidatedObjectResult["kind"][] = [];
  beforePut?: () => Promise<void>;
  readError?: unknown;
  putError?: unknown;
  grantError?: unknown;
  deleteResult?: boolean;
  deleteError?: unknown;

  constructor(readonly base = new InMemoryEvidenceStorage(), private readonly order?: string[]) {}
  private record(value: string) { this.calls.push(value); this.order?.push(value); }
  seed(locator: StorageObjectLocator, bytes: Uint8Array) { this.base.seedObject(locator, bytes); }
  async createUploadGrant(input: { locator: StorageObjectLocator; contentType: string; expiresAt: Date }): Promise<EvidenceUploadGrant> {
    this.record(`grant:${input.locator}:${input.contentType}:${input.expiresAt.toISOString()}`);
    if (this.grantError) throw this.grantError;
    return this.base.createUploadGrant(input);
  }
  async headObject(locator: StorageObjectLocator): Promise<StoredObjectMetadata> { this.record("head"); return this.base.headObject(locator); }
  async readObjectBounded(locator: StorageObjectLocator, maximumBytes: number): Promise<Uint8Array> {
    this.record(`read:${maximumBytes}`);
    if (this.readError) throw this.readError;
    return this.base.readObjectBounded(locator, maximumBytes);
  }
  async putValidatedObject(locator: StorageObjectLocator, bytes: Uint8Array, contentType: string): Promise<PutValidatedObjectResult> {
    this.record(`put:${contentType}`);
    if (this.beforePut) await this.beforePut();
    if (this.putError) throw this.putError;
    const result = await this.base.putValidatedObject(locator, bytes, contentType);
    this.putResults.push(result.kind);
    return result;
  }
  async deleteObjectBestEffort(locator: StorageObjectLocator): Promise<boolean> {
    this.record(`delete:${locator}`);
    if (this.deleteError) throw this.deleteError;
    if (this.deleteResult !== undefined) return this.deleteResult;
    return this.base.deleteObjectBestEffort(locator);
  }
}

class RecordingRepository extends InMemoryFraudCaseRepository {
  constructor(private readonly order: string[]) { super({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [{ id: PAYMENT_ID, accountId: ACCOUNT_ID, beneficiaryId: randomUUID(), beneficiaryName: "Synthetic", amountMinor: 10_000, currencyCode: "GBP", reference: "Synthetic", status: "SETTLED", createdAt: new Date("2026-08-01T00:00:00Z") }]); }
  override async claimFileValidationAtomically(command: Parameters<InMemoryFraudCaseRepository["claimFileValidationAtomically"]>[0]) { this.order.push("db:claim"); return super.claimFileValidationAtomically(command); }
  override async reserveFileMetadataAtomically(command: Parameters<InMemoryFraudCaseRepository["reserveFileMetadataAtomically"]>[0]) { this.order.push("db:reserve"); return super.reserveFileMetadataAtomically(command); }
  override async finalizeFileReadyAtomically(command: FinalizeFileReadyCommand) { this.order.push("db:ready"); return super.finalizeFileReadyAtomically(command); }
  override async finalizeFileRejectedAtomically(command: Parameters<InMemoryFraudCaseRepository["finalizeFileRejectedAtomically"]>[0]) { this.order.push("db:rejected"); return super.finalizeFileRejectedAtomically(command); }
}

class FailReadyOnceRepository extends InMemoryFraudCaseRepository {
  failReadyOnce = true;
  override async finalizeFileReadyAtomically(command: FinalizeFileReadyCommand): Promise<AtomicResult> {
    if (this.failReadyOnce) {
      this.failReadyOnce = false;
      throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
    }
    return super.finalizeFileReadyAtomically(command);
  }
}

class FailRejectedRepository extends InMemoryFraudCaseRepository {
  override async finalizeFileRejectedAtomically(): Promise<AtomicResult> {
    throw new FraudCaseApplicationError("FRAUD_CASE_PERSISTENCE_CONFLICT");
  }
}

function validatorResult(bytes: Uint8Array, overrides: Partial<ValidatedFileEvidence> = {}): ValidatedFileEvidence {
  return { detectedMimeType: "image/png", sizeBytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), pdfPageCount: null, ...overrides };
}

async function setup(input: { repository?: InMemoryFraudCaseRepository; storage?: RecordingStorage; validator?: FileEvidenceValidator } = {}) {
  const repository = input.repository ?? new InMemoryFraudCaseRepository({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [{ id: PAYMENT_ID, accountId: ACCOUNT_ID, beneficiaryId: randomUUID(), beneficiaryName: "Synthetic", amountMinor: 10_000, currencyCode: "GBP", reference: "Synthetic", status: "SETTLED", createdAt: new Date("2026-08-01T00:00:00Z") }]);
  const storage = input.storage ?? new RecordingStorage();
  const validator = input.validator ?? new ServerFileEvidenceValidator();
  let currentTime = Date.parse("2026-08-09T12:00:00.000Z");
  const deps: FileEvidenceOrchestrationDependencies = { repository, storage, validator, now: () => new Date(currentTime), uuid: randomUUID };
  const workflow = await createOrResumeFraudCase(PAYMENT_ID, deps);
  const evidence = await createFileEvidence({ caseId: workflow.fraudCase.id, category: "EMAIL", originalFilename: "synthetic.png", declaredMimeType: "image/png", uploadIdempotencyKey: UPLOAD_ID }, deps);
  const quarantine = buildQuarantineObjectLocator(UPLOAD_ID);
  return { repository, storage, validator, deps, workflow, evidence, quarantine, setTime: (value: Date) => { currentTime = value.getTime(); } };
}

async function loaded(value: Awaited<ReturnType<typeof setup>>) {
  return value.repository.loadCase(value.workflow.fraudCase.id, ACCOUNT_ID);
}

describe("FILE evidence storage orchestration", () => {
  it("issues and reissues a grant for the trusted quarantine locator", async () => {
    const value = await setup();
    const first = await issueFileEvidenceUploadGrant({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    const second = await issueFileEvidenceUploadGrant({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    expect(first).toMatchObject({ method: "PUT", requiredHeaders: { "Content-Type": "image/png" } });
    expect(value.storage.calls[0]).toContain(value.quarantine);
    expect(second.expiresAt).toEqual(first.expiresAt);
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "AWAITING_UPLOAD", uploadExpiresAt: first.expiresAt });
  });

  it("leaves evidence AWAITING_UPLOAD when grant signing fails", async () => {
    const storage = new RecordingStorage(); storage.grantError = new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    const value = await setup({ storage });
    await expect(issueFileEvidenceUploadGrant({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "AWAITING_UPLOAD", uploadExpiresAt: expect.any(Date) });
  });

  it("completes the bounded read, validation, reservation, promotion and READY workflow", async () => {
    const value = await setup(); value.storage.seed(value.quarantine, PNG);
    const result = await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    const hash = createHash("sha256").update(PNG).digest("hex");
    const finalLocator = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, sha256: hash });
    expect(result).toEqual({ kind: "READY", evidenceId: value.evidence.id, cleanupStatus: "COMPLETED" });
    expect((await value.storage.readObjectBounded(finalLocator, MAX_EVIDENCE_FILE_BYTES))).toEqual(PNG);
    const workflow = await loaded(value);
    expect(workflow?.evidenceItems[0]).toMatchObject({ status: "READY", storageObjectKey: finalLocator, sizeBytes: PNG.byteLength, detectedMimeType: "image/png", sha256: hash });
    expect(workflow?.events.map((event) => event.eventType)).toEqual(["CASE_DRAFT_CREATED", "EVIDENCE_UPLOAD_REQUESTED", "EVIDENCE_VALIDATION_STARTED", "EVIDENCE_VALIDATED"]);
    expect(value.storage.calls).toContain(`delete:${value.quarantine}`);
  });

  it("orders short database boundaries around external storage and validation work", async () => {
    const order: string[] = [];
    const repository = new RecordingRepository(order);
    const storage = new RecordingStorage(new InMemoryEvidenceStorage(), order);
    const validator: FileEvidenceValidator = { validate: async ({ bytes }) => { order.push("validator"); return validatorResult(bytes); } };
    const value = await setup({ repository, storage, validator }); storage.seed(value.quarantine, PNG);
    await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    expect(order).toEqual(["db:claim", `read:${MAX_EVIDENCE_FILE_BYTES}`, "validator", "db:reserve", "put:image/png", "db:ready", `delete:${value.quarantine}`]);
  });

  it("maps a missing quarantine object to a fenced rejection", async () => {
    const value = await setup();
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toEqual({ kind: "REJECTED", evidenceId: value.evidence.id, cleanupStatus: "COMPLETED" });
    const workflow = await loaded(value);
    expect(workflow?.evidenceItems[0]).toMatchObject({ status: "REJECTED", safeFailureCode: "FILE_UPLOAD_NOT_FOUND" });
    expect(workflow?.events.map((event) => event.eventType).at(-1)).toBe("EVIDENCE_REJECTED");
  });

  it("commits REJECTED before attempting terminal quarantine cleanup", async () => {
    const order: string[] = [];
    const repository = new RecordingRepository(order);
    const storage = new RecordingStorage(new InMemoryEvidenceStorage(), order);
    const validator: FileEvidenceValidator = { validate: async () => { throw new FileValidationError("FILE_TYPE_UNSUPPORTED"); } };
    const value = await setup({ repository, storage, validator }); storage.seed(value.quarantine, PNG);
    await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    expect(order.at(-2)).toBe("db:rejected");
    expect(order.at(-1)).toBe(`delete:${value.quarantine}`);
  });

  it("maps bounded-read overflow without invoking the validator or final put", async () => {
    const validator = { validate: vi.fn() } satisfies FileEvidenceValidator;
    const value = await setup({ validator }); value.storage.seed(value.quarantine, new Uint8Array(MAX_EVIDENCE_FILE_BYTES + 1));
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REJECTED" });
    expect(validator.validate).not.toHaveBeenCalled();
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ safeFailureCode: "FILE_TOO_LARGE" });
  });

  it.each(["STORAGE_TEMPORARILY_UNAVAILABLE", "STORAGE_OBJECT_CHANGED"] as const)("leaves VALIDATING on retryable read failure %s", async (code) => {
    const validator = { validate: vi.fn() } satisfies FileEvidenceValidator;
    const storage = new RecordingStorage(); storage.readError = new EvidenceStorageError(code);
    const value = await setup({ storage, validator });
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code });
    expect(validator.validate).not.toHaveBeenCalled();
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", safeFailureCode: null });
  });

  it.each(fileValidationErrorCodes)("maps validator failure %s to the same safe rejection", async (code) => {
    const validator: FileEvidenceValidator = { validate: async () => { throw new FileValidationError(code); } };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, PNG);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REJECTED" });
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "REJECTED", safeFailureCode: code });
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
  });

  it("leaves VALIDATING for an unexpected validator failure", async () => {
    const validator: FileEvidenceValidator = { validate: async () => { throw new Error("internal parser detail"); } };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, PNG);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FILE_EVIDENCE_PROCESSING_FAILED", message: "The evidence file could not be processed safely." });
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", safeFailureCode: null });
  });

  it("does not put a final object after aggregate-capacity rejection", async () => {
    const bytes = new Uint8Array([1]);
    const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    for (let index = 0; index < 4; index += 1) value.repository.addEvidenceFixture(value.workflow.fraudCase.id, readyFixture(value.workflow.fraudCase.id, 5 * 1024 * 1024, index));
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REJECTED" });
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "REJECTED", safeFailureCode: "CASE_FILE_BYTES_LIMIT_EXCEEDED" });
    expect(value.storage.calls).toContain(`delete:${value.quarantine}`);
    expect((await loaded(value))?.events.filter((event) => event.eventType === "EVIDENCE_REJECTED")).toHaveLength(1);
  });

  it.each([false, "throw"] as const)("keeps READY authoritative when terminal cleanup is %s", async (failure) => {
    const storage = new RecordingStorage();
    if (failure === false) storage.deleteResult = false;
    else storage.deleteError = new Error("raw provider detail");
    const value = await setup({ storage }); storage.seed(value.quarantine, PNG);
    const result = await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    expect(result).toMatchObject({ kind: "READY", cleanupStatus: "PENDING" });
    expect((await loaded(value))?.evidenceItems[0].status).toBe("READY");
    storage.deleteResult = undefined; storage.deleteError = undefined;
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "READY", cleanupStatus: "COMPLETED" });
    expect((await loaded(value))?.events.filter((event) => event.eventType === "EVIDENCE_VALIDATED")).toHaveLength(1);
  });

  it.each([false, "throw"] as const)("keeps REJECTED authoritative when terminal cleanup is %s", async (failure) => {
    const validator: FileEvidenceValidator = { validate: async () => { throw new FileValidationError("FILE_TYPE_UNSUPPORTED"); } };
    const storage = new RecordingStorage();
    if (failure === false) storage.deleteResult = false;
    else storage.deleteError = new Error("raw provider detail");
    const value = await setup({ storage, validator }); storage.seed(value.quarantine, PNG);
    const result = await confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    expect(result).toMatchObject({ kind: "REJECTED", cleanupStatus: "PENDING" });
    expect((await loaded(value))?.evidenceItems[0].status).toBe("REJECTED");
    storage.deleteResult = undefined; storage.deleteError = undefined;
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "REJECTED", cleanupStatus: "COMPLETED" });
    expect((await loaded(value))?.events.filter((event) => event.eventType === "EVIDENCE_REJECTED")).toHaveLength(1);
  });

  it("does not cleanup or report REJECTED when rejection persistence fails", async () => {
    const repository = new FailRejectedRepository({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [{ id: PAYMENT_ID, accountId: ACCOUNT_ID, beneficiaryId: randomUUID(), beneficiaryName: "Synthetic", amountMinor: 10_000, currencyCode: "GBP", reference: "Synthetic", status: "SETTLED", createdAt: new Date("2026-08-01T00:00:00Z") }]);
    const validator: FileEvidenceValidator = { validate: async () => { throw new FileValidationError("FILE_TYPE_UNSUPPORTED"); } };
    const value = await setup({ repository, validator }); value.storage.seed(value.quarantine, PNG);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FRAUD_CASE_PERSISTENCE_CONFLICT" });
    expect((await loaded(value))?.evidenceItems[0].status).toBe("VALIDATING");
    expect((await loaded(value))?.events.some((event) => event.eventType === "EVIDENCE_REJECTED")).toBe(false);
    expect(value.storage.calls.some((call) => call.startsWith("delete:"))).toBe(false);
    await expect(value.storage.readObjectBounded(value.quarantine, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(PNG);
  });

  it("does not reclaim active validation before the stale threshold", async () => {
    const value = await setup(); value.storage.seed(value.quarantine, PNG);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected initial validation claim.");
    value.storage.calls.length = 0;
    value.setTime(new Date(claim.validationToken.getTime() + 10 * 60_000 - 1));
    await expect(recoverStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toEqual({ kind: "IN_PROGRESS", evidenceId: value.evidence.id });
    expect(value.storage.calls).toEqual([]);
  });

  it("reclaims stale unreserved validation and completes it with one restart event", async () => {
    const value = await setup(); value.storage.seed(value.quarantine, PNG);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected initial validation claim.");
    value.setTime(new Date(claim.validationToken.getTime() + 10 * 60_000));
    await expect(recoverStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "READY", cleanupStatus: "COMPLETED" });
    const events = (await loaded(value))!.events;
    expect(events.filter((event) => event.eventType === "EVIDENCE_VALIDATION_STARTED")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "EVIDENCE_VALIDATION_RESTARTED")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "EVIDENCE_VALIDATED")).toHaveLength(1);
  });

  it("reclaims a stale reservation without double-counting its prior bytes", async () => {
    const bytes = new Uint8Array(MAX_EVIDENCE_FILE_BYTES);
    const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected initial validation claim.");
    const metadata = validatorResult(bytes);
    const finalLocator = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, sha256: metadata.sha256 });
    await reserveValidatedFileMetadata({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, ...metadata, finalLocator }, value.deps);
    for (let index = 0; index < 3; index += 1) value.repository.addEvidenceFixture(value.workflow.fraudCase.id, readyFixture(value.workflow.fraudCase.id, MAX_EVIDENCE_FILE_BYTES, index));
    value.setTime(new Date(claim.validationToken.getTime() + 10 * 60_000));
    await expect(recoverStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "READY" });
    expect((await loaded(value))?.evidenceItems[0].status).toBe("READY");
  });

  it("reclaims stale validation and naturally reuses an existing final object", async () => {
    const bytes = new Uint8Array([7, 8, 9]); const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected initial validation claim.");
    const metadata = validatorResult(bytes); const finalLocator = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, sha256: metadata.sha256 });
    await reserveValidatedFileMetadata({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, ...metadata, finalLocator }, value.deps);
    value.storage.seed(finalLocator, bytes);
    value.setTime(new Date(claim.validationToken.getTime() + 10 * 60_000));
    await expect(recoverStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).resolves.toMatchObject({ kind: "READY" });
    expect(value.storage.putResults).toEqual(["ALREADY_EXISTS"]);
  });

  it("fences every old-token terminal mutation after stale reclaim and preserves quarantine", async () => {
    const value = await setup(); value.storage.seed(value.quarantine, PNG);
    const claim = await claimFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    if (claim.kind !== "CLAIMED") throw new Error("Expected initial validation claim.");
    const metadata = validatorResult(PNG); const finalLocator = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, sha256: metadata.sha256 });
    value.setTime(new Date(claim.validationToken.getTime() + 10 * 60_000));
    await retryStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    await expect(reserveValidatedFileMetadata({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, ...metadata, finalLocator }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
    await expect(finalizeFileEvidenceReady({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, ...metadata, finalLocator }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
    await expect(finalizeFileEvidenceRejected({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: claim.validationToken, safeFailureCode: "FILE_TYPE_UNSUPPORTED" }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
    expect(value.storage.calls.some((call) => call.startsWith("delete:"))).toBe(false);
    await expect(value.storage.readObjectBounded(value.quarantine, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(PNG);
  });

  it.each(["STORAGE_TEMPORARILY_UNAVAILABLE", "STORAGE_DESTINATION_CONFLICT", "STORAGE_OBJECT_CHANGED"] as const)("leaves the reservation VALIDATING after final storage failure %s", async (code) => {
    const bytes = new Uint8Array([1, 2]); const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const storage = new RecordingStorage(); storage.putError = new EvidenceStorageError(code);
    const value = await setup({ storage, validator }); storage.seed(value.quarantine, bytes);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code });
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", sizeBytes: bytes.byteLength, safeFailureCode: null });
  });

  it("recovers through ALREADY_EXISTS after final storage succeeds but READY persistence fails", async () => {
    const repository = new FailReadyOnceRepository({ customerId: CUSTOMER_ID, accountId: ACCOUNT_ID }, [{ id: PAYMENT_ID, accountId: ACCOUNT_ID, beneficiaryId: randomUUID(), beneficiaryName: "Synthetic", amountMinor: 10_000, currencyCode: "GBP", reference: "Synthetic", status: "SETTLED", createdAt: new Date("2026-08-01T00:00:00Z") }]);
    const bytes = new Uint8Array([1, 2, 3]); const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const value = await setup({ repository, validator }); value.storage.seed(value.quarantine, bytes);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FRAUD_CASE_PERSISTENCE_CONFLICT" });
    const validating = (await loaded(value))!.evidenceItems[0];
    expect(validating.status).toBe("VALIDATING");
    await expect(processClaimedFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, validationToken: validating.validationStartedAt! }, value.deps)).resolves.toMatchObject({ kind: "READY" });
    expect(value.storage.putResults).toEqual(["CREATED", "ALREADY_EXISTS"]);
  });

  it("fences T1 before promotion when T2 reclaims during validation", async () => {
    const holder: { value?: Awaited<ReturnType<typeof setup>> } = {};
    const bytes = new Uint8Array([1]);
    const validator: FileEvidenceValidator = { validate: async () => {
      const value = holder.value!;
      const current = (await loaded(value))!.evidenceItems[0].validationStartedAt!;
      value.setTime(new Date(current.getTime() + 10 * 60_000));
      await retryStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
      return validatorResult(bytes);
    } };
    const value = await setup({ validator }); holder.value = value; value.storage.seed(value.quarantine, bytes);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", sizeBytes: null });
  });

  it("fences T1 finalization without deleting the final object when T2 reclaims after reservation", async () => {
    const bytes = new Uint8Array([1]); const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    value.storage.beforePut = async () => {
      const current = (await loaded(value))!.evidenceItems[0].validationStartedAt!;
      value.setTime(new Date(current.getTime() + 10 * 60_000));
      await retryStaleFileEvidenceValidation({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps);
    };
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
    const metadata = validatorResult(bytes); const finalLocator = buildFinalEvidenceObjectLocator({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id, sha256: metadata.sha256 });
    await expect(value.storage.readObjectBounded(finalLocator, MAX_EVIDENCE_FILE_BYTES)).resolves.toEqual(bytes);
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", sizeBytes: bytes.byteLength });
    expect(value.storage.calls.some((call) => call.startsWith("delete:"))).toBe(false);
  });

  it("rejects inconsistent PDF page-count audit metadata without final promotion", async () => {
    const bytes = new Uint8Array([1]);
    const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes, { detectedMimeType: "application/pdf", pdfPageCount: null }) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FILE_EVIDENCE_PROCESSING_FAILED" });
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
  });

  it("rejects inconsistent validator byte metadata before capacity reservation", async () => {
    const bytes = new Uint8Array([1, 2]);
    const validator: FileEvidenceValidator = { validate: async () => validatorResult(bytes, { sizeBytes: 1 }) };
    const value = await setup({ validator }); value.storage.seed(value.quarantine, bytes);
    await expect(confirmAndProcessFileEvidenceUpload({ caseId: value.workflow.fraudCase.id, evidenceId: value.evidence.id }, value.deps)).rejects.toMatchObject({ code: "FILE_EVIDENCE_PROCESSING_FAILED" });
    expect((await loaded(value))?.evidenceItems[0]).toMatchObject({ status: "VALIDATING", sizeBytes: null });
    expect(value.storage.calls.some((call) => call.startsWith("put:"))).toBe(false);
  });
});

function readyFixture(caseId: string, sizeBytes: number, index: number) {
  const id = randomUUID(); const sha256 = String(index + 1).repeat(64); const at = new Date("2026-08-01T00:00:00Z");
  return { id, caseId, kind: "FILE" as const, category: "OTHER_DOCUMENT" as const, status: "READY" as const, originalFilename: `fixture-${index}.png`, storageObjectKey: buildFinalEvidenceObjectLocator({ caseId, evidenceId: id, sha256 }), declaredMimeType: "image/png", detectedMimeType: "image/png", sizeBytes, sha256, inlineText: null, capturedAt: null, creationIdempotencyKey: null, uploadIdempotencyKey: randomUUID(), uploadExpiresAt: null, validationStartedAt: null, uploadedAt: at, validatedAt: at, safeFailureCode: null, createdAt: at, updatedAt: at };
}
