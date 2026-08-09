import { describe, expect, it } from "vitest";

import { EvidenceStorageError } from "../../application/evidence-storage-errors";
import { parseB2StorageConfig } from "./b2-storage-config";

const valid = {
  B2_S3_ENDPOINT: "https://storage.example.invalid",
  B2_REGION: "test-region-1",
  B2_KEY_ID: "synthetic-key-id",
  B2_APPLICATION_KEY: "synthetic-application-secret",
  B2_BUCKET_NAME: "synthetic-evidence",
};

function expectConfigurationError(env: Record<string, string | undefined>): void {
  let caught: unknown;
  try {
    parseB2StorageConfig(env);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    code: "STORAGE_CONFIGURATION_UNAVAILABLE",
    message: "Evidence storage configuration is unavailable.",
  } satisfies Partial<EvidenceStorageError>);
  expect((caught as Error).message).not.toContain("synthetic-application-secret");
}

describe("parseB2StorageConfig", () => {
  it("accepts complete injected server-only configuration", () => {
    expect(parseB2StorageConfig(valid)).toEqual({
      endpoint: "https://storage.example.invalid",
      region: "test-region-1",
      keyId: "synthetic-key-id",
      applicationKey: "synthetic-application-secret",
      bucketName: "synthetic-evidence",
    });
  });

  it.each([
    ["missing endpoint", { ...valid, B2_S3_ENDPOINT: undefined }],
    ["HTTP endpoint", { ...valid, B2_S3_ENDPOINT: "http://storage.example.invalid" }],
    ["endpoint credentials", { ...valid, B2_S3_ENDPOINT: "https://user:password@storage.example.invalid" }],
    ["endpoint query", { ...valid, B2_S3_ENDPOINT: "https://storage.example.invalid?bucket=value" }],
    ["endpoint fragment", { ...valid, B2_S3_ENDPOINT: "https://storage.example.invalid#fragment" }],
    ["endpoint path", { ...valid, B2_S3_ENDPOINT: "https://storage.example.invalid/bucket" }],
    ["missing region", { ...valid, B2_REGION: "" }],
    ["missing key ID", { ...valid, B2_KEY_ID: "" }],
    ["missing application key", { ...valid, B2_APPLICATION_KEY: "" }],
    ["missing bucket", { ...valid, B2_BUCKET_NAME: "" }],
    ["invalid bucket", { ...valid, B2_BUCKET_NAME: "bad/bucket" }],
  ])("rejects %s safely", (_label, env) => {
    expectConfigurationError(env);
  });

  it("does not accept public-prefixed substitutes for missing server configuration", () => {
    expectConfigurationError({
      NEXT_PUBLIC_B2_S3_ENDPOINT: "https://public.example.invalid",
      NEXT_PUBLIC_B2_APPLICATION_KEY: "synthetic-application-secret",
    });
  });
});
