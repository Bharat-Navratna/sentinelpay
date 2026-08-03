import { describe, expect, it } from "vitest";

import { PaymentDomainError } from "./payment-errors";
import { parsePoundsToPence, POSTGRES_INTEGER_MAX } from "./money";

describe("parsePoundsToPence", () => {
  it.each([
    ["65", 6_500],
    ["65.5", 6_550],
    ["65.50", 6_550],
    ["4000.50", 400_050],
    [" 20.00 ", 2_000],
    ["0.01", 1],
  ])("converts %s to integer pence", (input, expected) => {
    expect(parsePoundsToPence(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "0",
    "0.00",
    "-20",
    "+20",
    "65.999",
    "£65",
    "1,000.00",
    "1e3",
    "NaN",
    "Infinity",
    "20.",
    ".50",
    "twenty",
  ])("rejects invalid amount %j with a stable domain error", (input) => {
    expect(() => parsePoundsToPence(input)).toThrowError(
      expect.objectContaining<Partial<PaymentDomainError>>({
        code: "INVALID_MONEY_AMOUNT",
      }),
    );
  });

  it("accepts the PostgreSQL integer maximum", () => {
    expect(parsePoundsToPence("21474836.47")).toBe(POSTGRES_INTEGER_MAX);
  });

  it("rejects a value above the PostgreSQL integer maximum", () => {
    expect(() => parsePoundsToPence("21474836.48")).toThrowError(
      expect.objectContaining<Partial<PaymentDomainError>>({
        code: "INVALID_MONEY_AMOUNT",
      }),
    );
  });
});
