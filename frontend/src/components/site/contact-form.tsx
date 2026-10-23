"use client";

import { useActionState } from "react";
import { sendContactMessage, type FormState } from "@/app/(site)/[locale]/actions";
import type { Messages } from "@/i18n/messages/en";
import { Alert, Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function ContactForm({ t }: { t: Messages }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendContactMessage, { status: "idle" });
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const v = state.status === "error" ? (state.values ?? {}) : {};

  if (state.status === "ok") return <Alert tone="success">{t.contact.sent}</Alert>;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.name} htmlFor="c-name" required error={fe.name?.[0]}>
          <Input id="c-name" name="name" defaultValue={v.name} required autoComplete="name" aria-invalid={!!fe.name} />
        </Field>
        <Field label={t.common.email} htmlFor="c-email" required error={fe.email?.[0]}>
          <Input id="c-email" name="email" defaultValue={v.email} type="email" required autoComplete="email" dir="ltr" aria-invalid={!!fe.email} />
        </Field>
        <Field label={t.common.phone} htmlFor="c-phone" optionalText={t.common.optional}>
          <Input id="c-phone" name="phone" defaultValue={v.phone} type="tel" autoComplete="tel" dir="ltr" />
        </Field>
        <Field label={t.common.subject} htmlFor="c-subject" optionalText={t.common.optional}>
          <Input id="c-subject" name="subject" defaultValue={v.subject} />
        </Field>
      </div>
      <Field label={t.common.message} htmlFor="c-message" required error={fe.message?.[0]}>
        <Textarea id="c-message" name="message" defaultValue={v.message} required rows={6} aria-invalid={!!fe.message} />
      </Field>
      {/* Honeypot: hidden from people and assistive technology, bots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-website">{t.contact.honeypot}</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.common.loading : t.contact.send}
      </Button>
    </form>
  );
}
