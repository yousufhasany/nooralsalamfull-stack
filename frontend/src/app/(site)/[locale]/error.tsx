"use client";

import { usePathname } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/dictionary";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const first = usePathname().split("/")[1];
  const locale: Locale = isLocale(first) ? first : "en";
  const t = getMessages(locale);
  // The error itself is never rendered: stack traces and internal messages must not reach visitors.
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold text-brand-900">{t.errors.errorTitle}</h1>
      <p className="mt-3 text-ink-500">{t.errors.generic}</p>
      <Button className="mt-6" onClick={reset}>
        {t.errors.tryAgain}
      </Button>
    </div>
  );
}
