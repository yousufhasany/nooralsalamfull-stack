import { redirect } from "next/navigation";
import { adminHomePath } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { adminMessages } from "@/i18n/admin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const existing = await getCurrentUser();
  if (existing) redirect(adminHomePath(existing.role));
  const t = adminMessages("en");
  return (
    <div className="pattern-islamic flex min-h-screen items-center justify-center px-4 py-16">
      <div className="absolute inset-0 bg-brand-950/85" aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-lift">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">Noor Al Salam</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-brand-900">{t.signIn}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.signInIntro}</p>
        <p className="mt-1 text-sm text-ink-500" dir="rtl">
          فندق نور السلام — دخول الموظفين
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
