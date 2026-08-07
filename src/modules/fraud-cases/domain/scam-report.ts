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
