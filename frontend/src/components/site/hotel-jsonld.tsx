import { localePath, pick, type Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/seo";
import type { SiteContext } from "@/server/site-context";
import { JsonLd } from "./json-ld";

/** Structured data built only from fields the hotel has entered: no ratings, stars or invented facts. */
export function HotelJsonLd({ ctx, locale }: { ctx: SiteContext; locale: Locale }) {
  const h = ctx.hotel;
  if (!h) return null;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: pick(h, "name", locale),
    url: `${siteUrl()}${localePath(locale, "/")}`,
  };
  const description = pick(h, "description", locale);
  if (description) data.description = description;
  if (h.phone) data.telephone = h.phone;
  if (h.email) data.email = h.email;
  if (h.heroImageUrl) data.image = h.heroImageUrl;
  if (h.checkInTime) data.checkinTime = h.checkInTime;
  if (h.checkOutTime) data.checkoutTime = h.checkOutTime;
  const street = pick(h, "address", locale);
  if (street || h.city) {
    data.address = {
      "@type": "PostalAddress",
      ...(street ? { streetAddress: street } : {}),
      ...(h.city ? { addressLocality: h.city } : {}),
      ...(h.country ? { addressCountry: h.country } : {}),
    };
  }
  if (h.latitude != null && h.longitude != null) {
    data.geo = { "@type": "GeoCoordinates", latitude: Number(h.latitude), longitude: Number(h.longitude) };
  }
  return <JsonLd data={data} />;
}
