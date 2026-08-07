import { describe, expect, it } from "vitest";

import { EvidenceDomainError } from "./evidence-errors";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  assertExtractionTransition,
  canStartExtractionRun,
  canTransitionExtraction,
  createExtractionReview,
  getEffectiveReviewedExtraction,
  isTerminalExtractionStatus,
  parseExtractionResult,
  type ExtractionResult,
} from "./extraction";

const EVIDENCE_ID = "81000000-0000-4000-8000-000000000001";

function validExtraction(): ExtractionResult {
  return {
    believedPurpose: {
      value: "Synthetic investment account",
      source: {
        evidenceItemId: EVIDENCE_ID,
        pageNumber: 1,
        uncertainty: "LOW",
      },
    },
    impersonatedOrganisation: null,
    pressureOrUrgency: {
      value: true,
      source: {
        evidenceItemId: EVIDENCE_ID,
        lineStart: 2,
        lineEnd: 4,
        uncertainty: "MEDIUM",
      },
    },
    guaranteedReturns: null,
    toldToIgnoreWarnings: null,
    remoteAccessRequested: {
      value: false,
      source: {
        evidenceItemId: EVIDENCE_ID,
        uncertainty: "HIGH",
      },
    },
    uncertaintyNotes: ["The organisation name was not visible."],
  };
}

describe("extraction result schema", () => {
  it("accepts a strict result with sourced observable values", () => {
    expect(parseExtractionResult(validExtraction())).toEqual(validExtraction());
  });

  it("accepts null observable values", () => {
    const result = parseExtractionResult({
      ...validExtraction(),
      believedPurpose: null,
      pressureOrUrgency: null,
      remoteAccessRequested: null,
    });

    expect(result.believedPurpose).toBeNull();
  });

  it.each(["LOW", "MEDIUM", "HIGH"] as const)(
    "accepts %s uncertainty",
    (uncertainty) => {
      const input = validExtraction();
      if (input.believedPurpose) {
        input.believedPurpose.source.uncertainty = uncertainty;
      }
      expect(parseExtractionResult(input).believedPurpose?.source.uncertainty).toBe(
        uncertainty,
      );
    },
  );

  it("rejects an invalid evidence reference", () => {
    const input = validExtraction() as unknown as Record<string, unknown>;
    const believedPurpose = input.believedPurpose as Record<string, unknown>;
    believedPurpose.source = {
      evidenceItemId: "not-a-uuid",
      pageNumber: 0,
      uncertainty: "CERTAIN",
    };

    expect(() => parseExtractionResult(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_OUTPUT" }),
    );
  });

  it("rejects a mixed page and line locator", () => {
    const input = validExtraction();
    if (input.believedPurpose) {
      Object.assign(input.believedPurpose.source, {
        lineStart: 1,
        lineEnd: 2,
      });
    }
    expect(() => parseExtractionResult(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_OUTPUT" }),
    );
  });

  it("rejects excessive extracted text", () => {
    const input = validExtraction();
    if (input.believedPurpose) {
      input.believedPurpose.value = "x".repeat(
        MAX_EXTRACTED_TEXT_CHARACTERS + 1,
      );
    }
    expect(() => parseExtractionResult(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_OUTPUT" }),
    );
  });

  it.each([
    ["fraudVerdict", "PROVEN"],
    ["customerHonesty", "DISHONEST"],
    ["reimbursementEligible", true],
    ["fabricated", true],
    ["customerFault", true],
    ["riskIndicators", ["pressure"]],
    ["riskScore", 99],
  ])("rejects prohibited or unexpected field %s", (field, value) => {
    expect(() =>
      parseExtractionResult({ ...validExtraction(), [field]: value }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_OUTPUT" }),
    );
  });
});

describe("extraction state machine", () => {
  it.each([
    ["PENDING", "PROCESSING"],
    ["PROCESSING", "COMPLETED"],
    ["PROCESSING", "FAILED"],
  ] as const)("permits %s to become %s", (from, to) => {
    expect(canTransitionExtraction(from, to)).toBe(true);
    expect(() => assertExtractionTransition(from, to)).not.toThrow();
  });

  it.each([
    ["PENDING", "COMPLETED"],
    ["FAILED", "PROCESSING"],
    ["COMPLETED", "PROCESSING"],
    ["COMPLETED", "FAILED"],
  ] as const)("rejects %s to %s", (from, to) => {
    expect(canTransitionExtraction(from, to)).toBe(false);
  });

  it("treats completed and failed runs as terminal", () => {
    expect(isTerminalExtractionStatus("COMPLETED")).toBe(true);
    expect(isTerminalExtractionStatus("FAILED")).toBe(true);
    expect(isTerminalExtractionStatus("PROCESSING")).toBe(false);
  });

  it("throws the stable typed transition error", () => {
    expect(() =>
      assertExtractionTransition("FAILED", "PROCESSING"),
    ).toThrowError(new EvidenceDomainError("INVALID_EXTRACTION_TRANSITION"));
  });

  it("allows a new run after failures but not after a success or active run", () => {
    expect(canStartExtractionRun("READY", ["FAILED", "FAILED"])).toBe(true);
    expect(canStartExtractionRun("READY", ["COMPLETED"])).toBe(false);
    expect(canStartExtractionRun("READY", ["PROCESSING"])).toBe(false);
    expect(canStartExtractionRun("REJECTED", [])).toBe(false);
  });
});

describe("extraction review", () => {
  it("confirms immutable machine output without a correction", () => {
    const machine = validExtraction();
    const snapshot = structuredClone(machine);
    const review = createExtractionReview("CONFIRMED");

    expect(review).toEqual({ status: "CONFIRMED", correctedOutput: null });
    expect(getEffectiveReviewedExtraction(machine, review)).toEqual(machine);
    expect(machine).toEqual(snapshot);
  });

  it("uses the complete validated corrected output", () => {
    const machine = validExtraction();
    const machineSnapshot = structuredClone(machine);
    const corrected = {
      ...validExtraction(),
      believedPurpose: null,
      impersonatedOrganisation: null,
      uncertaintyNotes: [],
    };
    const review = createExtractionReview("CORRECTED", corrected);

    expect(getEffectiveReviewedExtraction(machine, review)).toEqual(corrected);
    expect(getEffectiveReviewedExtraction(machine, review)).not.toBe(machine);
    expect(machine).toEqual(machineSnapshot);
  });

  it("rejects confirmed review with corrected output", () => {
    expect(() =>
      createExtractionReview("CONFIRMED", validExtraction()),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_REVIEW" }),
    );
  });

  it("rejects corrected review without output", () => {
    expect(() => createExtractionReview("CORRECTED")).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_REVIEW" }),
    );
  });

  it("rejects corrected output that fails the strict schema", () => {
    expect(() =>
      createExtractionReview("CORRECTED", {
        ...validExtraction(),
        fraudVerdict: "PROVEN",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_EXTRACTION_REVIEW" }),
    );
  });
});
