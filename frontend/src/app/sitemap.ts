import type { MetadataRoute } from "next";
import { db } from "@/server/db/client";
import { LOCALES, LOCALE_META, localePath } from "@/i18n/config";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/rooms", "/facilities", "/about", "/gallery", "/contact"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const slugs = await db.roomType
    .findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } })
    .catch(() => []);

  const entry = (path: string, lastModified?: Date) => ({
    url: `${base}${localePath("en", path)}`,
    lastModified,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [LOCALE_META[l].htmlLang, `${base}${localePath(l, path)}`])),
    },
  });

  return [...STATIC_PATHS.map((p) => entry(p)), ...slugs.map((r) => entry(`/rooms/${r.slug}`, r.updatedAt))];
}
