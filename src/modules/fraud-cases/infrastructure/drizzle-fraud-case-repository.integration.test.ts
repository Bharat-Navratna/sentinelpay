import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDatabase } from "../../../db/client";
import {
  caseEvents,
  evidenceExtractionReviews,
  evidenceExtractionRuns,
  evidenceItems,
  fraudCaseReports,
  fraudCases,
  paymentEvents,
  paymentInterventions,
  paymentRiskAssessments,
  payments,
} from "../../../db/schema";
import { addInlineEvidence, removeEvidence } from "../application/manage-inline-evidence";
import {
  claimFileEvidenceValidation,
  createFileEvidence,
  reserveValidatedFileMetadata,
  retryStaleFileEvidenceValidation,
} from "../application/manage-file-evidence";
import { buildFinalEvidenceObjectLocator } from "../../evidence/application/evidence-object-keys";
import {
  claimExtractionRun,
  completeExtractionRun,
  createExtractionRun,
  failExtractionRun,
  reviewExtraction,
} from "../application/manage-extractions";
import { createOrResumeFraudCase } from "../application/create-or-resume-fraud-case";
import { saveFraudCaseReport } from "../application/save-fraud-case-report";
import { submitFraudCase } from "../application/submit-fraud-case";
import type { ServiceDependencies } from "../application/case-service-helpers";
import {
  DrizzleFraudCaseRepository,
  isNamedUniqueViolation,
} from "./drizzle-fraud-case-repository";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
if (enabled) config({ path: ".env.local", quiet: true });
const integrationDescribe = enabled ? describe.sequential : describe.skip;

const ACCOUNT_ID = "20000000-0000-4000-8000-000000000001";
const BENEFICIARY_ID = "30000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-08T12:00:00.000Z");
const output = {
  believedPurpose: null,
  impersonatedOrganisation: null,
  pressureOrUrgency: null,
  guaranteedReturns: null,
  toldToIgnoreWarnings: null,
  remoteAccessRequested: null,
  uncertaintyNotes: [],
};
const completeReport = {
  suspectedScamCategory: "INVESTMENT" as const,
  believedPaymentPurpose: "Synthetic investment demonstration",
  contactChannel: "MESSAGING_APP" as const,
  firstContactAt: new Date("2026-08-01T09:00:00.000Z"),
  discoveredAt: new Date("2026-08-02T10:00:00.000Z"),
  discoveryReason: "The synthetic organisation stopped responding.",
  narrative: "This is a controlled synthetic report used only for database integration verification.",
  pressureOrUrgency: "YES" as const,
  guaranteedReturns: "UNSURE" as const,
  toldToIgnoreWarnings: "NO" as const,
  remoteAccessRequested: "NO" as const,
  impersonatedOrganisation: "Synthetic Investments",
  additionalSupportRequested: false,
};

type Workflow = Awaited<ReturnType<typeof createOrResumeFraudCase>>;

integrationDescribe("Drizzle fraud-case repository against Neon PostgreSQL", () => {
  const db = enabled ? getDatabase() : null!;
  const repository = enabled ? new DrizzleFraudCaseRepository(db) : null!;
  const paymentIds: string[] = [];
  const caseIds: string[] = [];
  const evidenceIds: string[] = [];
  const runIds: string[] = [];

  function deps(now: Date = NOW): ServiceDependencies {
    return { repository, now: () => new Date(now) };
  }

  async function createPayment(): Promise<string> {
    const id = randomUUID();
    paymentIds.push(id);
    await db.insert(payments).values({
      id,
      accountId: ACCOUNT_ID,
      beneficiaryId: BENEFICIARY_ID,
      amountMinor: 12_345,
      currencyCode: "GBP",
      reference: "M3 PostgreSQL integration",
      status: "SETTLED",
      idempotencyKey: `m3-integration-${randomUUID()}`,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return id;
  }

  async function createCase(): Promise<Workflow> {
    const workflow = await createOrResumeFraudCase(await createPayment(), deps());
    caseIds.push(workflow.fraudCase.id);
    return workflow;
  }

  async function createCompleteCase(): Promise<Workflow> {
    const workflow = await createCase();
    return saveFraudCaseReport(
      { caseId: workflow.fraudCase.id, expectedVersion: 1, report: completeReport },
      deps(),
    );
  }

  async function addText(caseId: string, text: string, key = randomUUID()) {
    const evidence = await addInlineEvidence(
      { caseId, kind: "PASTED_TEXT", category: "MESSAGE_CONVERSATION", content: text, idempotencyKey: key },
      deps(),
    );
    if (!evidenceIds.includes(evidence.id)) evidenceIds.push(evidence.id);
    return evidence;
  }

  async function createFile(caseId: string, key = randomUUID()) {
    const evidence = await createFileEvidence({
      caseId,
      category: "OTHER_DOCUMENT",
      originalFilename: "synthetic-evidence.png",
      declaredMimeType: "image/png",
      uploadIdempotencyKey: key,
    }, deps());
    if (!evidenceIds.includes(evidence.id)) evidenceIds.push(evidence.id);
    return evidence;
  }

  async function createRun(caseId: string, evidenceId: string, hash: string, key = randomUUID()) {
    const run = await createExtractionRun({
      caseId,
      evidenceItemId: evidenceId,
      evidenceSha256: hash,
      idempotencyKey: key,
      provider: "integration-fake",
      model: "deterministic",
      modelVersion: "1",
      promptVersion: "integration-v1",
      schemaVersion: "v1",
    }, deps());
    if (!runIds.includes(run.id)) runIds.push(run.id);
    return run;
  }

  function databaseCode(error: unknown): unknown {
    let value = error;
    for (let depth = 0; depth < 4 && typeof value === "object" && value !== null; depth += 1) {
      const shape = value as { code?: unknown; cause?: unknown };
      if (shape.code !== undefined) return shape.code;
      value = shape.cause;
    }
    return undefined;
  }

  async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      await operation();
      return undefined;
    } catch (error) {
      return error;
    }
  }

  beforeAll(async () => {
    const context = await repository.loadCustomerContext();
    expect(context?.accountId).toBe(ACCOUNT_ID);
  });

  afterAll(async () => {
    try {
      if (runIds.length) await db.delete(evidenceExtractionReviews).where(inArray(evidenceExtractionReviews.extractionRunId, runIds));
      if (caseIds.length) await db.delete(caseEvents).where(inArray(caseEvents.caseId, caseIds));
      if (evidenceIds.length) await db.delete(evidenceExtractionRuns).where(inArray(evidenceExtractionRuns.evidenceItemId, evidenceIds));
      if (caseIds.length) await db.delete(evidenceItems).where(inArray(evidenceItems.caseId, caseIds));
      if (caseIds.length) await db.delete(fraudCaseReports).where(inArray(fraudCaseReports.caseId, caseIds));
      if (caseIds.length) await db.delete(fraudCases).where(inArray(fraudCases.id, caseIds));
      if (paymentIds.length) {
        await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, paymentIds));
        await db.delete(paymentInterventions).where(inArray(paymentInterventions.paymentId, paymentIds));
        await db.delete(paymentRiskAssessments).where(inArray(paymentRiskAssessments.paymentId, paymentIds));
        await db.delete(payments).where(inArray(payments.id, paymentIds));
      }
      const [remainingCases] = caseIds.length
        ? await db.select({ value: count() }).from(fraudCases).where(inArray(fraudCases.id, caseIds))
        : [{ value: 0 }];
      const [remainingPayments] = paymentIds.length
        ? await db.select({ value: count() }).from(payments).where(inArray(payments.id, paymentIds))
        : [{ value: 0 }];
      expect({ cases: remainingCases?.value, payments: remainingPayments?.value }).toEqual({ cases: 0, payments: 0 });
    } catch {
      throw new Error(`Integration cleanup failed for generated cases: ${caseIds.join(",")}`);
    }
  });

  it("verifies the applied M3 schema and critical indexes", async () => {
    const tableResult = await db.execute(sql`select count(*)::int as count from information_schema.tables where table_schema='public' and table_name in ('fraud_cases','fraud_case_reports','evidence_items','evidence_extraction_runs','evidence_extraction_reviews','case_events')`);
    expect(tableResult.rows[0]).toMatchObject({ count: 6 });
    const indexResult = await db.execute(sql`select indexname from pg_indexes where schemaname='public' and indexname in ('case_events_case_id_event_sequence_idx','evidence_extraction_runs_one_active_idx','evidence_extraction_runs_one_completed_idx') order by indexname`);
    expect(indexResult.rows.map((row) => row.indexname)).toEqual(["case_events_case_id_event_sequence_idx", "evidence_extraction_runs_one_active_idx", "evidence_extraction_runs_one_completed_idx"]);
    const checks = await db.execute(sql`select conname from pg_constraint where conname in ('fraud_cases_reference_format_check','evidence_items_kind_fields_check','evidence_items_file_lifecycle_check') order by conname`);
    expect(checks.rows).toHaveLength(3);
  });

  it("recognizes only the intended live PostgreSQL uniqueness error shapes", async () => {
    const workflow = await createCase();
    const duplicateCaseError = await captureFailure(() => db.insert(fraudCases).values({
      id: randomUUID(), paymentId: workflow.payment.id, caseReference: `SP-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      status: "DRAFT", createdAt: NOW, updatedAt: NOW,
    }));
    expect(isNamedUniqueViolation(duplicateCaseError, "fraud_cases_payment_id_idx")).toBe(true);

    const creationKey = randomUUID();
    const evidence = await addText(workflow.fraudCase.id, "Unique classifier evidence", creationKey);
    const duplicateEvidenceError = await captureFailure(() => db.insert(evidenceItems).values({
      id: randomUUID(), caseId: workflow.fraudCase.id, kind: "PASTED_TEXT", category: "OTHER_DOCUMENT", status: "READY",
      inlineText: evidence.inlineText, sha256: evidence.sha256, creationIdempotencyKey: creationKey, createdAt: NOW, updatedAt: NOW,
    }));
    expect(isNamedUniqueViolation(duplicateEvidenceError, "evidence_items_creation_idempotency_key_idx")).toBe(true);

    const run = await createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!);
    const duplicateActiveError = await captureFailure(() => db.insert(evidenceExtractionRuns).values({
      id: randomUUID(), evidenceItemId: evidence.id, evidenceSha256: evidence.sha256!, status: "PENDING", idempotencyKey: randomUUID(),
      provider: "integration-fake", model: "deterministic", modelVersion: "1", promptVersion: "integration-v1", schemaVersion: "v1", createdAt: NOW,
    }));
    expect(isNamedUniqueViolation(duplicateActiveError, "evidence_extraction_runs_one_active_idx")).toBe(true);
    await claimExtractionRun(workflow.fraudCase.id, run.id, deps());
    await completeExtractionRun(workflow.fraudCase.id, run.id, output, deps());
    const review = await reviewExtraction({ caseId: workflow.fraudCase.id, runId: run.id, status: "CONFIRMED" }, deps());
    const duplicateReviewError = await captureFailure(() => db.insert(evidenceExtractionReviews).values({
      id: randomUUID(), extractionRunId: run.id, status: "CONFIRMED", reviewedAt: NOW,
    }));
    expect(isNamedUniqueViolation(duplicateReviewError, "evidence_extraction_reviews_run_id_idx")).toBe(true);
    expect(isNamedUniqueViolation(duplicateCaseError, "evidence_extraction_reviews_run_id_idx")).toBe(false);
    expect(review.status).toBe("CONFIRMED");
  });

  it("creates and resumes exactly one complete draft workflow, including a concurrent retry", async () => {
    const paymentId = await createPayment();
    const [first, second] = await Promise.all([
      createOrResumeFraudCase(paymentId, deps()),
      createOrResumeFraudCase(paymentId, deps()),
    ]);
    caseIds.push(first.fraudCase.id);
    expect(second.fraudCase.id).toBe(first.fraudCase.id);
    expect(first.fraudCase.caseReference).toMatch(/^SP-[A-F0-9]{12}$/);
    const loaded = await repository.loadCase(first.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.report.version).toBe(1);
    expect(loaded?.events.filter((event) => event.eventType === "CASE_DRAFT_CREATED")).toHaveLength(1);
    expect((await createOrResumeFraudCase(paymentId, deps())).fraudCase.id).toBe(first.fraudCase.id);
  });

  it("enforces optimistic report concurrency and chronology before persistence", async () => {
    const workflow = await createCase();
    const attempts = await Promise.allSettled([
      saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: 1, report: { believedPaymentPurpose: "Winner A" } }, deps()),
      saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: 1, report: { believedPaymentPurpose: "Winner B" } }, deps()),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { code: "REPORT_STALE" } });
    let loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.report.version).toBe(2);
    expect(loaded?.events.filter((event) => event.eventType === "REPORT_UPDATED")).toHaveLength(1);
    loaded = await saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: 2, report: completeReport }, deps());
    expect(loaded.report.version).toBe(3);
    const beforeInvalid = loaded.events.length;
    await expect(saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: 3, report: { discoveredAt: new Date("2026-08-08T12:05:00.001Z") } }, deps())).rejects.toMatchObject({ code: "INVALID_SCAM_REPORT_CHRONOLOGY" });
    await expect(saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: 3, report: { firstContactAt: new Date("2026-08-03T00:00:00Z"), discoveredAt: new Date("2026-08-02T00:00:00Z") } }, deps())).rejects.toMatchObject({ code: "INVALID_SCAM_REPORT_CHRONOLOGY" });
    expect((await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID))?.events).toHaveLength(beforeInvalid);
  });

  it("persists normalized inline evidence idempotently and removes it without losing provenance", async () => {
    const workflow = await createCase();
    const key = randomUUID();
    const first = await addText(workflow.fraudCase.id, " Cafe\u0301\r\nsynthetic text ", key);
    const retry = await addText(workflow.fraudCase.id, " Cafe\u0301\r\nsynthetic text ", key);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ status: "READY", inlineText: "Café\nsynthetic text", creationIdempotencyKey: key });
    await expect(addText(workflow.fraudCase.id, "Different text", key)).rejects.toMatchObject({ code: "EVIDENCE_IDEMPOTENCY_CONFLICT" });
    await removeEvidence({ caseId: workflow.fraudCase.id, evidenceId: first.id }, deps());
    await removeEvidence({ caseId: workflow.fraudCase.id, evidenceId: first.id }, deps());
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.evidenceItems[0]).toMatchObject({ status: "REMOVED", inlineText: "Café\nsynthetic text", sha256: first.sha256, creationIdempotencyKey: key });
    expect(loaded?.events.filter((event) => event.eventType === "INLINE_EVIDENCE_ADDED")).toHaveLength(1);
    expect(loaded?.events.filter((event) => event.eventType === "EVIDENCE_REMOVED")).toHaveLength(1);
  });

  it("serializes two evidence creations at the ten-active-item boundary", async () => {
    const workflow = await createCase();
    for (let index = 0; index < 9; index += 1) await addText(workflow.fraudCase.id, `Synthetic item ${index}`);
    const attempts = await Promise.allSettled([
      addText(workflow.fraudCase.id, "Boundary A"),
      addText(workflow.fraudCase.id, "Boundary B"),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { code: "EVIDENCE_LIMIT_REACHED" } });
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.evidenceItems.filter((item) => item.status !== "REMOVED")).toHaveLength(10);
    expect(loaded?.events.filter((event) => event.eventType === "INLINE_EVIDENCE_ADDED")).toHaveLength(10);
  });

  it("rejects invalid evidence and case-reference rows through live CHECK constraints", async () => {
    const workflow = await createCase();
    const invalidRows = [
      { id: randomUUID(), kind: "PASTED_TEXT" as const, status: "VALIDATING" as const, inlineText: "synthetic", sha256: "a".repeat(64), creationIdempotencyKey: randomUUID() },
      { id: randomUUID(), kind: "CALL_NOTE" as const, status: "REJECTED" as const, inlineText: "synthetic", sha256: "b".repeat(64), creationIdempotencyKey: randomUUID() },
      { id: randomUUID(), kind: "FILE" as const, status: "VALIDATING" as const, originalFilename: "synthetic.pdf" },
      { id: randomUUID(), kind: "FILE" as const, status: "READY" as const, originalFilename: "synthetic.pdf", storageObjectKey: `integration/${randomUUID()}` },
    ];
    for (const row of invalidRows) {
      evidenceIds.push(row.id);
      await expect(db.insert(evidenceItems).values({ caseId: workflow.fraudCase.id, category: "OTHER_DOCUMENT", createdAt: NOW, updatedAt: NOW, ...row })).rejects.toSatisfy((error: unknown) => databaseCode(error) === "23514");
    }
    const paymentId = await createPayment();
    const invalidCaseId = randomUUID(); caseIds.push(invalidCaseId);
    await expect(db.insert(fraudCases).values({ id: invalidCaseId, paymentId, caseReference: "invalid", status: "DRAFT", createdAt: NOW, updatedAt: NOW })).rejects.toSatisfy((error: unknown) => databaseCode(error) === "23514");
  });

  it("serializes concurrent FILE creation at the fifth-item boundary", async () => {
    const workflow = await createCase();
    for (let index = 0; index < 4; index += 1) await createFile(workflow.fraudCase.id);
    const attempts = await Promise.allSettled([
      createFile(workflow.fraudCase.id),
      createFile(workflow.fraudCase.id),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { code: "FILE_EVIDENCE_LIMIT_REACHED" } });
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.evidenceItems.filter((item) => item.kind === "FILE" && item.status !== "REMOVED")).toHaveLength(5);
    expect(loaded?.events.filter((event) => event.eventType === "EVIDENCE_UPLOAD_REQUESTED")).toHaveLength(5);
  });

  it("allows one validation claimant and fences a worker after stale reclaim", async () => {
    const workflow = await createCase();
    const evidence = await createFile(workflow.fraudCase.id);
    const claims = await Promise.all([
      claimFileEvidenceValidation({ caseId: workflow.fraudCase.id, evidenceId: evidence.id }, deps()),
      claimFileEvidenceValidation({ caseId: workflow.fraudCase.id, evidenceId: evidence.id }, deps()),
    ]);
    const claimed = claims.find((item) => item.kind === "CLAIMED");
    expect(claimed?.kind).toBe("CLAIMED");
    expect(claims.filter((item) => item.kind === "IN_PROGRESS")).toHaveLength(1);
    if (!claimed || claimed.kind !== "CLAIMED") return;
    const reclaimed = await retryStaleFileEvidenceValidation(
      { caseId: workflow.fraudCase.id, evidenceId: evidence.id },
      deps(new Date(claimed.validationToken.getTime() + 10 * 60_000)),
    );
    expect(reclaimed.kind).toBe("RECLAIMED");
    const sha256 = "c".repeat(64);
    await expect(reserveValidatedFileMetadata({
      caseId: workflow.fraudCase.id,
      evidenceId: evidence.id,
      validationToken: claimed.validationToken,
      sizeBytes: 100,
      detectedMimeType: "image/png",
      sha256,
      finalLocator: buildFinalEvidenceObjectLocator({ caseId: workflow.fraudCase.id, evidenceId: evidence.id, sha256 }),
    }, deps())).rejects.toMatchObject({ code: "EVIDENCE_VALIDATION_CONFLICT" });
  });

  it("serializes authoritative byte reservations so concurrent candidates cannot exceed 20 MiB", async () => {
    const workflow = await createCase();
    const mebibyte = 1024 * 1024;
    for (const [index, sizeBytes] of [5, 5, 4].entries()) {
      const evidenceId = randomUUID();
      const sha256 = String(index + 1).repeat(64);
      evidenceIds.push(evidenceId);
      await db.insert(evidenceItems).values({
        id: evidenceId,
        caseId: workflow.fraudCase.id,
        kind: "FILE",
        category: "OTHER_DOCUMENT",
        status: "READY",
        originalFilename: `synthetic-${index}.png`,
        storageObjectKey: buildFinalEvidenceObjectLocator({ caseId: workflow.fraudCase.id, evidenceId, sha256 }),
        declaredMimeType: "image/png",
        detectedMimeType: "image/png",
        sizeBytes: sizeBytes * mebibyte,
        sha256,
        uploadIdempotencyKey: randomUUID(),
        uploadedAt: NOW,
        validatedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    const candidates = await Promise.all([createFile(workflow.fraudCase.id), createFile(workflow.fraudCase.id)]);
    const claims = await Promise.all(candidates.map((evidence) => claimFileEvidenceValidation({ caseId: workflow.fraudCase.id, evidenceId: evidence.id }, deps())));
    expect(claims.every((claim) => claim.kind === "CLAIMED")).toBe(true);
    const sizes = [3 * mebibyte, 4 * mebibyte];
    const reservations = await Promise.all(claims.map((claim, index) => {
      if (claim.kind !== "CLAIMED") throw new Error("Expected FILE validation claim");
      const sha256 = (index === 0 ? "a" : "b").repeat(64);
      return reserveValidatedFileMetadata({
        caseId: workflow.fraudCase.id,
        evidenceId: claim.evidence.id,
        validationToken: claim.validationToken,
        sizeBytes: sizes[index],
        detectedMimeType: "image/png",
        sha256,
        finalLocator: buildFinalEvidenceObjectLocator({ caseId: workflow.fraudCase.id, evidenceId: claim.evidence.id, sha256 }),
      }, deps());
    }));
    expect(reservations.map((item) => item.kind).sort()).toEqual(["REJECTED", "RESERVED"]);
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    const countedBytes = loaded!.evidenceItems
      .filter((item) => item.kind === "FILE" && (item.status === "READY" || (item.status === "VALIDATING" && item.sizeBytes !== null)))
      .reduce((total, item) => total + (item.sizeBytes ?? 0), 0);
    expect(countedBytes).toBeLessThanOrEqual(20 * mebibyte);
    expect(loaded?.events.filter((event) => event.eventType === "EVIDENCE_REJECTED")).toHaveLength(1);
  });

  it("enforces active and completed extraction uniqueness and preserves failed attempts", async () => {
    const workflow = await createCase();
    const evidence = await addText(workflow.fraudCase.id, "Synthetic extraction source");
    const attempts = await Promise.allSettled([
      createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!, randomUUID()),
      createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!, randomUUID()),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { code: "FRAUD_CASE_PERSISTENCE_CONFLICT" } });
    const active = attempts.find((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof createRun>>> => item.status === "fulfilled")!.value;
    await claimExtractionRun(workflow.fraudCase.id, active.id, deps());
    await failExtractionRun(workflow.fraudCase.id, active.id, "SYNTHETIC_FAILURE", deps());
    const retry = await createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!);
    await claimExtractionRun(workflow.fraudCase.id, retry.id, deps());
    const completed = await completeExtractionRun(workflow.fraudCase.id, retry.id, output, deps());
    const duplicateId = randomUUID(); runIds.push(duplicateId);
    let completedError: unknown;
    try {
      await db.insert(evidenceExtractionRuns).values({ ...completed, id: duplicateId, idempotencyKey: randomUUID() });
    } catch (error) { completedError = error; }
    expect(isNamedUniqueViolation(completedError, "evidence_extraction_runs_one_completed_idx")).toBe(true);
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.extractionRuns.map((run) => run.status).sort()).toEqual(["COMPLETED", "FAILED"]);
    expect(loaded?.extractionRuns.find((run) => run.status === "COMPLETED")?.machineOutput).toEqual(output);
  });

  it("persists one review and keeps machine output immutable", async () => {
    const workflow = await createCase();
    const evidence = await addText(workflow.fraudCase.id, "Synthetic review source");
    const run = await createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!);
    await claimExtractionRun(workflow.fraudCase.id, run.id, deps());
    await completeExtractionRun(workflow.fraudCase.id, run.id, output, deps());
    const corrected = { ...output, uncertaintyNotes: ["Synthetic customer correction"] };
    const review = await reviewExtraction({ caseId: workflow.fraudCase.id, runId: run.id, status: "CORRECTED", correctedOutput: corrected }, deps());
    expect((await reviewExtraction({ caseId: workflow.fraudCase.id, runId: run.id, status: "CORRECTED", correctedOutput: corrected }, deps())).id).toBe(review.id);
    await expect(reviewExtraction({ caseId: workflow.fraudCase.id, runId: run.id, status: "CONFIRMED" }, deps())).rejects.toMatchObject({ code: "EXTRACTION_REVIEW_ALREADY_EXISTS" });
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    expect(loaded?.extractionRuns[0].machineOutput).toEqual(output);
    expect(loaded?.extractionReviews[0].correctedOutput).toEqual(corrected);
    expect(loaded?.events.filter((event) => event.eventType === "EXTRACTION_REVIEWED")).toHaveLength(1);
  });

  it("submits once without evidence and leaves the payment unchanged", async () => {
    const workflow = await createCompleteCase();
    const paymentEventsBefore = await db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, workflow.payment.id));
    const submitted = await submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps());
    expect(submitted.fraudCase).toMatchObject({ status: "SUBMITTED" });
    expect(submitted.fraudCase.submittedAt).not.toBeNull();
    const retried = await submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps());
    expect(retried.fraudCase.id).toBe(submitted.fraudCase.id);
    expect(retried.events.filter((event) => event.eventType === "CASE_SUBMITTED")).toHaveLength(1);
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, workflow.payment.id)))[0]?.status).toBe("SETTLED");
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, workflow.payment.id))).toEqual(paymentEventsBefore);
    expect(await db.select().from(paymentRiskAssessments).where(eq(paymentRiskAssessments.paymentId, workflow.payment.id))).toEqual([]);
    expect(await db.select().from(paymentInterventions).where(eq(paymentInterventions.paymentId, workflow.payment.id))).toEqual([]);
  });

  it("serializes submission against report and evidence creation", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const workflow = await createCompleteCase();
      const reportAndSubmit = await Promise.allSettled([
        saveFraudCaseReport({ caseId: workflow.fraudCase.id, expectedVersion: workflow.report.version, report: { ...completeReport, believedPaymentPurpose: `Concurrent report ${attempt}` } }, deps()),
        submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps()),
      ]);
      expect(reportAndSubmit.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
      expect(loaded!.events.map((event) => event.eventSequence)).toEqual(loaded!.events.map((_, index) => index + 1));
      const submitted = loaded!.events.find((event) => event.eventType === "CASE_SUBMITTED");
      const report = loaded!.events.find((event) => event.eventType === "REPORT_UPDATED" && event.eventSequence > 2);
      expect(!submitted || !report || report.eventSequence < submitted.eventSequence).toBe(true);
    }
    const workflow = await createCompleteCase();
    const evidenceAndSubmit = await Promise.allSettled([
      addText(workflow.fraudCase.id, "Concurrent evidence"),
      submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps()),
    ]);
    expect(evidenceAndSubmit.some((item) => item.status === "fulfilled")).toBe(true);
    const loaded = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    const submittedIndex = loaded!.events.findIndex((event) => event.eventType === "CASE_SUBMITTED");
    expect(submittedIndex < 0 || loaded!.events.slice(submittedIndex + 1).every((event) => event.eventType !== "INLINE_EVIDENCE_ADDED")).toBe(true);
  });

  it("serializes submission against extraction completion and requires review", async () => {
    const workflow = await createCompleteCase();
    const evidence = await addText(workflow.fraudCase.id, "Concurrent extraction");
    const run = await createRun(workflow.fraudCase.id, evidence.id, evidence.sha256!);
    await claimExtractionRun(workflow.fraudCase.id, run.id, deps());
    const race = await Promise.allSettled([
      completeExtractionRun(workflow.fraudCase.id, run.id, output, deps()),
      submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps()),
    ]);
    expect(race.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const current = await repository.loadCase(workflow.fraudCase.id, ACCOUNT_ID);
    if (current?.fraudCase.status === "DRAFT") {
      const completed = current.extractionRuns.find((item) => item.status === "COMPLETED");
      expect(completed).toBeDefined();
      await expect(submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps())).rejects.toMatchObject({ code: "CASE_SUBMISSION_BLOCKED" });
      await reviewExtraction({ caseId: workflow.fraudCase.id, runId: completed!.id, status: "CONFIRMED" }, deps());
      expect((await submitFraudCase({ caseId: workflow.fraudCase.id, submissionIdempotencyKey: randomUUID() }, deps())).fraudCase.status).toBe("SUBMITTED");
    }
  });
}, 60_000);
