import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Maximize2, Users } from "lucide-react";
import { localePath, pick, pickBedType } from "@/i18n/config";
import { fmt } from "@/i18n/dictionary";
import { pageBasics } from "@/server/site-page";
import { getPublicRoomTypeBySlug } from "@/server/services/content.service";
import { getAvailability } from "@/server/services/availability.service";
import { priceForNight } from "@/server/services/pricing.service";
import { addDays } from "@/lib/dates";
import { roomGallery } from "@/lib/site-photos";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { BookingSearch } from "@/components/site/booking-search";
import { AvailabilityCalendar } from "@/components/site/availability-calendar";
import { FacilityIcon } from "@/components/site/facility-icon";
import { HotelImage } from "@/components/site/media";
import { JsonLd } from "@/components/site/json-ld";
import { Container } from "@/components/site/sections";
import { siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { locale, t } = await pageBasics(params);
  const room = await getPublicRoomTypeBySlug(slug).catch(() => null);
  if (!room) return { title: t.errors.notFoundTitle };
  return pageMetadata({
    locale,
    path: `/rooms/${slug}`,
    title: pick(room, "name", locale),
    description: pick(room, "description", locale) || t.rooms.intro,
    image: room.images[0]?.url ?? null,
  });
}

export default async function RoomDetailPage({ params }: Props) {
  const { slug } = await params;
  const { locale, t, ctx } = await pageBasics(params);
  const room = await getPublicRoomTypeBySlug(slug).catch(() => null);
  if (!room) notFound();

  const horizon = addDays(ctx.today, 60);
  const [availability, fromPrice] = await Promise.all([
    getAvailability({ roomTypeIds: [room.id], checkIn: ctx.today, checkOut: horizon }).catch(() => null),
    priceForNight(room.id, addDays(ctx.today, 1)).catch(() => null),
  ]);

  const name = pick(room, "name", locale);
  const bed = pickBedType(room, locale);
  const gallery =
    room.images.length > 0
      ? room.images.map((img) => ({ id: img.id, url: img.url, alt: pick(img, "alt", locale) || name }))
      : roomGallery(room.slug).map((url, i) => ({ id: `${room.slug}-${i}`, url, alt: name }));
  const [main, ...rest] = gallery;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HotelRoom",
          name,
          description: pick(room, "description", locale) || undefined,
          url: `${siteUrl()}${localePath(locale, `/rooms/${room.slug}`)}`,
          image: main?.url,
          occupancy: { "@type": "QuantitativeValue", maxValue: room.maxOccupancy },
          ...(room.sizeSqm ? { floorSize: { "@type": "QuantitativeValue", value: room.sizeSqm, unitCode: "MTK" } } : {}),
        }}
      />
      <Container className="pt-8">
        <Link href={localePath(locale, "/rooms")} className="text-sm text-brand-700 hover:underline">
          ← {t.rooms.backToRooms}
        </Link>
        <h1 className="mt-3 font-display text-4xl font-semibold text-brand-900 sm:text-5xl">{name}</h1>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-500">
          <li className="flex items-center gap-1.5">
            <Users size={16} aria-hidden /> {fmt(t.common.sleeps, { n: room.maxOccupancy })}
          </li>
          {room.sizeSqm ? (
            <li className="flex items-center gap-1.5">
              <Maximize2 size={16} aria-hidden /> {room.sizeSqm} {t.common.sqm}
            </li>
          ) : null}
          {bed ? (
            <li className="flex items-center gap-1.5">
              <BedDouble size={16} aria-hidden /> {bed}
            </li>
          ) : null}
        </ul>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <HotelImage src={main?.url} alt={main?.alt || name} placeholderLabel={t.rooms.photoPlaceholder} className="aspect-[16/10] rounded-2xl md:col-span-2 md:row-span-2 md:aspect-auto md:min-h-96" sizes="(min-width: 768px) 66vw, 100vw" priority />
          {rest.map((img) => (
            <HotelImage key={img.id} src={img.url} alt={img.alt} className="aspect-[16/10] rounded-2xl" sizes="(min-width: 768px) 33vw, 100vw" />
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            {pick(room, "description", locale) ? (
              <>
                <h2 className="font-display text-2xl font-semibold text-brand-900">{t.rooms.description}</h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-700">{pick(room, "description", locale)}</p>
              </>
            ) : null}

            {room.amenities.length > 0 ? (
              <>
                <h2 className="mt-10 font-display text-2xl font-semibold text-brand-900">{t.rooms.amenities}</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {room.amenities.map((a) => (
                    <li key={a.amenityId} className="flex items-center gap-3 text-ink-700">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
                        <FacilityIcon name={a.amenity.icon} size={18} />
                      </span>
                      {pick(a.amenity, "name", locale)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <h2 className="mt-10 font-display text-2xl font-semibold text-brand-900">{t.rooms.calendarTitle}</h2>
            <div className="mt-4">
              {availability ? (
                <AvailabilityCalendar nights={availability[0]?.nights ?? []} today={ctx.today} locale={locale} t={t} />
              ) : (
                <p className="text-sm text-ink-500">{t.errors.generic}</p>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-soft">
              {fromPrice ? (
                <p className="mb-4">
                  <span className="text-xs uppercase tracking-wide text-ink-500">{t.common.from} </span>
                  <span className="font-display text-3xl font-semibold text-brand-900">{formatMoney(fromPrice, ctx.currency, locale)}</span>
                  <span className="text-sm text-ink-500"> / {t.common.perNight}</span>
                </p>
              ) : null}
              <h2 className="font-display text-xl font-semibold text-brand-900">{t.search.title}</h2>
              <p className="mb-3 mt-2 text-sm text-ink-500">{t.rooms.checkDates}</p>
              <BookingSearch locale={locale} t={t} today={ctx.today} roomType={room.slug} variant="stacked" />
              <p className="mt-3 text-xs text-ink-500">{ctx.pricesIncludeTax ? t.rooms.includesTaxNote : t.rooms.excludesTaxNote}</p>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
