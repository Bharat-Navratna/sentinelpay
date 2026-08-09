import type {
  EvidenceStorage,
  EvidenceUploadGrant,
  PutValidatedObjectResult,
  StoredObjectMetadata,
} from "../evidence-storage";
import { EvidenceStorageError } from "../evidence-storage-errors";
import type { StorageObjectLocator } from "../evidence-object-keys";

export class InMemoryEvidenceStorage implements EvidenceStorage {
  private readonly objects = new Map<string, Uint8Array>();
  private failNextOperation = false;

  simulateTemporaryFailureOnce(): void {
    this.failNextOperation = true;
  }

  seedObject(locator: StorageObjectLocator, bytes: Uint8Array): void {
    this.objects.set(locator, bytes.slice());
  }

  async createUploadGrant(input: {
    locator: StorageObjectLocator;
    contentType: string;
    expiresAt: Date;
  }): Promise<EvidenceUploadGrant> {
    this.assertAvailable();
    return {
      url: `https://synthetic-storage.invalid/upload/${encodeURIComponent(input.locator)}`,
      method: "PUT",
      requiredHeaders: { "Content-Type": input.contentType },
      expiresAt: new Date(input.expiresAt),
    };
  }

  async headObject(locator: StorageObjectLocator): Promise<StoredObjectMetadata> {
    const bytes = this.getObject(locator);
    return { sizeBytes: bytes.byteLength };
  }

  async readObjectBounded(
    locator: StorageObjectLocator,
    maximumBytes: number,
  ): Promise<Uint8Array> {
    if (!Number.isInteger(maximumBytes) || maximumBytes <= 0) {
      throw new RangeError("maximumBytes must be a positive integer.");
    }
    const bytes = this.getObject(locator);
    if (bytes.byteLength > maximumBytes) {
      throw new EvidenceStorageError("STORAGE_READ_LIMIT_EXCEEDED");
    }
    return bytes.slice();
  }

  async putValidatedObject(
    locator: StorageObjectLocator,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<PutValidatedObjectResult> {
    this.assertAvailable();
    void contentType;
    const existing = this.objects.get(locator);
    if (existing) {
      if (!equalBytes(existing, bytes)) {
        throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
      }
      return { kind: "ALREADY_EXISTS" };
    }
    this.objects.set(locator, bytes.slice());
    return { kind: "CREATED" };
  }

  async deleteObjectBestEffort(locator: StorageObjectLocator): Promise<boolean> {
    if (this.failNextOperation) {
      this.failNextOperation = false;
      return false;
    }
    return this.objects.delete(locator);
  }

  private getObject(locator: StorageObjectLocator): Uint8Array {
    this.assertAvailable();
    const bytes = this.objects.get(locator);
    if (!bytes) {
      throw new EvidenceStorageError("STORAGE_OBJECT_NOT_FOUND");
    }
    return bytes;
  }

  private assertAvailable(): void {
    if (this.failNextOperation) {
      this.failNextOperation = false;
      throw new EvidenceStorageError("STORAGE_TEMPORARILY_UNAVAILABLE");
    }
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
