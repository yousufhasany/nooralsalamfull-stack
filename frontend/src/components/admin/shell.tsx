import { logoutAction } from "@/app/(admin)/admin/actions/auth";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { LocaleSwitch } from "@/components/admin/locale-switch";
import { Toaster } from "@/components/admin/toaster";
import { adminMessages } from "@/i18n/admin";
import type { SessionUser } from "@/server/auth/session";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { Button } from "@/components/ui/button";

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div dir={dir} lang={locale} className="min-h-screen lg:flex">
      <a href="#admin-main" className="skip-link">
        {t.skip}
      </a>
      <aside className="bg-brand-950 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:overflow-y-auto">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="font-display text-lg font-semibold tracking-wide">{t.brand}</p>
          <p className="text-xs text-gold-400">{t.brandAr}</p>
          <p className="mt-1 text-[11px] uppercase tracking-widest text-white/50">{t.pms}</p>
        </div>
        <SidebarNav t={t} permissions={user.permissions} />
        <div className="hidden border-t border-white/10 p-4 text-xs text-white/70 lg:block">
          <p className="font-medium text-white">{user.name}</p>
          <p>{ROLE_LABELS[user.role][locale]}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sand-200 bg-sand-50/90 px-4 py-3 backdrop-blur sm:px-6">
          <p className="text-sm text-ink-500 lg:hidden">
            {user.name} · {ROLE_LABELS[user.role][locale]}
          </p>
          <div className="ms-auto flex items-center gap-2">
            <LocaleSwitch locale={locale} label={t.language} />
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                {t.signOut}
              </Button>
            </form>
          </div>
        </header>
        <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <Toaster labels={{ success: t.toastSuccess, error: t.toastError, saved: t.toastSaved, actionDone: t.toastActionDone, close: t.close }} />
    </div>
  );
}
