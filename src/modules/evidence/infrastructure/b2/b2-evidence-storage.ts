import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  EvidenceStorage,
  EvidenceUploadGrant,
  PutValidatedObjectResult,
  StoredObjectMetadata,
} from "../../application/evidence-storage";
import { EvidenceStorageError } from "../../application/evidence-storage-errors";
import type { StorageObjectLocator } from "../../application/evidence-object-keys";
import type { B2StorageConfig } from "./b2-storage-config";

type CommandSender = (command: unknown) => Promise<unknown>;
type PutPresigner = (
  command: PutObjectCommand,
  expiresInSeconds: number,
  signingDate: Date,
) => Promise<string>;

type AdapterDependencies = {
  send?: CommandSender;
  presignPut?: PutPresigner;
  now?: () => Date;
};

type ProviderError = {
  name?: unknown;
  Code?: unknown;
  code?: unknown;
};

const MAXIMUM_UPLOAD_GRANT_SECONDS = 300;

function createClient(config: B2StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
    forcePathStyle: true,
  });
}

function errorProperty(error: unknown, property: "name" | "Code" | "code"): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as ProviderError)[property];
  return typeof value === "string" ? value : undefined;
}

function isNotFound(error: unknown): boolean {
  const identifiers = [
    errorProperty(error, "name"),
    errorProperty(error, "Code"),
    errorProperty(error, "code"),
  ].filter((value): value is string => value !== undefined);
  if (identifiers.some((value) => value === "NoSuchBucket")) return false;
  if (identifiers.some((value) => value === "NoSuchKey" || value === "NotFound")) return true;
  return false;
}

function storageError(error: unknown): EvidenceStorageError {
  return new EvidenceStorageError(
    isNotFound(error) ? "STORAGE_OBJECT_NOT_FOUND" : "STORAGE_TEMPORARILY_UNAVAILABLE",
  );
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function asyncByteBody(value: unknown): AsyncIterable<unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const iterator = (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator];
  return typeof iterator === "function" ? value as AsyncIterable<unknown> : null;
}

export class B2EvidenceStorage implements EvidenceStorage {
  private readonly send: CommandSender;
  private readonly presignPut: PutPresigner;
  private readonly now: () => Date;

  constructor(
    private readonly config: B2StorageConfig,
    dependencies: AdapterDependencies = {},
  ) {
    let client: S3Client | undefined;
    const getClient = (): S3Client => {
      client ??= createClient(config);
      return client;
    };
    this.send = dependencies.send ?? ((command) => getClient().send(command as never));
    this.presignPut = dependencies.presignPut ?? ((command, expiresIn, signingDate) =>
      getSignedUrl(getClient(), command, { expiresIn, signingDate }));
    this.now = dependencies.now ?? (() => new Date());
  }

  async createUploadGrant(input: {
    locator: StorageObjectLocator;
    contentType: string;
    expiresAt: Date;
  }): Promise<EvidenceUploadGrant> {
    const signingDate = this.now();
    const remainingMilliseconds = input.expiresAt.getTime() - signingDate.getTime();
    if (
      !Number.isFinite(remainingMilliseconds) ||
      remainingMilliseconds < 1_000 ||
      remainingMilliseconds > MAXIMUM_UPLOAD_GRANT_SECONDS * 1_000
    ) {
      throw new RangeError("Upload grant expiry must be within five minutes.");
    }
    const expiresIn = Math.floor(remainingMilliseconds / 1_000);
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: input.locator,
      ContentType: input.contentType,
    });
    try {
      const url = await this.presignPut(command, expiresIn, signingDate);
      return {
        url,
        method: "PUT",
        requiredHeaders: { "Content-Type": input.contentType },
        expiresAt: new Date(input.expiresAt),
      };
    } catch {
      throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    }
  }

  async headObject(locator: StorageObjectLocator): Promise<StoredObjectMetadata> {
    let output: unknown;
    try {
      output = await this.send(new HeadObjectCommand({ Bucket: this.config.bucketName, Key: locator }));
    } catch (error) {
      throw storageError(error);
    }
    const length = typeof output === "object" && output !== null
      ? (output as { ContentLength?: unknown }).ContentLength
      : undefined;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
      throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    }
    return { sizeBytes: length };
  }

  async readObjectBounded(
    locator: StorageObjectLocator,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    assertPositiveInteger(maximumBytes, "maximumBytes");
    let output: unknown;
    try {
      output = await this.send(new GetObjectCommand({ Bucket: this.config.bucketName, Key: locator }));
    } catch (error) {
      throw storageError(error);
    }
    const bodyValue = typeof output === "object" && output !== null
      ? (output as { Body?: unknown }).Body
      : undefined;
    const body = asyncByteBody(bodyValue);
    if (!body) {
      throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) {
          throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
        }
        if (chunk.byteLength > maximumBytes - total) {
          throw new EvidenceStorageError("STORAGE_READ_LIMIT_EXCEEDED");
        }
        total += chunk.byteLength;
        chunks.push(chunk.slice());
      }
    } catch (error) {
      if (error instanceof EvidenceStorageError) throw error;
      throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    }

    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  async putValidatedObject(
    locator: StorageObjectLocator,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<PutValidatedObjectResult> {
    if (bytes.byteLength === 0) throw new RangeError("Validated evidence bytes must not be empty.");
    let destinationExists = true;
    try {
      const metadata = await this.headObject(locator);
      if (metadata.sizeBytes !== bytes.byteLength) {
        throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
      }
      let existing: Uint8Array;
      try {
        existing = await this.readObjectBounded(locator, bytes.byteLength);
      } catch (error) {
        if (error instanceof EvidenceStorageError && error.code === "STORAGE_READ_LIMIT_EXCEEDED") {
          throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
        }
        throw error;
      }
      if (!bytesEqual(existing, bytes)) {
        throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
      }
      return { kind: "ALREADY_EXISTS" };
    } catch (error) {
      if (error instanceof EvidenceStorageError && error.code === "STORAGE_OBJECT_NOT_FOUND") {
        destinationExists = false;
      } else {
        throw error;
      }
    }
    if (destinationExists) {
      throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
    }

    try {
      await this.send(new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: locator,
        Body: bytes.slice(),
        ContentType: contentType,
      }));
    } catch (error) {
      throw storageError(error);
    }

    let stored: Uint8Array;
    try {
      stored = await this.readObjectBounded(locator, bytes.byteLength);
    } catch (error) {
      if (error instanceof EvidenceStorageError && error.code === "STORAGE_READ_LIMIT_EXCEEDED") {
        throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
      }
      throw error;
    }
    if (!bytesEqual(stored, bytes)) {
      throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
    }
    return { kind: "CREATED" };
  }

  async deleteObjectBestEffort(locator: StorageObjectLocator): Promise<boolean> {
    try {
      await this.send(new DeleteObjectCommand({ Bucket: this.config.bucketName, Key: locator }));
      return true;
    } catch (error) {
      return isNotFound(error);
    }
  }
}
