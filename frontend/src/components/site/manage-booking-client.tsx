"use client";

import { useState, useTransition } from "react";
import { cancelBookingAction, lookupBookingAction, requestChangeAction } from "@/app/(site)/[locale]/actions";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import type { PublicReservationView } from "@/server/services/public-booking.service";
import type { ActionResult } from "@/lib/errors";
import { Alert, Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ReservationDetails } from "./reservation-details";

type Session = { view: PublicReservationView; number: string; contact: string };

export function ManageBookingClient({ locale, t, hijri, today }: { locale: Locale; t: Messages; hijri: boolean; today: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [entered, setEntered] = useState({ number: "", contact: "", message: "", requestedCheckIn: "", requestedCheckOut: "" });
  const [pending, startTransition] = useTransition();

  function errorText(r: Extract<ActionResult<unknown>, { ok: false }>): string {
    const localized = (t.errors as Record<string, string>)[r.code];
    // Specific, customer-safe messages from the server (not found, cancellation window...) are shown as they are.
    return r.code === "RATE_LIMITED" || r.code === "INTERNAL" ? (localized ?? r.message) : r.message;
  }

  function lookup(fd: FormData) {
    const number = String(fd.get("number") ?? "");
    const contact = String(fd.get("contact") ?? "");
    setEntered((e) => ({ ...e, number, contact }));
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await lookupBookingAction(number, contact);
      if (r.ok) setSession({ view: r.data, number, contact });
      else setError(errorText(r));
    });
  }

  function cancel() {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelBookingAction(session.number, session.contact);
      if (r.ok) {
        setSession({ ...session, view: r.data });
        setNotice(t.manage.cancelled);
        setConfirmCancel(false);
      } else setError(errorText(r));
    });
  }

  function requestChange(fd: FormData) {
    if (!session) return;
    const change = {
      message: String(fd.get("message") ?? ""),
      requestedCheckIn: String(fd.get("requestedCheckIn") ?? ""),
      requestedCheckOut: String(fd.get("requestedCheckOut") ?? ""),
    };
    setEntered((e) => ({ ...e, ...change }));
    setError(null);
    startTransition(async () => {
      const r = await requestChangeAction(session.number, session.contact, change);
      if (r.ok) {
        setSession({ ...session, view: r.data });
        setNotice(t.manage.changeSent);
        setEntered((e) => ({ ...e, message: "", requestedCheckIn: "", requestedCheckOut: "" }));
      } else setError(errorText(r));
    });
  }

  if (!session) {
    return (
      <form action={lookup} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-soft">
        <p className="text-sm text-ink-700">{t.manage.intro}</p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label={t.manage.number} htmlFor="m-number" required>
          <Input id="m-number" name="number" defaultValue={entered.number} required autoComplete="off" dir="ltr" placeholder="NAS-2026-000001" />
        </Field>
        <Field label={t.manage.contact} htmlFor="m-contact" required>
          <Input id="m-contact" name="contact" defaultValue={entered.contact} required autoComplete="email" dir="ltr" />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t.common.loading : t.manage.find}
        </Button>
      </form>
    );
  }

  const { view } = session;
  return (
    <div className="space-y-6">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ReservationDetails view={view} locale={locale} t={t} hijri={hijri} />

      {view.source !== "DIRECT_WEBSITE" ? <Alert tone="info">{t.manage.otherSite}</Alert> : null}

      {view.canSelfCancel ? (
        <section className="rounded-2xl border border-sand-200 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-brand-900">{t.manage.cancelBooking}</h2>
          {confirmCancel ? (
            <div className="mt-3 space-y-3">
              <Alert tone="warn">{t.manage.cancelWarning}</Alert>
              <div className="flex gap-3">
                <Button variant="danger" onClick={cancel} disabled={pending}>
                  {t.manage.cancelConfirm}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={pending}>
                  {t.common.back}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="mt-3" onClick={() => setConfirmCancel(true)}>
              {t.manage.cancelBooking}
            </Button>
          )}
        </section>
      ) : view.selfCancelBlockedReason && view.source === "DIRECT_WEBSITE" && ["PENDING", "CONFIRMED"].includes(view.status) ? (
        <Alert tone="info">{view.selfCancelBlockedReason}</Alert>
      ) : null}

      {view.canRequestModification ? (
        <section className="rounded-2xl border border-sand-200 bg-white p-6">
          <h2 className="font-display text-lg font-semibold text-brand-900">{t.manage.requestChange}</h2>
          <p className="mt-1 text-sm text-ink-500">{t.manage.requestChangeHint}</p>
          {view.openModificationRequests > 0 ? <Alert tone="info" className="mt-3">{t.manage.changePending}</Alert> : null}
          <form action={requestChange} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t.manage.newDates} - ${t.common.checkIn}`} htmlFor="m-in">
                <Input id="m-in" name="requestedCheckIn" type="date" min={today} defaultValue={entered.requestedCheckIn} />
              </Field>
              <Field label={`${t.manage.newDates} - ${t.common.checkOut}`} htmlFor="m-out">
                <Input id="m-out" name="requestedCheckOut" type="date" min={today} defaultValue={entered.requestedCheckOut} />
              </Field>
            </div>
            <Field label={t.common.message} htmlFor="m-msg" required>
              <Textarea id="m-msg" name="message" required rows={4} maxLength={1000} defaultValue={entered.message} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? t.common.loading : t.common.submit}
            </Button>
          </form>
        </section>
      ) : null}

      <Button variant="ghost" onClick={() => { setSession(null); setNotice(null); setError(null); setConfirmCancel(false); }}>
        {t.manage.back}
      </Button>
    </div>
  );
}
