import { describe, expect, it } from "vitest";

import { EvidenceStorageError } from "./evidence-storage-errors";
import {
  buildFinalEvidenceObjectLocator,
  buildQuarantineObjectLocator,
} from "./evidence-object-keys";

const uploadId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const evidenceId = "00000000-0000-4000-8000-000000000003";
const sha256 = "a".repeat(64);

describe("evidence object locators", () => {
  it("builds a quarantine locator from a generated identifier", () => {
    expect(buildQuarantineObjectLocator(uploadId)).toBe(
      `sentinelpay/quarantine/${uploadId}`,
    );
  });

  it("builds a final hash-derived locator", () => {
    expect(buildFinalEvidenceObjectLocator({ caseId, evidenceId, sha256 })).toBe(
      `sentinelpay/cases/${caseId}/evidence/${evidenceId}/${sha256}/original`,
    );
  });

  it.each([
    "",
    "../secret",
    `${uploadId}/customer-name`,
    "customer@example.test",
    "00000000-0000-0000-0000-000000000000",
  ])("rejects malformed or arbitrary identifier %j", (value) => {
    expect(() => buildQuarantineObjectLocator(value)).toThrowError(
      expect.objectContaining<Partial<EvidenceStorageError>>({
        code: "STORAGE_DESTINATION_CONFLICT",
      }),
    );
  });

  it.each(["A".repeat(64), "a".repeat(63), `${"a".repeat(64)}/other`, "../hash"])(
    "rejects malformed authoritative hash %j",
    (value) => {
      expect(() =>
        buildFinalEvidenceObjectLocator({ caseId, evidenceId, sha256: value }),
      ).toThrowError(
        expect.objectContaining<Partial<EvidenceStorageError>>({
          code: "STORAGE_DESTINATION_CONFLICT",
        }),
      );
    },
  );

  it("has no API accepting a filename or customer value", () => {
    const locator = buildFinalEvidenceObjectLocator({ caseId, evidenceId, sha256 });
    expect(locator).not.toContain("statement.pdf");
    expect(locator).not.toContain("customer");
  });
});
