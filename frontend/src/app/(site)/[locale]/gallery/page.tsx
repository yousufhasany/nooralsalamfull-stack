import type { Metadata } from "next";
import Link from "next/link";
import { localePath, pick, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { pageBasics, first } from "@/server/site-page";
import { firstGalleryPhoto, getPublicGallery } from "@/server/services/content.service";
import { SITE_GALLERY, SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { HotelImage } from "@/components/site/media";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/gallery", title: t.gallery.title, description: t.gallery.intro });
}

export default async function GalleryPage({ params, searchParams }: Props) {
  const { locale, t } = await pageBasics(params);
  const sp = await searchParams;
  const stored = await getPublicGallery().catch(() => []);
  const lobby = firstGalleryPhoto(stored, "LOBBY")?.url || SITE_PHOTOS.lobby;
  const labels = t.gallery.categories as Record<string, string>;
  const images =
    stored.length > 0
      ? stored.map((img) => ({ id: img.id, url: img.url, category: img.category, alt: pick(img, "alt", locale) || (labels[img.category] ?? "") }))
      : SITE_GALLERY.map((img) => ({ id: img.id, url: img.url, category: img.category, alt: labels[img.category] ?? "" }));
  const categories = Array.from(new Set(images.map((i) => i.category)));
  const active = categories.find((c) => c === first(sp.category));
  const shown = active ? images.filter((i) => i.category === active) : images;

  return (
    <>
      <PageHero title={t.gallery.title} intro={t.gallery.intro} image={lobby} />
      <Container className="mt-10">
        <GalleryGrid locale={locale} t={t} categories={categories} active={active} items={shown} />
      </Container>
    </>
  );
}

function GalleryGrid({
  locale,
  t,
  categories,
  active,
  items,
}: {
  locale: Locale;
  t: Messages;
  categories: string[];
  active?: string;
  items: { id: string; url: string; alt: string }[];
}) {
  const labels = t.gallery.categories as Record<string, string>;
  return (
    <>
      <nav aria-label={t.gallery.title} className="flex flex-wrap gap-2">
        {[undefined, ...categories].map((c) => (
          <Link
            key={c ?? "all"}
            href={localePath(locale, c ? `/gallery?category=${c}` : "/gallery")}
            aria-current={c === active ? "page" : undefined}
            className={cn("rounded-full border px-4 py-1.5 text-sm", c === active ? "border-brand-800 bg-brand-800 text-white" : "border-sand-300 bg-white text-ink-700 hover:bg-sand-100")}
          >
            {c ? (labels[c] ?? c) : t.gallery.all}
          </Link>
        ))}
      </nav>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((img) => (
          <li key={img.id}>
            <HotelImage src={img.url} alt={img.alt} className="aspect-[4/3] rounded-xl" />
          </li>
        ))}
      </ul>
    </>
  );
}
