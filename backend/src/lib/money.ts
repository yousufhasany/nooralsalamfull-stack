import Decimal from "decimal.js";

/**
 * All monetary arithmetic goes through decimal.js. Floating point numbers are never used
 * for money. Values cross the database boundary as strings.
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value | { toString(): string };

export const D = (v: MoneyInput | null | undefined): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (Decimal.isDecimal(v)) return v as Decimal;
  return new Decimal(typeof v === "object" ? v.toString() : (v as Decimal.Value));
};

export const ZERO = new Decimal(0);

/** Round to 2 decimals using half-up (commercial rounding). */
export const round2 = (v: MoneyInput): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Database string representation (always 2 decimals). */
export const toDb = (v: MoneyInput): string => round2(v).toFixed(2);

export const sum = (values: MoneyInput[]): Decimal => values.reduce<Decimal>((acc, v) => acc.plus(D(v)), ZERO);

export const isZero = (v: MoneyInput): boolean => D(v).isZero();

export const eq = (a: MoneyInput, b: MoneyInput): boolean => round2(a).equals(round2(b));

export const max0 = (v: MoneyInput): Decimal => (D(v).isNegative() ? ZERO : D(v));

/** Format for display, e.g. "SAR 1,000.00" / "1٬000٫00 ر.س". Display only - never parse the result. */
export function formatMoney(
  v: MoneyInput | null | undefined,
  currency = "SAR",
  locale: "en" | "ar" | "bn" = "en",
): string {
  const n = round2(D(v));
  const intl = locale === "ar" ? "ar-SA" : locale === "bn" ? "bn-BD" : "en-US";
  // Intl accepts strings via toFixed -> Number only for display; magnitude is far below 2^53.
  const formatted = new Intl.NumberFormat(intl, {
    style: "currency",
    currency,
    currencyDisplay: locale === "ar" ? "symbol" : "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n.toFixed(2)));
  return formatted.replace(/\u00a0/g, " ");
}

/** Percentage helper: amount * rate% (rate given as e.g. "15" meaning 15%). */
export const pct = (amount: MoneyInput, ratePercent: MoneyInput): Decimal =>
  round2(D(amount).mul(D(ratePercent)).div(100));

export { Decimal };
