import type { Metadata } from "next";
import { localePath } from "@/i18n/config";
import { pageBasics, getRoomsWithFromPrice } from "@/server/site-page";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { BookingSearch } from "@/components/site/booking-search";
import { RoomCard } from "@/components/site/room-card";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/rooms", title: t.rooms.title, description: t.rooms.intro });
}

export default async function RoomsPage({ params }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const rooms = await getRoomsWithFromPrice(ctx.today);
  return (
    <>
      <PageHero title={t.rooms.title} intro={t.rooms.intro} image={SITE_PHOTOS.deluxe} />
      <Container className="relative z-10 -mt-8">
        <BookingSearch locale={locale} t={t} today={ctx.today} variant="inline" />
      </Container>
      <Container className="mt-12">
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand-300 bg-white p-10 text-center text-ink-500">{t.home.noRoomsYet}</p>
        ) : (
          <div className="grid gap-6">
            {rooms.map(({ room, fromPrice }) => (
              <RoomCard key={room.id} room={room} locale={locale} t={t} currency={ctx.currency} fromPrice={fromPrice} actionHref={localePath(locale, `/rooms/${room.slug}`)} />
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-500">{ctx.pricesIncludeTax ? t.rooms.includesTaxNote : t.rooms.excludesTaxNote}</p>
      </Container>
    </>
  );
}
