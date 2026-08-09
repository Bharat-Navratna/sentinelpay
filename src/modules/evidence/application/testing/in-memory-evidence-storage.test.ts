import { describe, expect, it } from "vitest";

import { buildQuarantineObjectLocator } from "../evidence-object-keys";
import { EvidenceStorageError } from "../evidence-storage-errors";
import { InMemoryEvidenceStorage } from "./in-memory-evidence-storage";

const first = buildQuarantineObjectLocator("00000000-0000-4000-8000-000000000001");
const second = buildQuarantineObjectLocator("00000000-0000-4000-8000-000000000002");

describe("InMemoryEvidenceStorage", () => {
  it("isolates objects by their exact locator and returns defensive copies", async () => {
    const storage = new InMemoryEvidenceStorage();
    storage.seedObject(first, new Uint8Array([1, 2]));
    storage.seedObject(second, new Uint8Array([3, 4]));

    const bytes = await storage.readObjectBounded(first, 2);
    bytes[0] = 9;

    expect(Array.from(await storage.readObjectBounded(first, 2))).toEqual([1, 2]);
    expect(Array.from(await storage.readObjectBounded(second, 2))).toEqual([3, 4]);
  });

  it("enforces the authoritative bounded-read limit", async () => {
    const storage = new InMemoryEvidenceStorage();
    storage.seedObject(first, new Uint8Array([1, 2]));
    let caught: unknown;
    try {
      await storage.readObjectBounded(first, 1);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "STORAGE_READ_LIMIT_EXCEEDED",
      message: "The evidence object exceeds the permitted read size.",
    } satisfies Partial<EvidenceStorageError>);
    expect((caught as Error).message).not.toContain("1, 2");
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid maximumBytes %s as programming input",
    async (maximumBytes) => {
      const storage = new InMemoryEvidenceStorage();
      storage.seedObject(first, new Uint8Array([1]));
      await expect(storage.readObjectBounded(first, maximumBytes)).rejects.toBeInstanceOf(RangeError);
    },
  );

  it("continues to return an ordinary valid bounded read", async () => {
    const storage = new InMemoryEvidenceStorage();
    storage.seedObject(first, new Uint8Array([1, 2]));
    await expect(storage.readObjectBounded(first, 2)).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it("maps missing and temporary failures to safe errors", async () => {
    const storage = new InMemoryEvidenceStorage();
    await expect(storage.headObject(first)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_NOT_FOUND",
    } satisfies Partial<EvidenceStorageError>);

    storage.simulateTemporaryFailureOnce();
    await expect(storage.headObject(first)).rejects.toMatchObject({
      code: "STORAGE_TEMPORARILY_UNAVAILABLE",
    } satisfies Partial<EvidenceStorageError>);
  });

  it("deletes only the targeted object", async () => {
    const storage = new InMemoryEvidenceStorage();
    storage.seedObject(first, new Uint8Array([1]));
    storage.seedObject(second, new Uint8Array([2]));

    expect(await storage.deleteObjectBestEffort(first)).toBe(true);
    await expect(storage.headObject(first)).rejects.toMatchObject({
      code: "STORAGE_OBJECT_NOT_FOUND",
    });
    await expect(storage.headObject(second)).resolves.toEqual({ sizeBytes: 1 });
  });

  it("treats an already-absent exact object as completed cleanup", async () => {
    const storage = new InMemoryEvidenceStorage();
    await expect(storage.deleteObjectBestEffort(first)).resolves.toBe(true);
  });

  it("returns false rather than exposing cleanup failures", async () => {
    const storage = new InMemoryEvidenceStorage();
    storage.seedObject(first, new Uint8Array([1]));
    storage.simulateTemporaryFailureOnce();
    expect(await storage.deleteObjectBestEffort(first)).toBe(false);
  });

  it("creates an obviously synthetic PUT grant with expiry semantics", async () => {
    const storage = new InMemoryEvidenceStorage();
    const expiresAt = new Date("2030-01-01T00:05:00.000Z");
    const grant = await storage.createUploadGrant({
      locator: first,
      contentType: "application/pdf",
      expiresAt,
    });

    expect(grant).toEqual({
      url: expect.stringMatching(/^https:\/\/synthetic-storage\.invalid\/upload\//u),
      method: "PUT",
      requiredHeaders: { "Content-Type": "application/pdf" },
      expiresAt,
    });
    expect(grant.url).not.toMatch(/token|credential|signature|amazon|backblaze/iu);
  });

  it("models idempotent validated writes and destination conflicts", async () => {
    const storage = new InMemoryEvidenceStorage();
    await expect(storage.putValidatedObject(first, new Uint8Array([1]), "image/png"))
      .resolves.toEqual({ kind: "CREATED" });
    await expect(storage.putValidatedObject(first, new Uint8Array([1]), "image/png"))
      .resolves.toEqual({ kind: "ALREADY_EXISTS" });
    await expect(storage.putValidatedObject(first, new Uint8Array([2]), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_DESTINATION_CONFLICT" });
  });
});
