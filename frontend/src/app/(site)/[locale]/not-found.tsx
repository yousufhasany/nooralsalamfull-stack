import Link from "next/link";
import { LOCALES, LOCALE_META, localePath } from "@/i18n/config";
import { getMessages } from "@/i18n/dictionary";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/site/sections";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl font-semibold text-gold-600" aria-hidden>
        404
      </p>
      <div className="mt-6 space-y-6">
        {LOCALES.map((l) => {
          const t = getMessages(l);
          return (
            <section key={l} lang={LOCALE_META[l].htmlLang} dir={LOCALE_META[l].dir}>
              <h1 className="font-display text-2xl font-semibold text-brand-900">{t.errors.notFoundTitle}</h1>
              <p className="mt-1 text-ink-500">{t.errors.notFoundText}</p>
              <Link href={localePath(l, "/")} className={buttonVariants({ variant: "outline", className: "mt-3" })}>
                {t.errors.backHome}
              </Link>
            </section>
          );
        })}
      </div>
    </Container>
  );
}
