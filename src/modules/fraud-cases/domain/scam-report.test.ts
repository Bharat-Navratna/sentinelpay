import { describe, expect, it } from "vitest";

import { FraudCaseDomainError } from "./fraud-case-errors";
import {
  MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS,
  MAX_DISCOVERY_REASON_CHARACTERS,
  MAX_IMPERSONATED_ORGANISATION_CHARACTERS,
  MAX_NARRATIVE_CHARACTERS,
  MIN_NARRATIVE_CHARACTERS,
  contactChannels,
  isScamReportSubmissionReady,
  parseScamReport,
  scamCategories,
  type ScamReport,
} from "./scam-report";

function validReport(): ScamReport {
  return {
    suspectedScamCategory: "INVESTMENT",
    believedPaymentPurpose: "Investment account",
    contactChannel: "MESSAGING_APP",
    firstContactAt: new Date("2026-07-01T10:00:00.000Z"),
    discoveredAt: new Date("2026-08-01T12:00:00.000Z"),
    discoveryReason: "The organisation stopped responding.",
    narrative:
      "I was contacted about a synthetic investment demonstration and later became concerned.",
    pressureOrUrgency: "YES",
    guaranteedReturns: "UNSURE",
    toldToIgnoreWarnings: "NO",
    remoteAccessRequested: "NO",
    impersonatedOrganisation: "Example Investments",
    additionalSupportRequested: false,
  };
}

const requiredFields = [
  "suspectedScamCategory",
  "believedPaymentPurpose",
  "contactChannel",
  "discoveredAt",
  "discoveryReason",
  "narrative",
  "pressureOrUrgency",
  "guaranteedReturns",
  "toldToIgnoreWarnings",
  "remoteAccessRequested",
  "additionalSupportRequested",
] as const satisfies readonly (keyof ScamReport)[];

describe("structured scam report", () => {
  it("normalises a valid complete report without mutating the input", () => {
    const input = {
      ...validReport(),
      believedPaymentPurpose: "  Investment account  ",
      discoveryReason: "  The organisation stopped responding.  ",
      narrative:
        "  I was contacted about a synthetic investment demonstration and later became concerned.  ",
      impersonatedOrganisation: "  Example Investments  ",
    };
    const snapshot = structuredClone(input);
    const report = parseScamReport(input);

    expect(report).toMatchObject({
      believedPaymentPurpose: "Investment account",
      discoveryReason: "The organisation stopped responding.",
      impersonatedOrganisation: "Example Investments",
    });
    expect(input).toEqual(snapshot);
    expect(isScamReportSubmissionReady(report)).toBe(true);
  });

  it.each(requiredFields)("is not submission-ready without %s", (field) => {
    const input: Record<string, unknown> = { ...validReport() };
    delete input[field];

    expect(isScamReportSubmissionReady(input)).toBe(false);
    expect(() => parseScamReport(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_SCAM_REPORT" }),
    );
  });

  it.each(["YES", "NO", "UNSURE"] as const)(
    "accepts the %s three-state indicator",
    (indicator) => {
      expect(
        parseScamReport({
          ...validReport(),
          pressureOrUrgency: indicator,
          guaranteedReturns: indicator,
          toldToIgnoreWarnings: indicator,
          remoteAccessRequested: indicator,
        }).pressureOrUrgency,
      ).toBe(indicator);
    },
  );

  it.each(scamCategories)("accepts the %s scam category", (category) => {
    expect(
      parseScamReport({
        ...validReport(),
        suspectedScamCategory: category,
      }).suspectedScamCategory,
    ).toBe(category);
  });

  it.each(contactChannels)("accepts the %s contact channel", (channel) => {
    expect(
      parseScamReport({
        ...validReport(),
        contactChannel: channel,
      }).contactChannel,
    ).toBe(channel);
  });

  it("normalises a blank optional organisation to null", () => {
    expect(
      parseScamReport({
        ...validReport(),
        impersonatedOrganisation: "   ",
      }).impersonatedOrganisation,
    ).toBeNull();
  });

  it("accepts absent optional first-contact time and organisation", () => {
    const input: Record<string, unknown> = { ...validReport() };
    delete input.firstContactAt;
    delete input.impersonatedOrganisation;

    expect(parseScamReport(input)).toMatchObject({
      firstContactAt: null,
      impersonatedOrganisation: null,
    });
  });

  it.each([
    ["believedPaymentPurpose", MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS],
    ["discoveryReason", MAX_DISCOVERY_REASON_CHARACTERS],
    ["narrative", MAX_NARRATIVE_CHARACTERS],
    ["impersonatedOrganisation", MAX_IMPERSONATED_ORGANISATION_CHARACTERS],
  ] as const)("accepts the exact maximum for %s", (field, maximum) => {
    expect(
      isScamReportSubmissionReady({
        ...validReport(),
        [field]: "x".repeat(maximum),
      }),
    ).toBe(true);
  });

  it.each([
    ["believedPaymentPurpose", MAX_BELIEVED_PAYMENT_PURPOSE_CHARACTERS],
    ["discoveryReason", MAX_DISCOVERY_REASON_CHARACTERS],
    ["narrative", MAX_NARRATIVE_CHARACTERS],
    ["impersonatedOrganisation", MAX_IMPERSONATED_ORGANISATION_CHARACTERS],
  ] as const)("rejects overflow for %s", (field, maximum) => {
    expect(
      isScamReportSubmissionReady({
        ...validReport(),
        [field]: "x".repeat(maximum + 1),
      }),
    ).toBe(false);
  });

  it("accepts the exact narrative minimum and rejects one below it", () => {
    expect(
      isScamReportSubmissionReady({
        ...validReport(),
        narrative: "x".repeat(MIN_NARRATIVE_CHARACTERS),
      }),
    ).toBe(true);
    expect(
      isScamReportSubmissionReady({
        ...validReport(),
        narrative: "x".repeat(MIN_NARRATIVE_CHARACTERS - 1),
      }),
    ).toBe(false);
  });

  it.each(["believedPaymentPurpose", "discoveryReason"] as const)(
    "accepts a single non-whitespace character for %s",
    (field) => {
      expect(
        isScamReportSubmissionReady({ ...validReport(), [field]: "x" }),
      ).toBe(true);
    },
  );

  it("rejects blank required text", () => {
    expect(
      isScamReportSubmissionReady({
        ...validReport(),
        believedPaymentPurpose: "   ",
      }),
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseScamReport({ ...validReport(), bankPassword: "not collected" }),
    ).toThrowError(new FraudCaseDomainError("INVALID_SCAM_REPORT"));
  });
});
