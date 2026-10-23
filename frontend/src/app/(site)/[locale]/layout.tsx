import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Arabic, Noto_Sans_Bengali, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import "@/app/globals.css";
import { LOCALES, LOCALE_META, isLocale, pick } from "@/i18n/config";
import { getMessages } from "@/i18n/dictionary";
import { getSiteContext } from "@/server/site-context";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { cn } from "@/lib/utils";
import { siteUrl } from "@/lib/seo";

const display = Playfair_Display({ subsets: ["latin"], variable: "--nf-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--nf-body", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--nf-arabic", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--nf-bengali", display: "swap" });

// The site reads hotel content and live availability from the database on every request.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#0a2a21", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getMessages(locale);
  const { hotel } = await getSiteContext();
  const name = hotel ? pick(hotel, "name", locale) : t.meta.siteSuffix;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: name, template: `%s | ${name}` },
    description: (hotel && pick(hotel, "tagline", locale)) || t.meta.defaultDescription,
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);
  const ctx = await getSiteContext();
  const name = ctx.hotel ? pick(ctx.hotel, "name", locale) : t.meta.siteSuffix;
  const meta = LOCALE_META[locale];

  return (
    <html lang={meta.htmlLang} dir={meta.dir} className={cn(display.variable, body.variable, arabic.variable, bengali.variable)}>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">
          {t.common.skipToContent}
        </a>
        <SiteHeader locale={locale} t={t} hotelName={name} />
        <main id="main">{children}</main>
        <SiteFooter locale={locale} t={t} ctx={ctx} />
        {ctx.hotel?.whatsapp ? <WhatsAppButton number={ctx.hotel.whatsapp} label={t.common.whatsapp} /> : null}
      </body>
    </html>
  );
}
