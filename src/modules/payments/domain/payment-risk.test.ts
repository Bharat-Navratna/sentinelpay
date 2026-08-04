import { describe, expect, it } from "vitest";

import { PaymentDomainError } from "./payment-errors";
import {
  evaluatePaymentRisk,
  PAYMENT_RISK_RULE_VERSION,
  type PaymentRiskInput,
} from "./payment-risk";

const ordinaryPayment: PaymentRiskInput = {
  amountMinor: 6_500,
  reference: "Dance class",
  previousSettledAccountAmountsMinor: [5_000, 6_500, 8_000],
  previousSettledPaymentCountToBeneficiary: 1,
};

describe("evaluatePaymentRisk", () => {
  it("allows a known payee with an ordinary amount and reference", () => {
    expect(evaluatePaymentRisk(ordinaryPayment)).toMatchObject({
      decision: "ALLOW",
      score: 0,
      reasonCodes: [],
    });
  });

  it("triggers NEW_PAYEE only", () => {
    expect(
      evaluatePaymentRisk({
        ...ordinaryPayment,
        previousSettledPaymentCountToBeneficiary: 0,
      }),
    ).toMatchObject({
      decision: "ALLOW",
      score: 35,
      reasonCodes: ["NEW_PAYEE"],
    });
  });

  it("triggers AMOUNT_OUTLIER against historical payments", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      amountMinor: 50_000,
    });

    expect(result).toMatchObject({
      decision: "ALLOW",
      score: 35,
      reasonCodes: ["AMOUNT_OUTLIER"],
      internalFacts: { amountOutlierThresholdMinor: 50_000 },
    });
  });

  it("uses the fallback threshold when there is no account history", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      amountMinor: 100_000,
      previousSettledAccountAmountsMinor: [],
      previousSettledPaymentCountToBeneficiary: 0,
    });

    expect(result).toMatchObject({
      decision: "INTERVENE",
      score: 70,
      reasonCodes: ["NEW_PAYEE", "AMOUNT_OUTLIER"],
      internalFacts: {
        medianSettledAmountMinor: null,
        amountOutlierThresholdMinor: 100_000,
      },
    });
  });

  it("triggers when the amount is exactly equal to a history-derived threshold", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      amountMinor: 60_000,
      previousSettledAccountAmountsMinor: [12_000],
    });

    expect(result.reasonCodes).toContain("AMOUNT_OUTLIER");
    expect(result.internalFacts.amountOutlierThresholdMinor).toBe(60_000);
  });

  it("triggers INVESTMENT_SCAM_LANGUAGE only", () => {
    expect(
      evaluatePaymentRisk({ ...ordinaryPayment, reference: "Investment" }),
    ).toMatchObject({
      decision: "ALLOW",
      score: 40,
      reasonCodes: ["INVESTMENT_SCAM_LANGUAGE"],
      internalFacts: { matchedInvestmentTerms: ["investment"] },
    });
  });

  it("matches approved terms case-insensitively", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      reference: "BiTcOiN",
    });

    expect(result.reasonCodes).toEqual(["INVESTMENT_SCAM_LANGUAGE"]);
    expect(result.internalFacts.matchedInvestmentTerms).toEqual(["bitcoin"]);
  });

  it("matches punctuation-separated complete tokens", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      reference: "monthly:broker/payment",
    });

    expect(result.internalFacts.matchedInvestmentTerms).toEqual(["broker"]);
  });

  it("creates one language reason when several approved terms match", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      reference: "Crypto, bitcoin and crypto trading profit",
    });

    expect(result.reasonCodes).toEqual(["INVESTMENT_SCAM_LANGUAGE"]);
    expect(result.internalFacts.matchedInvestmentTerms).toEqual([
      "crypto",
      "bitcoin",
      "trading",
      "profit",
    ]);
  });

  it("does not match approved terms inside unrelated longer words", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      reference: "reinvestment profitable brokerage",
    });

    expect(result.reasonCodes).toEqual([]);
    expect(result.internalFacts.matchedInvestmentTerms).toEqual([]);
  });

  it("intervenes when combined reasons reach the threshold", () => {
    expect(
      evaluatePaymentRisk({
        ...ordinaryPayment,
        reference: "crypto",
        previousSettledPaymentCountToBeneficiary: 0,
      }),
    ).toMatchObject({
      decision: "INTERVENE",
      score: 75,
      reasonCodes: ["NEW_PAYEE", "INVESTMENT_SCAM_LANGUAGE"],
    });
  });

  it("caps the score at 100", () => {
    expect(
      evaluatePaymentRisk({
        amountMinor: 100_000,
        reference: "investment",
        previousSettledAccountAmountsMinor: [],
        previousSettledPaymentCountToBeneficiary: 0,
      }),
    ).toMatchObject({
      decision: "INTERVENE",
      score: 100,
      reasonCodes: [
        "NEW_PAYEE",
        "AMOUNT_OUTLIER",
        "INVESTMENT_SCAM_LANGUAGE",
      ],
    });
  });

  it("uses the middle value for an odd-count median", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      previousSettledAccountAmountsMinor: [9_000, 1_000, 5_000],
    });

    expect(result.internalFacts.medianSettledAmountMinor).toBe(5_000);
  });

  it("floors the average for an even-count median", () => {
    const result = evaluatePaymentRisk({
      ...ordinaryPayment,
      previousSettledAccountAmountsMinor: [8_001, 1_000, 8_000, 2_000],
    });

    expect(result.internalFacts.medianSettledAmountMinor).toBe(5_000);
  });

  it("returns the deterministic rule version", () => {
    expect(evaluatePaymentRisk(ordinaryPayment).ruleVersion).toBe(
      PAYMENT_RISK_RULE_VERSION,
    );
    expect(PAYMENT_RISK_RULE_VERSION).toBe("deterministic-v1");
  });

  it("does not mutate the historical amounts", () => {
    const historicalAmounts = [8_000, 1_000, 5_000];
    const originalOrder = [...historicalAmounts];

    evaluatePaymentRisk({
      ...ordinaryPayment,
      previousSettledAccountAmountsMinor: historicalAmounts,
    });

    expect(historicalAmounts).toEqual(originalOrder);
  });

  it.each([
    { ...ordinaryPayment, amountMinor: 0 },
    { ...ordinaryPayment, amountMinor: 1.5 },
    { ...ordinaryPayment, previousSettledAccountAmountsMinor: [0] },
    {
      ...ordinaryPayment,
      previousSettledPaymentCountToBeneficiary: -1,
    },
    {
      ...ordinaryPayment,
      previousSettledAccountAmountsMinor: [],
      previousSettledPaymentCountToBeneficiary: 1,
    },
  ])("rejects invalid risk input with a stable domain error", (input) => {
    expect(() => evaluatePaymentRisk(input)).toThrowError(
      expect.objectContaining<Partial<PaymentDomainError>>({
        code: "INVALID_RISK_INPUT",
      }),
    );
  });
});
