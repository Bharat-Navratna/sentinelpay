import type { StorageObjectLocator } from "./evidence-object-keys";

export type EvidenceUploadGrant = {
  url: string;
  method: "PUT";
  requiredHeaders: Readonly<Record<string, string>>;
  expiresAt: Date;
};

export type StoredObjectMetadata = {
  sizeBytes: number;
};

export type PutValidatedObjectResult =
  | { kind: "CREATED" }
  | { kind: "ALREADY_EXISTS" };

export interface EvidenceStorage {
  createUploadGrant(input: {
    locator: StorageObjectLocator;
    contentType: string;
    expiresAt: Date;
  }): Promise<EvidenceUploadGrant>;
  headObject(locator: StorageObjectLocator): Promise<StoredObjectMetadata>;
  readObjectBounded(
    locator: StorageObjectLocator,
    maximumBytes: number,
  ): Promise<Uint8Array>;
  putValidatedObject(
    locator: StorageObjectLocator,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<PutValidatedObjectResult>;
  /** Returns true when the exact object was deleted or is already known absent; false when cleanup could not be confirmed. */
  deleteObjectBestEffort(locator: StorageObjectLocator): Promise<boolean>;
}
