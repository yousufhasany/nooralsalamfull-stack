import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Printer } from "lucide-react";
import { localePath } from "@/i18n/config";
import { pageBasics, first } from "@/server/site-page";
import { getConfirmedReservationView } from "@/server/services/public-booking.service";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { ReservationDetails } from "@/components/site/reservation-details";
import { PrintButton } from "@/components/site/print-button";
import { Container, PageHero } from "@/components/site/sections";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, t } = await pageBasics(params);
  return pageMetadata({ locale, path: "/booking/confirmation", title: t.confirmation.title, description: t.confirmation.keepNumber, noindex: true });
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { locale, t, ctx } = await pageBasics(params);
  const sp = await searchParams;
  const view = await getConfirmedReservationView(first(sp.n) ?? "", first(sp.t) ?? "").catch(() => null);

  if (!view) {
    return (
      <>
        <PageHero title={t.confirmation.title} />
        <Container className="mt-10 max-w-2xl">
          <Alert tone="warn">{t.confirmation.invalidLink}</Alert>
          <Link href={localePath(locale, "/manage-booking")} className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
            {t.nav.manageBooking}
          </Link>
        </Container>
      </>
    );
  }

  const confirmed = view.status === "CONFIRMED";
  const payAtHotel = view.paymentCollection === "PAY_AT_HOTEL";
  return (
    <>
      <PageHero title={t.confirmation.title} />
      <Container className="mt-10 max-w-3xl">
        <Alert tone={confirmed ? "success" : "info"}>
          <p className="flex items-center gap-2 font-medium">
            <CircleCheck size={18} aria-hidden />
            {confirmed ? t.confirmation.statusConfirmed : t.confirmation.statusPending}
          </p>
          {payAtHotel ? <p className="mt-1">{t.confirmation.payAtHotelNote}</p> : null}
        </Alert>
        <p className="mt-4 text-sm text-ink-700">{t.confirmation.keepNumber}</p>

        <div className="mt-6">
          <ReservationDetails view={view} locale={locale} t={t} hijri={ctx.hijri} />
        </div>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-brand-900">{t.confirmation.next}</h2>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-ink-700">
            {t.confirmation.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <div className="no-print mt-8 flex flex-wrap gap-3">
          <PrintButton label={t.common.print} icon={<Printer size={16} aria-hidden />} />
          <Link href={localePath(locale, "/manage-booking")} className={cn(buttonVariants({ variant: "outline" }))}>
            {t.confirmation.manage}
          </Link>
        </div>
      </Container>
    </>
  );
}
