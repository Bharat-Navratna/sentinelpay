import { createHash } from "node:crypto";

import { EvidenceDomainError } from "./evidence-errors";
import {
  MAX_CALL_NOTE_CHARACTERS,
  MAX_PASTED_TEXT_CHARACTERS,
  type InlineEvidenceKind,
} from "./evidence";

export type NormalizedInlineEvidence = {
  kind: InlineEvidenceKind;
  content: string;
  sha256: string;
};

const DISALLOWED_CONTROL_CHARACTERS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

function maximumCharacters(kind: InlineEvidenceKind): number {
  return kind === "PASTED_TEXT"
    ? MAX_PASTED_TEXT_CHARACTERS
    : MAX_CALL_NOTE_CHARACTERS;
}

export function normalizeInlineEvidence(
  kind: InlineEvidenceKind,
  input: unknown,
): NormalizedInlineEvidence {
  if (typeof input !== "string") {
    throw new EvidenceDomainError("INVALID_INLINE_EVIDENCE");
  }

  const content = input
    .replace(/\r\n?/gu, "\n")
    .normalize("NFC")
    .replace(/\u0000/gu, "")
    .trim();

  if (
    content.length === 0 ||
    DISALLOWED_CONTROL_CHARACTERS.test(content) ||
    Array.from(content).length > maximumCharacters(kind)
  ) {
    throw new EvidenceDomainError("INVALID_INLINE_EVIDENCE");
  }

  return {
    kind,
    content,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}
