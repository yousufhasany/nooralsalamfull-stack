import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { localePath, pick } from "@/i18n/config";
import { pageBasics, getRoomsWithFromPrice } from "@/server/site-page";
import { getPublicFacilities } from "@/server/services/content.service";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { BookingSearch } from "@/components/site/booking-search";
import { RoomCard } from "@/components/site/room-card";
import { FacilityIcon } from "@/components/site/facility-icon";
import { HotelJsonLd } from "@/components/site/hotel-jsonld";
import { Container, SectionHeading } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t, ctx } = await pageBasics(params);
  const name = ctx.hotel ? pick(ctx.hotel, "name", locale) : t.meta.siteSuffix;
  return pageMetadata({
    locale,
    path: "/",
    title: name,
    description: (ctx.hotel && pick(ctx.hotel, "tagline", locale)) || t.meta.defaultDescription,
    image: ctx.hotel?.heroImageUrl || null,
  });
}

export default async function HomePage({ params }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const [rooms, facilities] = await Promise.all([getRoomsWithFromPrice(ctx.today), getPublicFacilities().catch(() => [])]);
  const hotel = ctx.hotel;
  const name = hotel ? pick(hotel, "name", locale) : t.meta.siteSuffix;
  const tagline = (hotel && pick(hotel, "tagline", locale)) || t.home.fallbackTagline;

  return (
    <>
      <HotelJsonLd ctx={ctx} locale={locale} />
      <section className="relative -mt-16 min-h-[100svh] overflow-hidden text-white">
        <Image src={hotel?.heroImageUrl || SITE_PHOTOS.exterior} alt="" fill priority sizes="100vw" className="object-cover object-[center_40%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-brand-950/25 to-brand-950/20" aria-hidden />
        <Container className="relative flex min-h-[100svh] flex-col justify-end pb-36 pt-28">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-gold-400">{t.home.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.05] sm:text-7xl">{name}</h1>
          <p className="mt-5 max-w-xl text-lg text-white/90">{tagline}</p>
          <p className="mt-2 max-w-xl text-white/75">{(hotel && pick(hotel, "description", locale).split("\n")[0]) || t.home.fallbackIntro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "gold", size: "lg" }))}>
              {t.home.bookYourStay}
            </Link>
            <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/40 bg-white/10 text-white hover:bg-white/20")}>
              {t.home.exploreRooms}
            </Link>
          </div>
        </Container>
      </section>

      <Container className="relative z-10 -mt-14">
        <BookingSearch locale={locale} t={t} today={ctx.today} />
      </Container>

      <Container className="mt-20">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[
            { src: SITE_PHOTOS.exterior, label: t.gallery.categories.EXTERIOR },
            { src: SITE_PHOTOS.deluxe, label: t.nav.rooms },
            { src: SITE_PHOTOS.family, label: t.gallery.categories.ROOMS },
            { src: SITE_PHOTOS.suite, label: t.gallery.categories.HOTEL },
          ].map((photo) => (
            <figure key={photo.src} className="group relative aspect-[3/4] overflow-hidden rounded-2xl sm:aspect-[4/5]">
              <Image src={photo.src} alt={photo.label} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/80 to-transparent px-4 pb-4 pt-10 text-sm font-medium text-white">
                {photo.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>

      <Container className="mt-24">
        <SectionHeading eyebrow={t.home.whyTitle} title={t.home.whyTitle} align="center" />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {t.home.why.map((w) => (
            <li key={w.title} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-soft">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Check size={18} aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-brand-900">{w.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{w.text}</p>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t.home.roomsTitle} title={t.home.roomsTitle} intro={t.home.roomsIntro} />
          {rooms.length > 0 ? (
            <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "outline" }))}>
              {t.common.seeAll}
            </Link>
          ) : null}
        </div>
        {rooms.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-sand-300 bg-white p-8 text-center text-ink-500">{t.home.noRoomsYet}</p>
        ) : (
          <div className="mt-8 grid gap-6">
            {rooms.slice(0, 3).map(({ room, fromPrice }) => (
              <RoomCard key={room.id} room={room} locale={locale} t={t} currency={ctx.currency} fromPrice={fromPrice} actionHref={localePath(locale, `/rooms/${room.slug}`)} />
            ))}
          </div>
        )}
        {rooms.length > 0 ? <p className="mt-4 text-xs text-ink-500">{ctx.pricesIncludeTax ? t.rooms.includesTaxNote : t.rooms.excludesTaxNote}</p> : null}
      </Container>

      <Container className="mt-24">
        <SectionHeading eyebrow={t.home.facilitiesTitle} title={t.home.facilitiesTitle} intro={t.home.facilitiesIntro} />
        {facilities.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-sand-300 bg-white p-8 text-center text-ink-500">{t.home.noFacilitiesYet}</p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.slice(0, 6).map((f) => (
              <li key={f.id} className="flex gap-4 rounded-2xl border border-sand-200 bg-white p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-900 text-gold-400">
                  <FacilityIcon name={f.icon} />
                </span>
                <div>
                  <h3 className="font-medium text-brand-900">{pick(f, "name", locale)}</h3>
                  {pick(f, "description", locale) ? <p className="mt-1 text-sm text-ink-500">{pick(f, "description", locale)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container className="mt-24">
        <div className="relative overflow-hidden rounded-3xl px-8 py-16 text-center text-white">
          <Image src={SITE_PHOTOS.courtyard} alt="" fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-brand-950/65" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t.home.ctaTitle}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">{t.home.ctaText}</p>
            <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "gold", size: "lg" }), "mt-7")}>
              {t.nav.bookNow}
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
