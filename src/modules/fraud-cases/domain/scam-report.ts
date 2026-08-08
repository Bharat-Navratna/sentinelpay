import { z } from "zod";

import { FraudCaseDomainError } from "./fraud-case-errors";

export const scamCategories = [
  "INVESTMENT",
  "PURCHASE",
  "IMPERSONATION",
  "ROMANCE",
  "INVOICE_REDIRECTION",
  "OTHER",
  "UNSURE",
] as const;

export const contactChannels = [
  "PHONE",
  "SMS",
  "MESSAGING_APP",
  "EMAIL",
  "SOCIAL_MEDIA",
  "WEBSITE",
  "IN_PERSON",
  "OTHER",
] as const;

export const reportIndicators = ["YES", "NO", "UNSURE"] as const;

export const MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS = 200;
export const MAX_DISCOVERY_REASON_CHARACTERS = 500;
export const MIN_NARRATIVE_CHARACTERS = 20;
export const MAX_NARRATIVE_CHARACTERS = 4_000;
export const MAX_IMPERSONATED_ORGANISATION_CHARACTERS = 200;
export const REPORT_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1_000;

export function assertScamReportChronology(
  input: { firstContactAt?: Date | null; discoveredAt?: Date | null },
  now: Date,
): void {
  const latestPermitted = now.getTime() + REPORT_CLOCK_SKEW_TOLERANCE_MS;
  const firstContact = input.firstContactAt?.getTime();
  const discovered = input.discoveredAt?.getTime();
  if (
    Number.isNaN(now.getTime()) ||
    (firstContact !== undefined && (Number.isNaN(firstContact) || firstContact > latestPermitted)) ||
    (discovered !== undefined && (Number.isNaN(discovered) || discovered > latestPermitted)) ||
    (firstContact !== undefined && discovered !== undefined && firstContact > discovered)
  ) {
    throw new FraudCaseDomainError("INVALID_SCAM_REPORT_CHRONOLOGY");
  }
}

function boundedTrimmedText(minimum: number, maximum: number) {
  return z.string().trim().min(minimum).max(maximum);
}

const optionalOrganisationSchema = z
  .string()
  .trim()
  .max(MAX_IMPERSONATED_ORGANISATION_CHARACTERS)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const scamReportSchema = z
  .object({
    suspectedScamCategory: z.enum(scamCategories),
    believedPaymentPurpose: boundedTrimmedText(
      1,
      MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS,
    ),
    contactChannel: z.enum(contactChannels),
    firstContactAt: z.date().nullable().optional().transform((value) => value ?? null),
    discoveredAt: z.date(),
    discoveryReason: boundedTrimmedText(
      1,
      MAX_DISCOVERY_REASON_CHARACTERS,
    ),
    narrative: boundedTrimmedText(
      MIN_NARRATIVE_CHARACTERS,
      MAX_NARRATIVE_CHARACTERS,
    ),
    pressureOrUrgency: z.enum(reportIndicators),
    guaranteedReturns: z.enum(reportIndicators),
    toldToIgnoreWarnings: z.enum(reportIndicators),
    remoteAccessRequested: z.enum(reportIndicators),
    impersonatedOrganisation: optionalOrganisationSchema,
    additionalSupportRequested: z.boolean(),
  })
  .strict();

export type ScamReport = z.infer<typeof scamReportSchema>;

const nullableTrimmedText = (minimum: number, maximum: number) =>
  z.union([z.null(), z.string().trim().min(minimum).max(maximum)]).optional().transform((value) => value ?? null);

/** A complete draft snapshot. Nulls are intentional until final submission. */
export const scamReportDraftSchema = z.object({
  suspectedScamCategory: z.enum(scamCategories).nullable().optional().transform((value) => value ?? null),
  believedPaymentPurpose: nullableTrimmedText(1, MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS),
  contactChannel: z.enum(contactChannels).nullable().optional().transform((value) => value ?? null),
  firstContactAt: z.date().nullable().optional().transform((value) => value ?? null),
  discoveredAt: z.date().nullable().optional().transform((value) => value ?? null),
  discoveryReason: nullableTrimmedText(1, MAX_DISCOVERY_REASON_CHARACTERS),
  narrative: nullableTrimmedText(MIN_NARRATIVE_CHARACTERS, MAX_NARRATIVE_CHARACTERS),
  pressureOrUrgency: z.enum(reportIndicators).nullable().optional().transform((value) => value ?? null),
  guaranteedReturns: z.enum(reportIndicators).nullable().optional().transform((value) => value ?? null),
  toldToIgnoreWarnings: z.enum(reportIndicators).nullable().optional().transform((value) => value ?? null),
  remoteAccessRequested: z.enum(reportIndicators).nullable().optional().transform((value) => value ?? null),
  impersonatedOrganisation: optionalOrganisationSchema,
  additionalSupportRequested: z.boolean().nullable().optional().transform((value) => value ?? null),
}).strict();

export type ScamReportDraft = z.infer<typeof scamReportDraftSchema>;

export function parseScamReportDraft(input: unknown): ScamReportDraft {
  const result = scamReportDraftSchema.safeParse(input);
  if (!result.success) throw new FraudCaseDomainError("INVALID_SCAM_REPORT");
  return result.data;
}

export function parseScamReport(input: unknown): ScamReport {
  const result = scamReportSchema.safeParse(input);

  if (!result.success) {
    throw new FraudCaseDomainError("INVALID_SCAM_REPORT");
  }

  return result.data;
}

export function isScamReportSubmissionReady(input: unknown): boolean {
  return scamReportSchema.safeParse(input).success;
}
