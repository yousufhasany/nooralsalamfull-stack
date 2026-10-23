import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { localePath, pick } from "@/i18n/config";
import { fmt, plural } from "@/i18n/dictionary";
import { pageBasics, first } from "@/server/site-page";
import { searchAvailableRoomTypes, validateStayDates } from "@/server/services/availability.service";
import { quoteStay, type QuoteBreakdown } from "@/server/services/pricing.service";
import { AppError } from "@/lib/errors";
import { diffDays, formatDate, isDateStr } from "@/lib/dates";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Alert, Input } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { BookingSearch } from "@/components/site/booking-search";
import { BookingForm } from "@/components/site/booking-form";
import { QuoteSummary } from "@/components/site/quote-summary";
import { RoomCard } from "@/components/site/room-card";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/booking", title: t.booking.title, description: t.search.title, noindex: true });
}

const searchSchema = z.object({
  checkIn: z.string().refine(isDateStr),
  checkOut: z.string().refine(isDateStr),
  adults: z.coerce.number().int().min(1).max(20).catch(2),
  children: z.coerce.number().int().min(0).max(20).catch(0),
  rooms: z.coerce.number().int().min(1).max(10).catch(1),
});

export default async function BookingPage({ params, searchParams }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const sp = await searchParams;
  const parsed = searchSchema.safeParse({
    checkIn: first(sp.checkIn),
    checkOut: first(sp.checkOut),
    adults: first(sp.adults),
    children: first(sp.children),
    rooms: first(sp.rooms),
  });

  const header = <PageHero title={t.booking.title} image={SITE_PHOTOS.hero} />;

  if (!parsed.success) {
    return (
      <>
        {header}
        <Container className="relative z-10 -mt-8">
          <BookingSearch locale={locale} t={t} today={ctx.today} variant="inline" />
          <p className="mt-6 text-center text-ink-500">{t.booking.startSearch}</p>
        </Container>
      </>
    );
  }

  const search = parsed.data;
  const searchBar = (
    <Container className="relative z-10 -mt-8">
      <BookingSearch locale={locale} t={t} today={ctx.today} variant="inline" defaults={search} />
    </Container>
  );

  const booking = ctx.settings?.booking;
  let nights = 0;
  try {
    nights = validateStayDates(search.checkIn, search.checkOut, {
      today: ctx.today,
      minStay: booking?.minStay ?? 1,
      maxStay: booking?.maxStay ?? 30,
      maxAdvanceDays: booking?.maxAdvanceDays ?? 540,
    });
  } catch (e) {
    return (
      <>
        {header}
        {searchBar}
        <Container className="mt-8">
          <Alert tone="warn">{e instanceof AppError ? e.message : t.errors.INVALID_DATES}</Alert>
        </Container>
      </>
    );
  }

  if (search.adults < search.rooms) {
    return (
      <>
        {header}
        {searchBar}
        <Container className="mt-8">
          <Alert tone="warn">{t.errors.INVALID_INPUT}</Alert>
        </Container>
      </>
    );
  }

  const results = await searchAvailableRoomTypes({ ...search, source: "DIRECT_WEBSITE" }).catch(() => null);
  if (!results) {
    return (
      <>
        {header}
        {searchBar}
        <Container className="mt-8">
          <Alert tone="danger">{t.errors.generic}</Alert>
        </Container>
      </>
    );
  }

  const range = `${formatDate(search.checkIn, locale, undefined, ctx.hijri)} – ${formatDate(search.checkOut, locale, undefined, ctx.hijri)}`;
  const queryBase = new URLSearchParams({
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    adults: String(search.adults),
    children: String(search.children),
    rooms: String(search.rooms),
  });

  // ---- Step 2: details + payment for the selected room type --------------------------------
  const selectedSlug = first(sp.type);
  const selected = selectedSlug ? results.find((r) => r.roomType.slug === selectedSlug) : undefined;

  if (selected && selected.bookable) {
    const promoInput = first(sp.promo)?.trim() || undefined;
    let quote: QuoteBreakdown | null = null;
    let promoError = false;
    try {
      quote = await quoteStay({ roomTypeId: selected.roomType.id, checkIn: search.checkIn, checkOut: search.checkOut, rooms: search.rooms, promotionCode: promoInput ?? null });
    } catch (e) {
      if (promoInput && e instanceof AppError && e.code === "INVALID_INPUT") {
        promoError = true;
        quote = await quoteStay({ roomTypeId: selected.roomType.id, checkIn: search.checkIn, checkOut: search.checkOut, rooms: search.rooms }).catch(() => null);
      }
    }
    if (!quote) {
      return (
        <>
          {header}
          {searchBar}
          <Container className="mt-8">
            <Alert tone="danger">{t.errors.generic}</Alert>
          </Container>
        </>
      );
    }
    const appliedPromo = quote.promotionCode ?? undefined;
    const name = pick(selected.roomType, "name", locale);
    const stayPath = `/booking?${queryBase.toString()}`;

    return (
      <>
        {header}
        <Container className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <Link href={localePath(locale, stayPath)} className="text-sm text-brand-700 hover:underline">
              ← {t.booking.chooseOther}
            </Link>

            <form action={localePath(locale, "/booking")} method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-4">
              {[...queryBase.entries()].map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="type" value={selected.roomType.slug} />
              <div className="min-w-48 flex-1">
                <label htmlFor="promo" className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500">
                  {t.common.promoCode}
                </label>
                <Input id="promo" name="promo" defaultValue={promoInput} autoComplete="off" />
              </div>
              <Button type="submit" variant="outline">
                {t.common.apply}
              </Button>
              {appliedPromo ? <p className="w-full text-sm font-medium text-ok-600">{t.booking.promoApplied}: {appliedPromo}</p> : null}
              {promoError ? <p role="alert" className="w-full text-sm font-medium text-danger-600">{t.booking.promoInvalid}</p> : null}
            </form>

            <div className="mt-8">
              <BookingForm
                locale={locale}
                t={t}
                hidden={{ roomTypeId: selected.roomType.id, ...search, promotionCode: appliedPromo }}
                payAtHotel={ctx.payAtHotelEnabled}
                online={ctx.onlinePayment}
                holdMinutes={booking?.holdMinutes ?? 30}
                policy={booking ? pick(booking, "cancellationPolicy", locale) : ""}
              />
            </div>
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <QuoteSummary quote={quote} roomName={name} adults={search.adults} childCount={search.children} locale={locale} t={t} hijri={ctx.hijri} />
          </aside>
        </Container>
      </>
    );
  }

  // ---- Step 1: choose a room ---------------------------------------------------------------
  const preferred = first(sp.room);
  const ordered = [...results].sort((a, b) => Number(b.roomType.slug === preferred) - Number(a.roomType.slug === preferred) || Number(b.bookable) - Number(a.bookable));

  const withQuotes = await Promise.all(
    ordered.map(async (r) => ({
      r,
      quote: r.bookable ? await quoteStay({ roomTypeId: r.roomType.id, checkIn: search.checkIn, checkOut: search.checkOut, rooms: search.rooms }).catch(() => null) : null,
    })),
  );
  const anyBookable = withQuotes.some((x) => x.quote);

  return (
    <>
      {header}
      {searchBar}
      <Container className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-brand-900">{fmt(t.booking.results, { range })}</h2>
        <p className="mt-1 text-sm text-ink-500">
          {plural(t.common.nights, nights || diffDays(search.checkIn, search.checkOut), locale)} · {plural(t.common.guestsCount, search.adults + search.children, locale)} · {t.booking.roomsCount}: {search.rooms}
        </p>
        {selectedSlug && selected && !selected.bookable ? <Alert tone="warn" className="mt-4">{t.rooms.noAvailability}</Alert> : null}
        {!anyBookable ? <Alert tone="warn" className="mt-6">{t.booking.nothing}</Alert> : null}
        <div className="mt-6 grid gap-6">
          {withQuotes.map(({ r, quote }) => (
            <RoomCard
              key={r.roomType.id}
              room={r.roomType}
              locale={locale}
              t={t}
              currency={ctx.currency}
              total={quote?.total ?? null}
              nights={quote?.nights}
              availability={r.bookable ? r.availableRooms : null}
              unavailableReason={
                quote ? null : !r.fitsGuests ? t.rooms.unavailableFits : r.restriction ? t.rooms.unavailableRestriction : t.common.soldOut
              }
              actionHref={quote ? localePath(locale, `/booking?${new URLSearchParams([...queryBase.entries(), ["type", r.roomType.slug]]).toString()}`) : undefined}
              actionLabel={t.rooms.selectRoom}
            />
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-500">{ctx.pricesIncludeTax ? t.rooms.includesTaxNote : t.rooms.excludesTaxNote}</p>
        <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "ghost" }), "mt-4")}>
          {t.rooms.backToRooms}
        </Link>
      </Container>
    </>
  );
}
