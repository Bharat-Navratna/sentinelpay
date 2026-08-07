export const evidenceKinds = ["FILE", "PASTED_TEXT", "CALL_NOTE"] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

export const inlineEvidenceKinds = ["PASTED_TEXT", "CALL_NOTE"] as const;
export type InlineEvidenceKind = (typeof inlineEvidenceKinds)[number];

export const evidenceCategories = [
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
] as const;
export type EvidenceCategory = (typeof evidenceCategories)[number];

export const evidenceStatuses = [
  "AWAITING_UPLOAD",
  "VALIDATING",
  "READY",
  "REJECTED",
  "REMOVED",
] as const;
export type EvidenceStatus = (typeof evidenceStatuses)[number];

export const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_STORED_FILE_BYTES_PER_CASE = 20 * 1024 * 1024;
export const MAX_FILE_EVIDENCE_ITEMS_PER_CASE = 5;
export const MAX_EVIDENCE_ITEMS_PER_CASE = 10;
export const MAX_PDF_PAGES = 20;
export const MAX_PASTED_TEXT_CHARACTERS = 10_000;
export const MAX_CALL_NOTE_CHARACTERS = 10_000;
export const MAX_NORMALIZED_DISPLAY_FILENAME_CHARACTERS = 255;
