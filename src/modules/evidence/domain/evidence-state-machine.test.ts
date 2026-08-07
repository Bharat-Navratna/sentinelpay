import { describe, expect, it } from "vitest";

import { EvidenceDomainError } from "./evidence-errors";
import {
  assertEvidenceRemovalAllowed,
  assertEvidenceTransition,
  canChangeEvidenceContent,
  canRemoveEvidence,
  canTransitionEvidence,
  isTerminalEvidenceStatus,
} from "./evidence-state-machine";

const permittedTransitions = [
  ["AWAITING_UPLOAD", "VALIDATING"],
  ["AWAITING_UPLOAD", "REMOVED"],
  ["VALIDATING", "READY"],
  ["VALIDATING", "REJECTED"],
  ["READY", "REMOVED"],
  ["REJECTED", "REMOVED"],
] as const;

describe("evidence state machine", () => {
  it.each(permittedTransitions)("permits %s to become %s", (from, to) => {
    expect(canTransitionEvidence(from, to)).toBe(true);
    expect(() => assertEvidenceTransition(from, to)).not.toThrow();
  });

  it.each([
    ["AWAITING_UPLOAD", "READY"],
    ["VALIDATING", "REMOVED"],
    ["READY", "VALIDATING"],
    ["REJECTED", "READY"],
    ["REMOVED", "READY"],
  ] as const)("rejects %s to %s", (from, to) => {
    expect(canTransitionEvidence(from, to)).toBe(false);
  });

  it("treats REMOVED as terminal", () => {
    expect(isTerminalEvidenceStatus("REMOVED")).toBe(true);
    expect(isTerminalEvidenceStatus("READY")).toBe(false);
    expect(isTerminalEvidenceStatus("REJECTED")).toBe(false);
  });

  it.each(["AWAITING_UPLOAD", "READY", "REJECTED"] as const)(
    "allows %s evidence to be removed while the case is DRAFT",
    (status) => {
      expect(canRemoveEvidence("DRAFT", status)).toBe(true);
    },
  );

  it("rejects removal after case submission", () => {
    expect(canRemoveEvidence("SUBMITTED", "READY")).toBe(false);
    expect(() =>
      assertEvidenceRemovalAllowed("SUBMITTED", "READY"),
    ).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_REMOVAL_NOT_ALLOWED" }),
    );
  });

  it("rejects removal while validation is owned", () => {
    expect(canRemoveEvidence("DRAFT", "VALIDATING")).toBe(false);
  });

  it("allows content changes only before validation", () => {
    expect(canChangeEvidenceContent("AWAITING_UPLOAD")).toBe(true);
    expect(canChangeEvidenceContent("READY")).toBe(false);
    expect(canChangeEvidenceContent("REJECTED")).toBe(false);
    expect(canChangeEvidenceContent("REMOVED")).toBe(false);
  });

  it("throws a stable typed transition error", () => {
    expect(() => assertEvidenceTransition("READY", "VALIDATING")).toThrowError(
      new EvidenceDomainError("INVALID_EVIDENCE_TRANSITION"),
    );
  });
});
