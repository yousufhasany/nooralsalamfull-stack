import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/dictionary";
import { priceForNight } from "@/server/services/pricing.service";
import { getPublicRoomTypes } from "@/server/services/content.service";
import { addDays } from "@/lib/dates";
import { getSiteContext } from "./site-context";

export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

export async function pageBasics(params: Promise<{ locale: string }>) {
  const locale = await resolveLocale(params);
  const t = getMessages(locale);
  const ctx = await getSiteContext();
  return { locale, t, ctx };
}

/** Published room types with a display "from" price. A price that cannot be computed is left null, never guessed. */
export async function getRoomsWithFromPrice(today: string) {
  const rooms = await getPublicRoomTypes().catch(() => []);
  return Promise.all(
    rooms.map(async (room) => {
      const fromPrice = await priceForNight(room.id, addDays(today, 1)).catch(() => null);
      return { room, fromPrice };
    }),
  );
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
