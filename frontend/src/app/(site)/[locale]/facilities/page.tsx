import type { Metadata } from "next";
import { pick } from "@/i18n/config";
import { pageBasics } from "@/server/site-page";
import { getPublicFacilities } from "@/server/services/content.service";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { pageMetadata } from "@/lib/seo";
import { FacilityIcon } from "@/components/site/facility-icon";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/facilities", title: t.facilities.title, description: t.facilities.intro });
}

export default async function FacilitiesPage({ params }: Props) {
  const { locale, t } = await pageBasics(params);
  const facilities = await getPublicFacilities().catch(() => []);
  return (
    <>
      <PageHero title={t.facilities.title} intro={t.facilities.intro} image={SITE_PHOTOS.courtyard} />
      <Container className="mt-12">
        {facilities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand-300 bg-white p-10 text-center text-ink-500">{t.facilities.empty}</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((f) => (
              <li key={f.id} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-soft">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-900 text-gold-400">
                  <FacilityIcon name={f.icon} size={24} />
                </span>
                <h2 className="mt-4 font-display text-xl font-semibold text-brand-900">{pick(f, "name", locale)}</h2>
                {pick(f, "description", locale) ? <p className="mt-2 text-sm leading-relaxed text-ink-700">{pick(f, "description", locale)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
