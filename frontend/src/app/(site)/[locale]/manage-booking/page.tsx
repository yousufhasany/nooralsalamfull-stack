import type { Metadata } from "next";
import { pageBasics } from "@/server/site-page";
import { pageMetadata } from "@/lib/seo";
import { ManageBookingClient } from "@/components/site/manage-booking-client";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/manage-booking", title: t.manage.title, description: t.manage.intro, noindex: true });
}

export default async function ManageBookingPage({ params }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  return (
    <>
      <PageHero title={t.manage.title} />
      <Container className="mt-10 max-w-3xl">
        <ManageBookingClient locale={locale} t={t} hijri={ctx.hijri} today={ctx.today} />
      </Container>
    </>
  );
}
