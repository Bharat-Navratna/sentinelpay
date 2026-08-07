import { describe, expect, it } from "vitest";

import {
  MAX_CALL_NOTE_CHARACTERS,
  MAX_EVIDENCE_FILE_BYTES,
  MAX_EVIDENCE_ITEMS_PER_CASE,
  MAX_FILE_EVIDENCE_ITEMS_PER_CASE,
  MAX_NORMALIZED_DISPLAY_FILENAME_CHARACTERS,
  MAX_PASTED_TEXT_CHARACTERS,
  MAX_PDF_PAGES,
  MAX_STORED_FILE_BYTES_PER_CASE,
  evidenceCategories,
  evidenceKinds,
  evidenceStatuses,
  inlineEvidenceKinds,
} from "./evidence";

describe("frozen evidence domain catalogs and limits", () => {
  it("defines only the approved evidence kinds", () => {
    expect(evidenceKinds).toEqual(["FILE", "PASTED_TEXT", "CALL_NOTE"]);
    expect(inlineEvidenceKinds).toEqual(["PASTED_TEXT", "CALL_NOTE"]);
  });

  it("defines only the approved evidence categories", () => {
    expect(evidenceCategories).toEqual([
      "MESSAGE_CONVERSATION",
      "EMAIL",
      "MARKETPLACE_CONVERSATION",
      "INVESTMENT_ADVERTISEMENT",
      "INVOICE_OR_QUOTE",
      "PAYMENT_INSTRUCTION",
      "RECEIPT_OR_CONFIRMATION",
      "CALL_NOTE",
      "ORGANISATION_DETAILS",
      "OTHER_DOCUMENT",
    ]);
  });

  it("defines the approved evidence lifecycle statuses", () => {
    expect(evidenceStatuses).toEqual([
      "AWAITING_UPLOAD",
      "VALIDATING",
      "READY",
      "REJECTED",
      "REMOVED",
    ]);
  });

  it("exports the frozen M3 evidence limits", () => {
    expect(MAX_EVIDENCE_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_STORED_FILE_BYTES_PER_CASE).toBe(20 * 1024 * 1024);
    expect(MAX_FILE_EVIDENCE_ITEMS_PER_CASE).toBe(5);
    expect(MAX_EVIDENCE_ITEMS_PER_CASE).toBe(10);
    expect(MAX_PDF_PAGES).toBe(20);
    expect(MAX_PASTED_TEXT_CHARACTERS).toBe(10_000);
    expect(MAX_CALL_NOTE_CHARACTERS).toBe(10_000);
    expect(MAX_NORMALIZED_DISPLAY_FILENAME_CHARACTERS).toBe(255);
  });
});
