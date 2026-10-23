"use client";

import { useId, useState } from "react";
import { Calendar, Users } from "lucide-react";
import { localePath, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SearchValues {
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  rooms?: number;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Plain GET form: works without JavaScript and is validated again on the server. */
export function BookingSearch({
  locale,
  t,
  today,
  defaults,
  target = "/booking",
  roomType,
  className,
  variant = "hero",
}: {
  locale: Locale;
  t: Messages;
  today: string;
  defaults?: SearchValues;
  target?: string;
  roomType?: string;
  className?: string;
  variant?: "hero" | "inline" | "stacked";
}) {
  const uid = useId();
  const [checkIn, setCheckIn] = useState(defaults?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(defaults?.checkOut ?? "");
  const [error, setError] = useState<string | null>(null);

  const stacked = variant === "stacked";
  const wide = stacked ? "col-span-2" : "";
  const minOut = checkIn ? addDays(checkIn, 1) : addDays(today, 1);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!checkIn || !checkOut) return;
    if (checkIn < today) {
      e.preventDefault();
      setError(t.search.pastDate);
    } else if (checkOut <= checkIn) {
      e.preventDefault();
      setError(t.search.invalidDates);
    }
  }

  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500";
  const input =
    "h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

  return (
    <form
      action={localePath(locale, target)}
      method="get"
      onSubmit={onSubmit}
      aria-label={t.search.title}
      className={cn(
        "grid gap-3",
        stacked ? "grid-cols-2" : "rounded-2xl bg-white p-4 shadow-lift sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_0.7fr_0.7fr_0.7fr_auto] lg:items-end",
        variant === "inline" && "border border-sand-200 shadow-soft",
        className,
      )}
    >
      {roomType ? <input type="hidden" name="room" value={roomType} /> : null}
      <div className={wide}>
        <label htmlFor={`${uid}-in`} className={label}>
          <Calendar size={12} className="me-1 inline" aria-hidden />
          {t.common.checkIn}
        </label>
        <input
          id={`${uid}-in`}
          name="checkIn"
          type="date"
          required
          min={today}
          value={checkIn}
          onChange={(e) => {
            setCheckIn(e.target.value);
            setError(null);
            if (checkOut && e.target.value >= checkOut) setCheckOut("");
          }}
          className={input}
        />
      </div>
      <div className={wide}>
        <label htmlFor={`${uid}-out`} className={label}>
          <Calendar size={12} className="me-1 inline" aria-hidden />
          {t.common.checkOut}
        </label>
        <input
          id={`${uid}-out`}
          name="checkOut"
          type="date"
          required
          min={minOut}
          value={checkOut}
          onChange={(e) => {
            setCheckOut(e.target.value);
            setError(null);
          }}
          className={input}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-adults`} className={label}>
          <Users size={12} className="me-1 inline" aria-hidden />
          {t.common.adults}
        </label>
        <select id={`${uid}-adults`} name="adults" defaultValue={defaults?.adults ?? 2} className={input}>
          {range(1, 10).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-children`} className={label}>
          {t.common.children}
        </label>
        <select id={`${uid}-children`} name="children" defaultValue={defaults?.children ?? 0} className={input}>
          {range(0, 6).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className={wide}>
        <label htmlFor={`${uid}-rooms`} className={label}>
          {t.common.rooms}
        </label>
        <select id={`${uid}-rooms`} name="rooms" defaultValue={defaults?.rooms ?? 1} className={input}>
          {range(1, 5).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="lg" variant="primary" className={stacked ? "col-span-2" : "sm:col-span-2 lg:col-span-1"}>
        {t.search.button}
      </Button>
      {error ? (
        <p role="alert" className={cn("text-sm font-medium text-danger-600", stacked ? "col-span-2" : "sm:col-span-2 lg:col-span-6")}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
