import { POSTGRES_INTEGER_MAX } from "./money";
import { PaymentDomainError } from "./payment-errors";

export const PAYMENT_RISK_RULE_VERSION = "deterministic-v1" as const;

export const paymentRiskReasonCodes = [
  "NEW_PAYEE",
  "AMOUNT_OUTLIER",
  "INVESTMENT_SCAM_LANGUAGE",
] as const;

export type PaymentRiskReasonCode =
  (typeof paymentRiskReasonCodes)[number];
export type PaymentRiskDecision = "ALLOW" | "INTERVENE";

export type PaymentRiskInput = {
  amountMinor: number;
  reference: string;
  previousSettledAccountAmountsMinor: readonly number[];
  previousSettledPaymentCountToBeneficiary: number;
};

export type PaymentRiskResult = {
  decision: PaymentRiskDecision;
  score: number;
  reasonCodes: PaymentRiskReasonCode[];
  internalFacts: {
    previousSettledPaymentCount: number;
    previousSettledPaymentCountToBeneficiary: number;
    medianSettledAmountMinor: number | null;
    amountOutlierThresholdMinor: number;
    matchedInvestmentTerms: string[];
  };
  ruleVersion: typeof PAYMENT_RISK_RULE_VERSION;
};

const NO_HISTORY_THRESHOLD_MINOR = 100_000;
const MINIMUM_HISTORY_THRESHOLD_MINOR = 50_000;
const INTERVENTION_THRESHOLD = 50;

const weights: Record<PaymentRiskReasonCode, number> = {
  NEW_PAYEE: 35,
  AMOUNT_OUTLIER: 35,
  INVESTMENT_SCAM_LANGUAGE: 40,
};

const investmentRiskTerms = new Set([
  "investment",
  "invest",
  "crypto",
  "bitcoin",
  "returns",
  "profit",
  "trading",
  "broker",
]);

function assertValidRiskInput(input: PaymentRiskInput): void {
  const validAmount =
    Number.isSafeInteger(input.amountMinor) &&
    input.amountMinor > 0 &&
    input.amountMinor <= POSTGRES_INTEGER_MAX;
  const validBeneficiaryCount =
    Number.isSafeInteger(input.previousSettledPaymentCountToBeneficiary) &&
    input.previousSettledPaymentCountToBeneficiary >= 0 &&
    input.previousSettledPaymentCountToBeneficiary <=
      input.previousSettledAccountAmountsMinor.length;
  const validHistory = input.previousSettledAccountAmountsMinor.every(
    (amount) =>
      Number.isSafeInteger(amount) &&
      amount > 0 &&
      amount <= POSTGRES_INTEGER_MAX,
  );

  if (!validAmount || !validBeneficiaryCount || !validHistory) {
    throw new PaymentDomainError("INVALID_RISK_INPUT");
  }
}

function calculateMedian(sortedAmounts: readonly number[]): number | null {
  if (sortedAmounts.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(sortedAmounts.length / 2);

  if (sortedAmounts.length % 2 === 1) {
    return sortedAmounts[middleIndex] ?? null;
  }

  const lowerMiddle = sortedAmounts[middleIndex - 1];
  const upperMiddle = sortedAmounts[middleIndex];

  if (lowerMiddle === undefined || upperMiddle === undefined) {
    throw new PaymentDomainError("INVALID_RISK_INPUT");
  }

  return Math.floor((lowerMiddle + upperMiddle) / 2);
}

function normaliseReference(reference: string): string {
  return reference
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function findMatchedInvestmentTerms(reference: string): string[] {
  const tokens = normaliseReference(reference).split(" ").filter(Boolean);

  return [...new Set(tokens.filter((token) => investmentRiskTerms.has(token)))];
}

export function evaluatePaymentRisk(input: PaymentRiskInput): PaymentRiskResult {
  assertValidRiskInput(input);

  const sortedAmounts = [...input.previousSettledAccountAmountsMinor].sort(
    (left, right) => left - right,
  );
  const medianSettledAmountMinor = calculateMedian(sortedAmounts);
  const amountOutlierThresholdMinor =
    medianSettledAmountMinor === null
      ? NO_HISTORY_THRESHOLD_MINOR
      : Math.max(
          MINIMUM_HISTORY_THRESHOLD_MINOR,
          medianSettledAmountMinor * 5,
        );
  const matchedInvestmentTerms = findMatchedInvestmentTerms(input.reference);
  const reasonCodes: PaymentRiskReasonCode[] = [];

  if (input.previousSettledPaymentCountToBeneficiary === 0) {
    reasonCodes.push("NEW_PAYEE");
  }

  if (input.amountMinor >= amountOutlierThresholdMinor) {
    reasonCodes.push("AMOUNT_OUTLIER");
  }

  if (matchedInvestmentTerms.length > 0) {
    reasonCodes.push("INVESTMENT_SCAM_LANGUAGE");
  }

  const score = Math.min(
    100,
    reasonCodes.reduce((total, reasonCode) => total + weights[reasonCode], 0),
  );

  return {
    decision: score >= INTERVENTION_THRESHOLD ? "INTERVENE" : "ALLOW",
    score,
    reasonCodes,
    internalFacts: {
      previousSettledPaymentCount: sortedAmounts.length,
      previousSettledPaymentCountToBeneficiary:
        input.previousSettledPaymentCountToBeneficiary,
      medianSettledAmountMinor,
      amountOutlierThresholdMinor,
      matchedInvestmentTerms,
    },
    ruleVersion: PAYMENT_RISK_RULE_VERSION,
  };
}
