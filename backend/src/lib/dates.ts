/**
 * Date-only helpers. Stays are stored as Postgres DATE (no timezone). In code we pass
 * them around as "YYYY-MM-DD" strings (hotel-local calendar dates) to avoid timezone bugs.
 */
export type DateStr = string;

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(v: unknown): v is DateStr {
  if (typeof v !== "string" || !RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const toDate = (s: DateStr): Date => new Date(`${s}T00:00:00Z`);

export const fromDate = (d: Date): DateStr => d.toISOString().slice(0, 10);

export function addDays(s: DateStr, n: number): DateStr {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

export function diffDays(from: DateStr, to: DateStr): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** Nights occupied by a stay: [checkIn, checkOut). */
export function eachNight(checkIn: DateStr, checkOut: DateStr): DateStr[] {
  const n = diffDays(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** ISO weekday 1 (Mon) .. 7 (Sun). */
export function isoWeekday(s: DateStr): number {
  const d = toDate(s).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone = "Asia/Riyadh", now: Date = new Date()): DateStr {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function startOfMonth(s: DateStr): DateStr {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonthExclusive(s: DateStr): DateStr {
  const d = toDate(startOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return fromDate(d);
}

export function formatDate(
  s: DateStr | Date,
  locale: "en" | "ar" | "bn" = "en",
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  hijri = false,
): string {
  const d = typeof s === "string" ? toDate(s) : s;
  const base = locale === "ar" ? "ar-SA" : locale === "bn" ? "bn-BD" : "en-GB";
  const tag = hijri ? `${base}-u-ca-islamic-umalqura` : `${base}-u-ca-gregory`;
  return new Intl.DateTimeFormat(tag, { ...opts, timeZone: "UTC" }).format(d);
}

export function formatDateTime(d: Date, locale: "en" | "ar" | "bn" = "en", timezone = "Asia/Riyadh"): string {
  const base = locale === "ar" ? "ar-SA" : locale === "bn" ? "bn-BD" : "en-GB";
  return new Intl.DateTimeFormat(`${base}-u-ca-gregory`, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(d);
}
