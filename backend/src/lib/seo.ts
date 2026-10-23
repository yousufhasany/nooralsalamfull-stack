import type { Metadata } from "next";
import { LOCALES, LOCALE_META, localePath, type Locale } from "@/i18n/config";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function alternatesFor(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].htmlLang] = `${siteUrl()}${localePath(l, path)}`;
  languages["x-default"] = `${siteUrl()}${localePath("en", path)}`;
  return { canonical: `${siteUrl()}${localePath(locale, path)}`, languages };
}

export function pageMetadata(opts: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  image?: string | null;
  noindex?: boolean;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: alternatesFor(opts.locale, opts.path),
    robots: opts.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: opts.title,
      description: opts.description,
      type: "website",
      locale: LOCALE_META[opts.locale].ogLocale,
      url: `${siteUrl()}${localePath(opts.locale, opts.path)}`,
      images: opts.image ? [{ url: opts.image }] : undefined,
    },
  };
}
