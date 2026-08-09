import { EvidenceStorageError } from "./evidence-storage-errors";

declare const storageObjectLocatorBrand: unique symbol;
export type StorageObjectLocator = string & {
  readonly [storageObjectLocatorBrand]: true;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const STORAGE_NAMESPACE = "sentinelpay";

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
  }
}

export function buildQuarantineObjectLocator(
  uploadSessionId: string,
): StorageObjectLocator {
  assertUuid(uploadSessionId);
  return `${STORAGE_NAMESPACE}/quarantine/${uploadSessionId}` as StorageObjectLocator;
}

export function buildFinalEvidenceObjectLocator(input: {
  caseId: string;
  evidenceId: string;
  sha256: string;
}): StorageObjectLocator {
  assertUuid(input.caseId);
  assertUuid(input.evidenceId);
  if (!SHA256_PATTERN.test(input.sha256)) {
    throw new EvidenceStorageError("STORAGE_DESTINATION_CONFLICT");
  }

  return `${STORAGE_NAMESPACE}/cases/${input.caseId}/evidence/${input.evidenceId}/${input.sha256}/original` as StorageObjectLocator;
}
