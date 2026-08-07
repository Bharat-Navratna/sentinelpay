import { z } from "zod";

import { EvidenceDomainError } from "./evidence-errors";
import { MAX_PDF_PAGES, type EvidenceStatus } from "./evidence";

export const extractionStatuses = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export type ExtractionStatus = (typeof extractionStatuses)[number];

export const extractionReviewStatuses = ["CONFIRMED", "CORRECTED"] as const;
export type ExtractionReviewStatus =
  (typeof extractionReviewStatuses)[number];

export const extractionUncertaintyLevels = ["LOW", "MEDIUM", "HIGH"] as const;

export const MAX_EXTRACTED_TEXT_CHARACTERS = 500;
export const MAX_UNCERTAINTY_NOTE_CHARACTERS = 500;
export const MAX_UNCERTAINTY_NOTES = 10;

const sourceBase = {
  evidenceItemId: z.string().uuid(),
  uncertainty: z.enum(extractionUncertaintyLevels),
};

const sourceLocatorSchema = z.union([
  z.object(sourceBase).strict(),
  z
    .object({
      ...sourceBase,
      pageNumber: z.number().int().min(1).max(MAX_PDF_PAGES),
    })
    .strict(),
  z
    .object({
      ...sourceBase,
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive(),
    })
    .strict()
    .refine((source) => source.lineEnd >= source.lineStart),
]);

function sourcedValueSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .object({
      value: valueSchema,
      source: sourceLocatorSchema,
    })
    .strict();
}

const sourcedText = sourcedValueSchema(
  z.string().trim().min(1).max(MAX_EXTRACTED_TEXT_CHARACTERS),
).nullable();
const sourcedBoolean = sourcedValueSchema(z.boolean()).nullable();

export const extractionResultSchema = z
  .object({
    believedPurpose: sourcedText,
    impersonatedOrganisation: sourcedText,
    pressureOrUrgency: sourcedBoolean,
    guaranteedReturns: sourcedBoolean,
    toldToIgnoreWarnings: sourcedBoolean,
    remoteAccessRequested: sourcedBoolean,
    uncertaintyNotes: z
      .array(z.string().trim().min(1).max(MAX_UNCERTAINTY_NOTE_CHARACTERS))
      .max(MAX_UNCERTAINTY_NOTES),
  })
  .strict();

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export function parseExtractionResult(input: unknown): ExtractionResult {
  const result = extractionResultSchema.safeParse(input);

  if (!result.success) {
    throw new EvidenceDomainError("INVALID_EXTRACTION_OUTPUT");
  }

  return result.data;
}

const allowedExtractionTransitions = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
} as const satisfies Record<ExtractionStatus, readonly ExtractionStatus[]>;

export function canTransitionExtraction(
  fromStatus: ExtractionStatus,
  toStatus: ExtractionStatus,
): boolean {
  const permitted: readonly ExtractionStatus[] =
    allowedExtractionTransitions[fromStatus];
  return permitted.includes(toStatus);
}

export function assertExtractionTransition(
  fromStatus: ExtractionStatus,
  toStatus: ExtractionStatus,
): void {
  if (!canTransitionExtraction(fromStatus, toStatus)) {
    throw new EvidenceDomainError("INVALID_EXTRACTION_TRANSITION");
  }
}

export function isTerminalExtractionStatus(status: ExtractionStatus): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

export function canStartExtractionRun(
  evidenceStatus: EvidenceStatus,
  existingRunStatuses: readonly ExtractionStatus[],
): boolean {
  return (
    evidenceStatus === "READY" &&
    !existingRunStatuses.some(
      (status) =>
        status === "PENDING" ||
        status === "PROCESSING" ||
        status === "COMPLETED",
    )
  );
}

export type ExtractionReview =
  | { status: "CONFIRMED"; correctedOutput: null }
  | { status: "CORRECTED"; correctedOutput: ExtractionResult };

export function createExtractionReview(
  status: ExtractionReviewStatus,
  correctedOutput?: unknown,
): ExtractionReview {
  if (status === "CONFIRMED") {
    if (correctedOutput !== undefined && correctedOutput !== null) {
      throw new EvidenceDomainError("INVALID_EXTRACTION_REVIEW");
    }

    return { status, correctedOutput: null };
  }

  if (correctedOutput === undefined || correctedOutput === null) {
    throw new EvidenceDomainError("INVALID_EXTRACTION_REVIEW");
  }

  try {
    return {
      status,
      correctedOutput: parseExtractionResult(correctedOutput),
    };
  } catch {
    throw new EvidenceDomainError("INVALID_EXTRACTION_REVIEW");
  }
}

export function getEffectiveReviewedExtraction(
  machineOutput: ExtractionResult,
  review: ExtractionReview,
): ExtractionResult {
  const parsedMachineOutput = parseExtractionResult(machineOutput);

  return review.status === "CORRECTED"
    ? parseExtractionResult(review.correctedOutput)
    : parsedMachineOutput;
}
