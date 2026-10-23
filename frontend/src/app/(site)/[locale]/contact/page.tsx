import type { Metadata } from "next";
import { Mail, MapPin, Phone, Clock, MessageCircle } from "lucide-react";
import { pick } from "@/i18n/config";
import { pageBasics } from "@/server/site-page";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "@/components/site/contact-form";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/contact", title: t.contact.title, description: t.contact.intro });
}

/** Only Google Maps embeds configured by the hotel are rendered. */
function safeMapUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "www.google.com" || u.hostname === "maps.google.com") && u.pathname.startsWith("/maps") ? u.toString() : null;
  } catch {
    return null;
  }
}

export default async function ContactPage({ params }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const h = ctx.hotel;
  const address = h ? [pick(h, "address", locale), h.city].filter(Boolean).join(", ") : "";
  const hours = h ? pick(h, "contactHours", locale) : "";
  const map = h?.mapEmbedUrl ? safeMapUrl(h.mapEmbedUrl) : null;
  const hasDetails = !!(h?.phone || h?.email || address || hours || h?.whatsapp);

  return (
    <>
      <PageHero title={t.contact.title} intro={t.contact.intro} image={SITE_PHOTOS.exterior} />
      <Container className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="contact-form">
          <h2 id="contact-form" className="font-display text-2xl font-semibold text-brand-900">
            {t.contact.formTitle}
          </h2>
          <div className="mt-5 rounded-2xl border border-sand-200 bg-white p-6 shadow-soft">
            <ContactForm t={t} />
          </div>
        </section>
        <aside aria-labelledby="contact-details">
          <h2 id="contact-details" className="font-display text-2xl font-semibold text-brand-900">
            {t.contact.detailsTitle}
          </h2>
          <ul className="mt-5 space-y-4 rounded-2xl border border-sand-200 bg-white p-6 text-sm shadow-soft">
            {h?.phone ? (
              <li className="flex items-start gap-3">
                <Phone size={18} className="mt-0.5 text-brand-700" aria-hidden />
                <a href={`tel:${h.phone.replace(/[^+\d]/g, "")}`} dir="ltr" className="hover:underline">
                  {h.phone}
                </a>
              </li>
            ) : null}
            {h?.whatsapp ? (
              <li className="flex items-start gap-3">
                <MessageCircle size={18} className="mt-0.5 text-brand-700" aria-hidden />
                <a href={`https://wa.me/${h.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {t.common.whatsapp}
                </a>
              </li>
            ) : null}
            {h?.email ? (
              <li className="flex items-start gap-3">
                <Mail size={18} className="mt-0.5 text-brand-700" aria-hidden />
                <a href={`mailto:${h.email}`} className="break-all hover:underline">
                  {h.email}
                </a>
              </li>
            ) : null}
            {address ? (
              <li className="flex items-start gap-3">
                <MapPin size={18} className="mt-0.5 text-brand-700" aria-hidden />
                <span>{address}</span>
              </li>
            ) : null}
            {hours ? (
              <li className="flex items-start gap-3">
                <Clock size={18} className="mt-0.5 text-brand-700" aria-hidden />
                <span>
                  <span className="block font-medium">{t.contact.hours}</span>
                  {hours}
                </span>
              </li>
            ) : null}
            {!hasDetails ? <li className="text-ink-500">{t.contact.notPublished}</li> : null}
          </ul>
          <div className="mt-6 overflow-hidden rounded-2xl border border-sand-200 bg-white">
            {map ? (
              <iframe title={t.contact.map} src={map} className="h-72 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            ) : (
              <p className="p-6 text-center text-sm text-ink-500">{t.contact.mapEmpty}</p>
            )}
          </div>
        </aside>
      </Container>
    </>
  );
}
