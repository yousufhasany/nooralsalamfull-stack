import Link from "next/link";
import { BedDouble, Maximize2, Users } from "lucide-react";
import { localePath, pick, pickBedType, type Locale } from "@/i18n/config";
import { photoForRoom } from "@/lib/site-photos";
import { fmt, plural } from "@/i18n/dictionary";
import type { Messages } from "@/i18n/messages/en";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { HotelImage } from "./media";
import { FacilityIcon } from "./facility-icon";

export interface RoomCardData {
  slug: string;
  id: string;
  nameEn: string;
  nameAr: string;
  nameBn: string;
  descriptionEn: string;
  descriptionAr: string;
  descriptionBn: string;
  bedType: string;
  bedTypeAr: string;
  bedTypeBn: string;
  sizeSqm: number | null;
  maxOccupancy: number;
  images: { url: string; altEn: string; altAr: string; altBn: string }[];
  amenities: { amenity: { icon: string; nameEn: string; nameAr: string; nameBn: string } }[];
}

export function RoomCard({
  room,
  locale,
  t,
  currency,
  fromPrice,
  availability,
  actionHref,
  actionLabel,
  total,
  nights,
  unavailableReason,
}: {
  room: RoomCardData;
  locale: Locale;
  t: Messages;
  currency: string;
  fromPrice?: string | null;
  availability?: number | null;
  actionHref?: string;
  actionLabel?: string;
  total?: string | null;
  nights?: number;
  unavailableReason?: string | null;
}) {
  const name = pick(room, "name", locale);
  const img = room.images[0];
  const photo = img?.url || photoForRoom(room.slug);
  const detailHref = localePath(locale, `/rooms/${room.slug}`);
  const bed = pickBedType(room, locale);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft transition-shadow hover:shadow-lift md:flex-row">
      <Link href={detailHref} className="relative block md:w-2/5" tabIndex={-1} aria-hidden>
        <HotelImage
          src={photo}
          alt={img ? pick(img, "alt", locale) || name : name}
          placeholderLabel={t.rooms.photoPlaceholder}
          className="aspect-[4/3] h-full w-full md:aspect-auto md:min-h-64"
          sizes="(min-width: 768px) 40vw, 100vw"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold text-brand-900">
          <Link href={detailHref} className="hover:text-brand-700">
            {name}
          </Link>
        </h3>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-500">
          <li className="flex items-center gap-1.5">
            <Users size={15} aria-hidden /> {fmt(t.common.sleeps, { n: room.maxOccupancy })}
          </li>
          {room.sizeSqm ? (
            <li className="flex items-center gap-1.5">
              <Maximize2 size={15} aria-hidden /> {room.sizeSqm} {t.common.sqm}
            </li>
          ) : null}
          {bed ? (
            <li className="flex items-center gap-1.5">
              <BedDouble size={15} aria-hidden /> {bed}
            </li>
          ) : null}
        </ul>
        {pick(room, "description", locale) ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-700">{pick(room, "description", locale)}</p> : null}
        {room.amenities.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t.rooms.amenities}>
            {room.amenities.slice(0, 5).map((a) => (
              <li key={a.amenity.nameEn} className="flex items-center gap-1.5 rounded-full bg-sand-100 px-2.5 py-1 text-xs text-ink-700">
                <FacilityIcon name={a.amenity.icon} size={13} />
                {pick(a.amenity, "name", locale)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
          <div>
            {total ? (
              <>
                <p className="text-xs uppercase tracking-wide text-ink-500">
                  {t.rooms.estimate} · {nights ? plural(t.common.nights, nights, locale) : ""}
                </p>
                <p className="font-display text-2xl font-semibold text-brand-900">{formatMoney(total, currency, locale)}</p>
              </>
            ) : fromPrice ? (
              <>
                <p className="text-xs uppercase tracking-wide text-ink-500">{t.common.from}</p>
                <p className="font-display text-2xl font-semibold text-brand-900">
                  {formatMoney(fromPrice, currency, locale)} <span className="font-sans text-sm font-normal text-ink-500">/ {t.common.perNight}</span>
                </p>
              </>
            ) : null}
            {availability != null && availability > 0 && availability <= 3 ? (
              <p className="mt-1 text-xs font-medium text-warn-600">{plural(t.common.roomsLeft, availability, locale)}</p>
            ) : null}
            {unavailableReason ? <p className="mt-1 text-xs font-medium text-danger-600">{unavailableReason}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link href={detailHref} className={cn(buttonVariants({ variant: "outline" }))}>
              {t.common.viewDetails}
            </Link>
            {actionHref ? (
              <Link href={actionHref} className={cn(buttonVariants({ variant: "primary" }))}>
                {actionLabel ?? t.common.bookNow}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
