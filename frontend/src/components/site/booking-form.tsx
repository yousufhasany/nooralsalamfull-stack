"use client";

import { useActionState } from "react";
import { createBookingAction, type FormState } from "@/app/(site)/[locale]/actions";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/dictionary";
import type { Messages } from "@/i18n/messages/en";
import { Alert, Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export interface BookingFormProps {
  locale: Locale;
  t: Messages;
  hidden: { roomTypeId: string; checkIn: string; checkOut: string; adults: number; children: number; rooms: number; promotionCode?: string };
  payAtHotel: boolean;
  online: boolean;
  holdMinutes: number;
  policy: string;
}

export function BookingForm({ locale, t, hidden, payAtHotel, online, holdMinutes, policy }: BookingFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(createBookingAction, { status: "idle" });
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  const err = (k: string) => fe[k]?.[0] ?? fe[`guest.${k}`]?.[0];
  const noPayment = !payAtHotel && !online;

  return (
    <form action={action} className="space-y-8" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(hidden).map(([k, value]) => (value === undefined || value === "" ? null : <input key={k} type="hidden" name={k} value={String(value)} />))}

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

      <fieldset className="space-y-4">
        <legend className="font-display text-xl font-semibold text-brand-900">{t.booking.guestDetails}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.firstName} htmlFor="b-first" required error={err("firstName")}>
            <Input id="b-first" name="firstName" defaultValue={v.firstName} required autoComplete="given-name" aria-invalid={!!err("firstName")} />
          </Field>
          <Field label={t.common.lastName} htmlFor="b-last" required error={err("lastName")}>
            <Input id="b-last" name="lastName" defaultValue={v.lastName} required autoComplete="family-name" aria-invalid={!!err("lastName")} />
          </Field>
          <Field label={t.common.email} htmlFor="b-email" required error={err("email")}>
            <Input id="b-email" name="email" defaultValue={v.email} type="email" required autoComplete="email" dir="ltr" aria-invalid={!!err("email")} />
          </Field>
          <Field label={t.common.phone} htmlFor="b-phone" required error={err("phone")}>
            <Input id="b-phone" name="phone" defaultValue={v.phone} type="tel" required autoComplete="tel" dir="ltr" aria-invalid={!!err("phone")} />
          </Field>
          <Field label={t.booking.nationality} htmlFor="b-nat" optionalText={t.common.optional}>
            <Input id="b-nat" name="nationality" defaultValue={v.nationality} autoComplete="country-name" />
          </Field>
        </div>
        <Field label={t.booking.specialRequests} htmlFor="b-req" optionalText={t.common.optional} hint={t.booking.specialRequestsHint}>
          <Textarea id="b-req" name="specialRequests" defaultValue={v.specialRequests} rows={3} maxLength={1000} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-display text-xl font-semibold text-brand-900">{t.booking.payment}</legend>
        {noPayment ? (
          <Alert tone="warn">{t.booking.noPaymentMethod}</Alert>
        ) : (
          <>
            {payAtHotel ? (
              <label className="flex cursor-pointer gap-3 rounded-xl border border-sand-300 bg-white p-4 has-[:checked]:border-brand-700 has-[:checked]:ring-1 has-[:checked]:ring-brand-700">
                <input type="radio" name="paymentMethod" value="PAY_AT_HOTEL" defaultChecked className="mt-1 accent-brand-800" />
                <span>
                  <span className="block font-medium text-ink-900">{t.booking.payAtHotel}</span>
                  <span className="block text-sm text-ink-500">{t.booking.payAtHotelHint}</span>
                </span>
              </label>
            ) : null}
            {online ? (
              <label className="flex cursor-pointer gap-3 rounded-xl border border-sand-300 bg-white p-4 has-[:checked]:border-brand-700 has-[:checked]:ring-1 has-[:checked]:ring-brand-700">
                <input type="radio" name="paymentMethod" value="ONLINE_PAYMENT" defaultChecked={!payAtHotel} className="mt-1 accent-brand-800" />
                <span>
                  <span className="block font-medium text-ink-900">{t.booking.payOnline}</span>
                  <span className="block text-sm text-ink-500">{fmt(t.booking.holdNote, { minutes: holdMinutes })}</span>
                </span>
              </label>
            ) : null}
          </>
        )}
      </fieldset>

      {policy ? (
        <div className="rounded-xl border border-sand-200 bg-sand-100 p-4 text-sm text-ink-700">
          <p className="font-medium text-ink-900">{t.about.cancellationPolicy}</p>
          <p className="mt-1 whitespace-pre-line">{policy}</p>
        </div>
      ) : null}

      <div>
        <label className="flex items-start gap-3 text-sm text-ink-800">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 accent-brand-800" aria-invalid={!!err("acceptTerms")} />
          <span>{t.booking.terms}</span>
        </label>
        {err("acceptTerms") ? (
          <p role="alert" className="mt-1 text-xs font-medium text-danger-600">
            {err("acceptTerms")}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending || noPayment}>
        {pending ? t.booking.submitting : t.booking.confirmBooking}
      </Button>
      <p className="text-xs text-ink-500">{t.booking.priceNote}</p>
    </form>
  );
}
