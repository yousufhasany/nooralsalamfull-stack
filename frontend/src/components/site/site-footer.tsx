import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { localePath, pick, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import type { SiteContext } from "@/server/site-context";

export function SiteFooter({ locale, t, ctx }: { locale: Locale; t: Messages; ctx: SiteContext }) {
  const h = ctx.hotel;
  const name = h ? pick(h, "name", locale) : t.meta.siteSuffix;
  const address = h ? pick(h, "address", locale) : "";
  return (
    <footer className="no-print mt-24 bg-brand-950 text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-display text-xl font-semibold text-white">{name}</p>
          {h && pick(h, "tagline", locale) ? <p className="mt-3 max-w-sm text-sm leading-relaxed">{pick(h, "tagline", locale)}</p> : null}
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-gold-400">{t.footer.explore}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              ["/rooms", t.nav.rooms],
              ["/facilities", t.nav.facilities],
              ["/gallery", t.nav.gallery],
              ["/about", t.nav.about],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={localePath(locale, href)} className="hover:text-white">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-gold-400">{t.footer.contact}</p>
          <ul className="mt-4 space-y-3 text-sm">
            {h?.phone ? (
              <li className="flex items-center gap-2">
                <Phone size={15} aria-hidden />
                <a href={`tel:${h.phone.replace(/[^+\d]/g, "")}`} dir="ltr" className="hover:text-white">
                  {h.phone}
                </a>
              </li>
            ) : null}
            {h?.email ? (
              <li className="flex items-center gap-2">
                <Mail size={15} aria-hidden />
                <a href={`mailto:${h.email}`} className="hover:text-white">
                  {h.email}
                </a>
              </li>
            ) : null}
            {address ? (
              <li className="flex items-start gap-2">
                <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
                <span>{address}</span>
              </li>
            ) : null}
            {!h?.phone && !h?.email && !address ? <li className="text-white/60">{t.contact.notPublished}</li> : null}
            <li>
              <Link href={localePath(locale, "/manage-booking")} className="text-gold-400 hover:text-gold-300">
                {t.nav.manageBooking}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {name}. {t.footer.rights}
          </p>
          <p>
            {h?.vatNumber ? `${t.footer.vat}: ${h.vatNumber}` : null}
            {h?.vatNumber && h?.commercialReg ? " · " : null}
            {h?.commercialReg ? `${t.footer.cr}: ${h.commercialReg}` : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
