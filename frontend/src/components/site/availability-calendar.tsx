import { addDays, endOfMonthExclusive, formatDate, isoWeekday, startOfMonth, toDate, type DateStr } from "@/lib/dates";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";

/**
 * Month grid showing only "available / limited / sold out". Exact inventory counts are never
 * exposed to the public site.
 */
export function AvailabilityCalendar({
  nights,
  today,
  locale,
  t,
}: {
  nights: { date: DateStr; available: number }[];
  today: DateStr;
  locale: Locale;
  t: Messages;
}) {
  const byDate = new Map(nights.map((n) => [n.date, n.available]));
  const months: DateStr[] = [];
  const last = nights.at(-1)?.date ?? today;
  for (let m = startOfMonth(today); m <= last; m = endOfMonthExclusive(m)) months.push(m);

  const weekdayLabels = Array.from({ length: 7 }, (_, i) => formatDate(addDays("2024-01-01", i), locale, { weekday: "short" }));

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        {months.map((m) => {
          const end = endOfMonthExclusive(m);
          const offset = isoWeekday(m) - 1;
          const days: DateStr[] = [];
          for (let d = m; d < end; d = addDays(d, 1)) days.push(d);
          return (
            <section key={m} aria-label={formatDate(m, locale, { month: "long", year: "numeric" })} className="rounded-xl border border-sand-200 bg-white p-4">
              <h4 className="mb-3 text-center font-medium text-brand-900">{formatDate(m, locale, { month: "long", year: "numeric" })}</h4>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {weekdayLabels.map((w, i) => (
                  <span key={i} className="py-1 font-medium text-ink-400">
                    {w}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`o${i}`} />
                ))}
                {days.map((d) => {
                  const avail = byDate.get(d);
                  const inRange = avail !== undefined && d >= today;
                  const state = !inRange ? "none" : avail! <= 0 ? "sold" : avail! <= 2 ? "limited" : "ok";
                  const label =
                    state === "sold" ? t.rooms.legendSoldOut : state === "limited" ? t.rooms.legendLimited : state === "ok" ? t.rooms.legendAvailable : "";
                  return (
                    <span
                      key={d}
                      title={label ? `${formatDate(d, locale)} - ${label}` : undefined}
                      className={cn(
                        "grid aspect-square place-items-center rounded-md text-sm",
                        state === "ok" && "bg-brand-50 text-brand-900",
                        state === "limited" && "bg-warn-50 text-warn-600 ring-1 ring-warn-600/30",
                        state === "sold" && "bg-sand-200 text-ink-400 line-through",
                        state === "none" && "text-ink-200",
                      )}
                    >
                      {toDate(d).getUTCDate()}
                      {label ? <span className="sr-only"> {label}</span> : null}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-brand-50 ring-1 ring-brand-200" aria-hidden /> {t.rooms.legendAvailable}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-warn-50 ring-1 ring-warn-600/40" aria-hidden /> {t.rooms.legendLimited}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-sand-200" aria-hidden /> {t.rooms.legendSoldOut}
        </li>
      </ul>
      <p className="mt-2 text-xs text-ink-500">{t.rooms.calendarNote}</p>
    </div>
  );
}
