export const LOCALES = ["en", "ar", "bn"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, { label: string; nativeLabel: string; dir: "ltr" | "rtl"; htmlLang: string; ogLocale: string }> = {
  en: { label: "English", nativeLabel: "English", dir: "ltr", htmlLang: "en", ogLocale: "en_US" },
  ar: { label: "Arabic", nativeLabel: "العربية", dir: "rtl", htmlLang: "ar", ogLocale: "ar_SA" },
  bn: { label: "Bangla", nativeLabel: "বাংলা", dir: "ltr", htmlLang: "bn", ogLocale: "bn_BD" },
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** English is served from the unprefixed path; other locales are prefixed (/ar/rooms). */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Pick the localised variant of a database field family: pick(row, "name", "ar") -> row.nameAr. */
export function pick(row: object, base: string, locale: Locale): string {
  const r = row as Record<string, unknown>;
  const suffix = locale === "en" ? "En" : locale === "ar" ? "Ar" : "Bn";
  const v = r[`${base}${suffix}`];
  if (typeof v === "string" && v.trim()) return v;
  const fallback = r[`${base}En`];
  return typeof fallback === "string" ? fallback : "";
}

/** RoomType.bedType holds the English value; the translations are bedTypeAr / bedTypeBn. */
export function pickBedType(row: { bedType: string; bedTypeAr: string; bedTypeBn: string }, locale: Locale): string {
  const v = locale === "ar" ? row.bedTypeAr : locale === "bn" ? row.bedTypeBn : row.bedType;
  return v.trim() ? v : row.bedType;
}
