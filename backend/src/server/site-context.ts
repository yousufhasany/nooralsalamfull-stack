import { cache } from "react";
import { db } from "@/server/db/client";
import { getAllSettings } from "@/server/services/settings.service";
import { todayIn } from "@/lib/dates";
import { onlinePaymentsAvailable } from "@/integrations/payments/registry";

/**
 * Hotel profile + public settings for one request. The site renders sensibly (with neutral
 * placeholders, never invented facts) even before the hotel has been configured.
 */
export const getSiteContext = cache(async () => {
  const hotel = await db.hotel.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null);
  const settings = hotel ? await getAllSettings(hotel.id).catch(() => null) : null;
  const timezone = hotel?.timezone ?? "Asia/Riyadh";
  return {
    hotel,
    settings,
    currency: hotel?.currency ?? "SAR",
    timezone,
    today: todayIn(timezone),
    pricesIncludeTax: settings?.tax.pricesIncludeTax ?? false,
    hijri: settings?.display.showHijriDates ?? false,
    payAtHotelEnabled: settings?.booking.payAtHotelEnabled ?? true,
    onlinePayment: onlinePaymentsAvailable(),
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  };
});

export type SiteContext = Awaited<ReturnType<typeof getSiteContext>>;
