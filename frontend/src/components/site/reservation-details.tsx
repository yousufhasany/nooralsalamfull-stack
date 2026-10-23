import { pick, type Locale } from "@/i18n/config";
import { plural } from "@/i18n/dictionary";
import type { Messages } from "@/i18n/messages/en";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge, paymentTone, reservationTone } from "@/components/ui/badge";
import type { PublicReservationView } from "@/server/services/public-booking.service";

export function ReservationDetails({ view, locale, t, hijri }: { view: PublicReservationView; locale: Locale; t: Messages; hijri: boolean }) {
  const m = (v: string) => formatMoney(v, view.currency, locale);
  const statusLabel = (t.status.reservation as Record<string, string>)[view.status] ?? view.status;
  const payLabel = (t.status.payment as Record<string, string>)[view.paymentStatus] ?? view.paymentStatus;
  const row = "flex justify-between gap-4 py-2 text-sm";
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-6 shadow-soft print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">{t.confirmation.numberLabel}</p>
          <p className="font-display text-2xl font-semibold text-brand-900" dir="ltr">
            {view.number}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={reservationTone[view.status] ?? "neutral"}>{statusLabel}</Badge>
          <Badge tone={paymentTone[view.paymentStatus] ?? "neutral"}>{payLabel}</Badge>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-sand-200">
        <div className={row}>
          <dt className="text-ink-500">{t.manage.guest}</dt>
          <dd className="font-medium">{view.guestName}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-500">{t.common.checkIn}</dt>
          <dd>{formatDate(view.checkIn, locale, { dateStyle: "full" }, hijri)}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-500">{t.common.checkOut}</dt>
          <dd>{formatDate(view.checkOut, locale, { dateStyle: "full" }, hijri)}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-500">{t.booking.nightsSummary}</dt>
          <dd>{plural(t.common.nights, view.nights, locale)}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-500">{t.booking.rooms}</dt>
          <dd className="text-end">
            {view.rooms.map((r, i) => (
              <span key={i} className="block">
                {pick(r, "name", locale)} · {plural(t.common.guestsCount, r.adults + r.children, locale)}
              </span>
            ))}
          </dd>
        </div>
        {view.specialRequests ? (
          <div className={row}>
            <dt className="text-ink-500">{t.booking.specialRequests}</dt>
            <dd className="max-w-xs text-end">{view.specialRequests}</dd>
          </div>
        ) : null}
        <div className={row}>
          <dt className="text-ink-500">{t.common.subtotal}</dt>
          <dd className="tabular-nums">{m(view.roomsSubtotal)}</dd>
        </div>
        {Number(view.discountTotal) > 0 ? (
          <div className={row}>
            <dt className="text-ink-500">{t.common.discount}</dt>
            <dd className="tabular-nums">-{m(view.discountTotal)}</dd>
          </div>
        ) : null}
        <div className={row}>
          <dt className="text-ink-500">{t.common.tax}</dt>
          <dd className="tabular-nums">{m(view.taxTotal)}</dd>
        </div>
        <div className={`${row} text-base font-semibold text-brand-900`}>
          <dt>{t.common.total}</dt>
          <dd className="tabular-nums">{m(view.totalAmount)}</dd>
        </div>
      </dl>
    </div>
  );
}
