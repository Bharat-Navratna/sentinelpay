import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MAX_CALL_NOTE_CHARACTERS,
  MAX_PASTED_TEXT_CHARACTERS,
} from "./evidence";
import { normalizeInlineEvidence } from "./inline-evidence";

describe("inline evidence normalization", () => {
  it("normalizes CRLF and CR line endings to LF", () => {
    expect(
      normalizeInlineEvidence("PASTED_TEXT", "first\r\nsecond\rthird")
        .content,
    ).toBe("first\nsecond\nthird");
  });

  it("normalizes Unicode to NFC", () => {
    expect(normalizeInlineEvidence("PASTED_TEXT", "Cafe\u0301").content).toBe(
      "Café",
    );
  });

  it("removes NUL characters", () => {
    expect(normalizeInlineEvidence("CALL_NOTE", "call\u0000 note").content).toBe(
      "call note",
    );
  });

  it("preserves meaningful newline and tab characters", () => {
    expect(
      normalizeInlineEvidence("PASTED_TEXT", "line one\n\tline two").content,
    ).toBe("line one\n\tline two");
  });

  it.each(["\u0001", "\u000B", "\u001F", "\u007F", "\u0085"])(
    "rejects disallowed control character %s",
    (character) => {
      expect(() =>
        normalizeInlineEvidence("PASTED_TEXT", `text${character}value`),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_INLINE_EVIDENCE" }),
      );
    },
  );

  it.each(["", "   ", "\r\n\t", "\u0000"])(
    "rejects blank normalized content",
    (content) => {
      expect(() => normalizeInlineEvidence("CALL_NOTE", content)).toThrowError(
        expect.objectContaining({ code: "INVALID_INLINE_EVIDENCE" }),
      );
    },
  );

  it("accepts exactly 10,000 Unicode code points", () => {
    expect(
      normalizeInlineEvidence(
        "PASTED_TEXT",
        "💬".repeat(MAX_PASTED_TEXT_CHARACTERS),
      ).content,
    ).toHaveLength(MAX_PASTED_TEXT_CHARACTERS * 2);
  });

  it("rejects more than 10,000 Unicode code points", () => {
    expect(() =>
      normalizeInlineEvidence(
        "PASTED_TEXT",
        "💬".repeat(MAX_PASTED_TEXT_CHARACTERS + 1),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_INLINE_EVIDENCE" }),
    );
  });

  it("enforces the same exact boundary for a call note", () => {
    expect(
      normalizeInlineEvidence(
        "CALL_NOTE",
        "n".repeat(MAX_CALL_NOTE_CHARACTERS),
      ).content,
    ).toHaveLength(MAX_CALL_NOTE_CHARACTERS);
    expect(() =>
      normalizeInlineEvidence(
        "CALL_NOTE",
        "n".repeat(MAX_CALL_NOTE_CHARACTERS + 1),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_INLINE_EVIDENCE" }),
    );
  });

  it("calculates deterministic lowercase SHA-256", () => {
    const normalized = normalizeInlineEvidence("CALL_NOTE", "  synthetic call note  ");
    const expected = createHash("sha256")
      .update("synthetic call note", "utf8")
      .digest("hex");

    expect(normalized.sha256).toBe(expected);
    expect(normalized.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("does not mutate caller-owned input", () => {
    const holder = { content: "  line one\r\nline two  " };
    const snapshot = structuredClone(holder);

    normalizeInlineEvidence("PASTED_TEXT", holder.content);
    expect(holder).toEqual(snapshot);
  });

  it("rejects non-string input", () => {
    expect(() => normalizeInlineEvidence("PASTED_TEXT", 42)).toThrowError(
      expect.objectContaining({ code: "INVALID_INLINE_EVIDENCE" }),
    );
  });
});
