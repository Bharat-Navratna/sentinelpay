import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { buildQuarantineObjectLocator } from "../../application/evidence-object-keys";
import { B2EvidenceStorage } from "./b2-evidence-storage";
import type { B2StorageConfig } from "./b2-storage-config";

const config: B2StorageConfig = {
  endpoint: "https://storage.example.invalid",
  region: "test-region-1",
  keyId: "synthetic-key-id",
  applicationKey: "synthetic-application-secret",
  bucketName: "synthetic-evidence",
};
const locator = buildQuarantineObjectLocator("00000000-0000-4000-8000-000000000001");
const adjacent = buildQuarantineObjectLocator("00000000-0000-4000-8000-000000000002");
const now = new Date("2030-01-01T00:00:00.000Z");

async function* chunks(...values: Array<Uint8Array | unknown>): AsyncIterable<unknown> {
  for (const value of values) yield value;
}

function notFound(): Error & { $metadata: { httpStatusCode: number } } {
  return Object.assign(new Error("raw missing provider detail"), {
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });
}

function adapter(send: (command: unknown) => Promise<unknown>) {
  return new B2EvidenceStorage(config, {
    send,
    presignPut: async () => "https://signed-upload.invalid/bearer",
    now: () => now,
  });
}

describe("B2EvidenceStorage createUploadGrant", () => {
  it("signs an exact-key PUT for five minutes with deterministic headers", async () => {
    const send = vi.fn<(command: unknown) => Promise<unknown>>(async () => ({}));
    const presignPut = vi.fn<(
      command: PutObjectCommand,
      expiresIn: number,
      signingDate: Date,
    ) => Promise<string>>(
      async () => "https://signed-upload.invalid/bearer",
    );
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const storage = new B2EvidenceStorage(config, { send, presignPut, now: () => now });
    const expiresAt = new Date(now.getTime() + 300_000);

    const grant = await storage.createUploadGrant({
      locator,
      contentType: "application/pdf",
      expiresAt,
    });

    expect(grant).toEqual({
      url: "https://signed-upload.invalid/bearer",
      method: "PUT",
      requiredHeaders: { "Content-Type": "application/pdf" },
      expiresAt,
    });
    expect(presignPut).toHaveBeenCalledTimes(1);
    const [command, expiresIn, signingDate] = presignPut.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "synthetic-evidence",
      Key: locator,
      ContentType: "application/pdf",
    });
    expect(command.input.Key).not.toBe(adjacent);
    expect(expiresIn).toBe(300);
    expect(signingDate).toEqual(now);
    expect(consoleLog).not.toHaveBeenCalled();
    consoleLog.mockRestore();
  });

  it("translates signer rejection without exposing raw details", async () => {
    const storage = new B2EvidenceStorage(config, {
      send: async () => ({}),
      presignPut: async () => { throw new Error("raw signer query and credential"); },
      now: () => now,
    });
    let caught: unknown;
    try {
      await storage.createUploadGrant({
        locator,
        contentType: "image/png",
        expiresAt: new Date(now.getTime() + 300_000),
      });
    } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    expect((caught as Error).message).not.toContain("signer");
  });

  it.each([
    [300_001, "overlong"],
    [999, "less than one second"],
    [0, "zero"],
    [-1, "expired"],
  ])("rejects %s ms remaining as %s", async (remainingMilliseconds) => {
    const presignPut = vi.fn(async () => "https://signed-upload.invalid/bearer");
    const storage = new B2EvidenceStorage(config, {
      send: async () => ({}),
      presignPut,
      now: () => now,
    });
    await expect(storage.createUploadGrant({
      locator,
      contentType: "image/png",
      expiresAt: new Date(now.getTime() + remainingMilliseconds),
    })).rejects.toBeInstanceOf(RangeError);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it("rejects an invalid expiry date before signing", async () => {
    const presignPut = vi.fn(async () => "https://signed-upload.invalid/bearer");
    const storage = new B2EvidenceStorage(config, {
      send: async () => ({}),
      presignPut,
      now: () => now,
    });
    await expect(storage.createUploadGrant({
      locator,
      contentType: "image/png",
      expiresAt: new Date(Number.NaN),
    })).rejects.toBeInstanceOf(RangeError);
    expect(presignPut).not.toHaveBeenCalled();
  });

  it.each([
    [299_500, 299],
    [1_000, 1],
    [60_000, 60],
  ])("conservatively signs %s ms remaining for %s whole seconds", async (
    remainingMilliseconds,
    expectedSeconds,
  ) => {
    const presignPut = vi.fn(async () => "https://signed-upload.invalid/bearer");
    const storage = new B2EvidenceStorage(config, {
      send: async () => ({}),
      presignPut,
      now: () => now,
    });
    const expiresAt = new Date(now.getTime() + remainingMilliseconds);

    const grant = await storage.createUploadGrant({
      locator,
      contentType: "image/png",
      expiresAt,
    });

    expect(presignPut).toHaveBeenCalledWith(expect.any(PutObjectCommand), expectedSeconds, now);
    expect(grant.expiresAt).toEqual(expiresAt);
  });
});

describe("B2EvidenceStorage headObject", () => {
  it("returns only an authoritative safe byte length", async () => {
    await expect(adapter(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect((command as HeadObjectCommand).input).toEqual({ Bucket: "synthetic-evidence", Key: locator });
      return { ContentLength: 42, ETag: "not-a-business-hash", VersionId: "ignored" };
    }).headObject(locator)).resolves.toEqual({ sizeBytes: 42 });
  });

  it.each([
    ["name NoSuchKey", { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }],
    ["name NotFound", { name: "NotFound", $metadata: { httpStatusCode: 404 } }],
    ["Code NoSuchKey", { Code: "NoSuchKey", $metadata: { httpStatusCode: 404 } }],
    ["code NotFound", { code: "NotFound", $metadata: { httpStatusCode: 404 } }],
  ])("maps explicit object absence from %s", async (_label, providerError) => {
    await expect(adapter(async () => { throw providerError; }).headObject(locator))
      .rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_FOUND" });
  });

  it("maps ambiguous or non-object 404 responses to temporary unavailability", async () => {
    await expect(adapter(async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    }).headObject(locator)).rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    await expect(adapter(async () => {
      throw Object.assign(new Error("raw forbidden"), { $metadata: { httpStatusCode: 403 } });
    }).headObject(locator)).rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    await expect(adapter(async () => {
      throw Object.assign(new Error("raw missing bucket"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      });
    }).headObject(locator)).rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
  });

  it.each([undefined, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects malformed ContentLength %s safely",
    async (ContentLength) => {
      await expect(adapter(async () => ({ ContentLength })).headObject(locator))
        .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    },
  );
});

describe("B2EvidenceStorage readObjectBounded", () => {
  it.each([
    ["one chunk", [new Uint8Array([1, 2])]],
    ["multiple chunks", [new Uint8Array([1]), new Uint8Array([2])]],
  ])("streams %s and returns stable bytes", async (_label, bodyChunks) => {
    const firstChunk = bodyChunks[0];
    const storage = adapter(async (command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return { Body: chunks(...bodyChunks) };
    });
    const result = await storage.readObjectBounded(locator, 2);
    firstChunk[0] = 9;
    expect(result).toEqual(new Uint8Array([1, 2]));
  });

  it("accepts exactly maximumBytes", async () => {
    await expect(adapter(async () => ({ Body: chunks(new Uint8Array([1, 2])) }))
      .readObjectBounded(locator, 2)).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it.each([
    ["single overflow", [new Uint8Array([1, 2, 3])]],
    ["overflow after an accepted chunk", [new Uint8Array([1, 2]), new Uint8Array([3])]],
  ])("stops on %s", async (_label, bodyChunks) => {
    await expect(adapter(async () => ({ Body: chunks(...bodyChunks) }))
      .readObjectBounded(locator, 2)).rejects.toMatchObject({ code: "STORAGE_READ_LIMIT_EXCEEDED" });
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])("rejects invalid bound %s", async (bound) => {
    await expect(adapter(async () => ({ Body: chunks() })).readObjectBounded(locator, bound))
      .rejects.toBeInstanceOf(RangeError);
  });

  it("maps missing body, malformed chunks, stream failure and provider failure safely", async () => {
    await expect(adapter(async () => ({})).readObjectBounded(locator, 2))
      .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    await expect(adapter(async () => ({ Body: chunks("not bytes") })).readObjectBounded(locator, 2))
      .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    await expect(adapter(async () => ({ Body: (async function* () { throw new Error("raw stream"); })() }))
      .readObjectBounded(locator, 2)).rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    await expect(adapter(async () => { throw new Error("raw provider"); }).readObjectBounded(locator, 2))
      .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
  });
});

describe("B2EvidenceStorage putValidatedObject", () => {
  it("writes an absent destination without ACL and verifies readback", async () => {
    const bytes = new Uint8Array([1, 2]);
    const commands: unknown[] = [];
    const storage = adapter(async (command) => {
      commands.push(command);
      if (command instanceof HeadObjectCommand) throw notFound();
      if (command instanceof PutObjectCommand) return {};
      if (command instanceof GetObjectCommand) return { Body: chunks(bytes) };
      throw new Error("unexpected command");
    });
    await expect(storage.putValidatedObject(locator, bytes, "image/png"))
      .resolves.toEqual({ kind: "CREATED" });
    const put = commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input).toMatchObject({ Bucket: "synthetic-evidence", Key: locator, ContentType: "image/png" });
    expect(put.input).not.toHaveProperty("ACL");
    expect(put.input).not.toHaveProperty("Metadata");
    expect(put.input.Body).toEqual(bytes);
    expect(commands.some((command) => command instanceof GetObjectCommand)).toBe(true);
  });

  it("returns ALREADY_EXISTS only for identical existing bytes", async () => {
    const bytes = new Uint8Array([1, 2]);
    const storage = adapter(async (command) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: 2 };
      if (command instanceof GetObjectCommand) return { Body: chunks(new Uint8Array([1, 2])) };
      throw new Error("PutObject must not run");
    });
    await expect(storage.putValidatedObject(locator, bytes, "image/png"))
      .resolves.toEqual({ kind: "ALREADY_EXISTS" });
  });

  it.each([
    ["different size", { ContentLength: 3 }, new Uint8Array([1, 2, 3])],
    ["different bytes", { ContentLength: 2 }, new Uint8Array([1, 3])],
    ["growth after HEAD", { ContentLength: 2 }, new Uint8Array([1, 2, 3])],
  ])("rejects an existing destination with %s", async (_label, head, stored) => {
    const storage = adapter(async (command) => {
      if (command instanceof HeadObjectCommand) return head;
      if (command instanceof GetObjectCommand) return { Body: chunks(stored) };
      throw new Error("PutObject must not run");
    });
    await expect(storage.putValidatedObject(locator, new Uint8Array([1, 2]), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_DESTINATION_CONFLICT" });
  });

  it("translates PutObject failure safely", async () => {
    const storage = adapter(async (command) => {
      if (command instanceof HeadObjectCommand) throw notFound();
      throw new Error("raw write provider detail");
    });
    await expect(storage.putValidatedObject(locator, new Uint8Array([1]), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
  });

  it("does not write when destination HEAD returns an ambiguous 404", async () => {
    const send = vi.fn<(command: unknown) => Promise<unknown>>(async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    });

    await expect(adapter(send).putValidatedObject(locator, new Uint8Array([1]), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_TEMPORARILY_UNAVAILABLE" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("rejects post-write readback mismatch", async () => {
    const storage = adapter(async (command) => {
      if (command instanceof HeadObjectCommand) throw notFound();
      if (command instanceof PutObjectCommand) return {};
      return { Body: chunks(new Uint8Array([2])) };
    });
    await expect(storage.putValidatedObject(locator, new Uint8Array([1]), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_DESTINATION_CONFLICT" });
  });
});

describe("B2EvidenceStorage deleteObjectBestEffort", () => {
  it("deletes exactly one locator", async () => {
    const send = vi.fn<(command: unknown) => Promise<unknown>>(async () => ({}));
    await expect(adapter(send).deleteObjectBestEffort(locator)).resolves.toBe(true);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({ Bucket: "synthetic-evidence", Key: locator });
    expect((command as DeleteObjectCommand).input.Key).not.toBe(adjacent);
  });

  it("treats missing as cleaned and other provider failures as false", async () => {
    await expect(adapter(async () => { throw notFound(); }).deleteObjectBestEffort(locator)).resolves.toBe(true);
    await expect(adapter(async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    }).deleteObjectBestEffort(locator)).resolves.toBe(false);
    await expect(adapter(async () => {
      throw { name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } };
    }).deleteObjectBestEffort(locator)).resolves.toBe(false);
    await expect(adapter(async () => { throw new Error("raw delete failure"); }).deleteObjectBestEffort(locator))
      .resolves.toBe(false);
  });
});
