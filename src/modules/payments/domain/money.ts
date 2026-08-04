import { PaymentDomainError } from "./payment-errors";

export const POSTGRES_INTEGER_MAX = 2_147_483_647;

const POUNDS_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parsePoundsToPence(amount: string): number {
  const trimmedAmount = amount.trim();

  if (!POUNDS_PATTERN.test(trimmedAmount)) {
    throw new PaymentDomainError("INVALID_MONEY_AMOUNT");
  }

  const [pounds, fraction = ""] = trimmedAmount.split(".");
  const paddedFraction = fraction.padEnd(2, "0");
  const amountMinor =
    BigInt(pounds) * BigInt(100) + BigInt(paddedFraction || "0");

  if (amountMinor <= BigInt(0) || amountMinor > BigInt(POSTGRES_INTEGER_MAX)) {
    throw new PaymentDomainError("INVALID_MONEY_AMOUNT");
  }

  return Number(amountMinor);
}
