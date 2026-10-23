import { fmt, plural } from "@/i18n/dictionary";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import type { QuoteBreakdown } from "@/server/services/pricing.service";

export function QuoteSummary({
  quote,
  roomName,
  adults,
  childCount,
  locale,
  t,
  hijri,
}: {
  quote: QuoteBreakdown;
  roomName: string;
  adults: number;
  childCount: number;
  locale: Locale;
  t: Messages;
  hijri: boolean;
}) {
  const m = (v: string) => formatMoney(v, quote.currency, locale);
  const showDiscount = Number(quote.discount) > 0;
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-brand-900">{t.booking.summary}</h2>
      <p className="mt-3 font-medium text-ink-900">
        {quote.rooms} × {roomName}
      </p>
      <dl className="mt-3 space-y-1.5 text-sm text-ink-700">
        <div className="flex justify-between gap-4">
          <dt>{t.common.checkIn}</dt>
          <dd>{formatDate(quote.checkIn, locale, undefined, hijri)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t.common.checkOut}</dt>
          <dd>{formatDate(quote.checkOut, locale, undefined, hijri)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t.booking.nightsSummary}</dt>
          <dd>{plural(t.common.nights, quote.nights, locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t.booking.guestsSummary}</dt>
          <dd>
            {plural(t.common.guestsCount, adults + childCount, locale)}
          </dd>
        </div>
      </dl>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-brand-700">{t.booking.nightlyBreakdown}</summary>
        <ul className="mt-2 space-y-1 text-ink-700">
          {quote.nightly.map((n) => (
            <li key={n.date} className="flex justify-between gap-4">
              <span>{formatDate(n.date, locale, { day: "numeric", month: "short", weekday: "short" }, hijri)}</span>
              <span className="tabular-nums">{m(n.price)}</span>
            </li>
          ))}
        </ul>
      </details>

      <dl className="mt-4 space-y-1.5 border-t border-sand-200 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt>{t.common.subtotal}</dt>
          <dd className="tabular-nums">{m(quote.displaySubtotal)}</dd>
        </div>
        {showDiscount ? (
          <div className="flex justify-between gap-4 text-ok-600">
            <dt>
              {t.common.discount}
              {quote.promotionCode ? ` (${quote.promotionCode})` : ""}
            </dt>
            <dd className="tabular-nums">-{m(quote.discount)}</dd>
          </div>
        ) : null}
        {quote.taxes.map((tx) => (
          <div key={tx.code} className="flex justify-between gap-4 text-ink-700">
            <dt>
              {fmt(t.booking.taxLine, { name: tx.name, rate: tx.rate })}
              {quote.pricesIncludeTax ? ` - ${t.booking.includedTax}` : ""}
            </dt>
            <dd className="tabular-nums">{m(tx.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-sand-200 pt-3 text-base font-semibold text-brand-900">
          <dt>{t.common.grandTotal}</dt>
          <dd className="tabular-nums">{m(quote.total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-500">{fmt(t.common.currencyNote, { currency: quote.currency })}</p>
    </div>
  );
}
