import { describe, expect, it } from "vitest";

import { normalizeFileEvidenceInput } from "./file-evidence-input";

const key = "00000000-0000-4000-8000-000000000001";

describe("normalizeFileEvidenceInput", () => {
  it("normalizes a provider-neutral file request without using its extension as authority", () => {
    const capturedAt = new Date("2026-08-01T10:00:00Z");
    const result = normalizeFileEvidenceInput({
      category: "EMAIL",
      originalFilename: "  Cafe\u0301 message.exe  ",
      declaredMimeType: "image/png",
      capturedAt,
      uploadIdempotencyKey: key,
    });
    expect(result).toEqual({
      category: "EMAIL",
      originalFilename: "Café message.exe",
      declaredMimeType: "image/png",
      capturedAt,
      uploadIdempotencyKey: key,
    });
    expect(result.capturedAt).not.toBe(capturedAt);
  });

  it.each([
    ["blank filename", { originalFilename: " " }],
    ["long filename", { originalFilename: "a".repeat(256) }],
    ["control character", { originalFilename: "bad\u0000name" }],
    ["unsupported MIME", { declaredMimeType: "text/plain" }],
    ["unknown category", { category: "UNKNOWN" }],
    ["invalid UUID", { uploadIdempotencyKey: "not-a-uuid" }],
    ["invalid capture time", { capturedAt: new Date(Number.NaN) }],
  ])("rejects %s safely", (_label, overrides) => {
    expect(() => normalizeFileEvidenceInput({
      category: "EMAIL",
      originalFilename: "synthetic.png",
      declaredMimeType: "image/png",
      uploadIdempotencyKey: key,
      ...overrides,
    })).toThrow(expect.objectContaining({ code: "INVALID_FILE_EVIDENCE_INPUT" }));
  });
});
