"use client";

import { setAdminLocaleAction } from "@/app/(admin)/admin/actions/auth";

export function LocaleSwitch({ locale, label }: { locale: string; label: string }) {
  return (
    <form action={setAdminLocaleAction}>
      <label className="sr-only" htmlFor="admin-locale">
        {label}
      </label>
      <select
        id="admin-locale"
        name="locale"
        key={locale}
        defaultValue={locale}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 rounded-lg border border-sand-300 bg-white px-2 text-sm"
      >
        <option value="en">EN</option>
        <option value="ar">العربية</option>
        <option value="bn">বাংলা</option>
      </select>
    </form>
  );
}
