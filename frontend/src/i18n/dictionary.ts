import en, { type Messages } from "./messages/en";
import ar from "./messages/ar";
import bn from "./messages/bn";
import type { Locale } from "./config";

const dictionaries: Record<Locale, Messages> = { en, ar, bn };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/** Replace {name} placeholders. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Pick the singular / plural form for a counted message. */
export function plural(forms: { one: string; other: string }, n: number, locale: Locale): string {
  const rule = new Intl.PluralRules(locale).select(n);
  return fmt(rule === "one" ? forms.one : forms.other, { n });
}
