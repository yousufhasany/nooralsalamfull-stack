import type { Metadata } from "next";
import { pick } from "@/i18n/config";
import { fmt } from "@/i18n/dictionary";
import { pageBasics } from "@/server/site-page";
import { firstGalleryPhoto, getPublicGallery } from "@/server/services/content.service";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { HotelImage } from "@/components/site/media";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t, ctx } = await pageBasics(params);
  return pageMetadata({ locale, path: "/about", title: t.about.title, description: (ctx.hotel && pick(ctx.hotel, "description", locale).slice(0, 160)) || t.meta.defaultDescription });
}

export default async function AboutPage({ params }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const h = ctx.hotel;
  const description = h ? pick(h, "description", locale) : "";
  const address = h ? pick(h, "address", locale) : "";
  const policy = ctx.settings ? pick(ctx.settings.booking, "cancellationPolicy", locale) : "";
  const gallery = await getPublicGallery().catch(() => []);
  const lobby = firstGalleryPhoto(gallery, "LOBBY")?.url || SITE_PHOTOS.lobby;
  const exterior = firstGalleryPhoto(gallery, "EXTERIOR")?.url || SITE_PHOTOS.exterior;

  return (
    <>
      <PageHero title={t.about.title} intro={h ? pick(h, "tagline", locale) : undefined} image={lobby} />
      <Container className="mt-12 grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div>
          {description ? (
            <div className="space-y-4 text-lg leading-relaxed text-ink-700">
              {description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-sand-300 bg-white p-10 text-center text-ink-500">{t.about.empty}</p>
          )}
          <h2 className="mt-12 font-display text-2xl font-semibold text-brand-900">{t.about.policies}</h2>
          <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6">
            <h3 className="font-medium text-brand-900">{t.about.cancellationPolicy}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{policy || t.about.noPolicy}</p>
          </div>
        </div>
        <aside className="h-fit space-y-6">
          <HotelImage src={exterior} alt={t.gallery.categories.EXTERIOR} className="aspect-[4/5] rounded-2xl" sizes="(min-width: 1024px) 30vw, 100vw" />
          <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-soft">
          <h2 className="font-display text-xl font-semibold text-brand-900">{t.about.contactTitle}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            {address ? (
              <div>
                <dt className="font-medium text-ink-500">{t.about.address}</dt>
                <dd className="mt-0.5 text-ink-900">{[address, h?.city].filter(Boolean).join(", ")}</dd>
              </div>
            ) : null}
            {h ? (
              <>
                <div>
                  <dt className="font-medium text-ink-500">{t.common.checkIn}</dt>
                  <dd className="mt-0.5 text-ink-900">{fmt(t.about.checkInFrom, { time: h.checkInTime })}</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink-500">{t.common.checkOut}</dt>
                  <dd className="mt-0.5 text-ink-900">{fmt(t.about.checkOutUntil, { time: h.checkOutTime })}</dd>
                </div>
              </>
            ) : null}
            {h?.phone ? (
              <div>
                <dt className="font-medium text-ink-500">{t.common.phone}</dt>
                <dd className="mt-0.5 text-ink-900" dir="ltr">
                  {h.phone}
                </dd>
              </div>
            ) : null}
          </dl>
          </div>
        </aside>
      </Container>
    </>
  );
}
