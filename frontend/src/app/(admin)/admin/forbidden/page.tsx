import Link from "next/link";
import { adminHomePath } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { adminMessages } from "@/i18n/admin";
import { buttonVariants } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const user = await requireUser();
  const t = adminMessages(user.locale);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="font-display text-3xl text-brand-900">403</h1>
      <p className="mt-2 max-w-md text-center text-ink-600">{t.forbidden}</p>
      <Link href={adminHomePath(user.role)} className={buttonVariants({ className: "mt-6" })}>
        {t.backHome}
      </Link>
    </div>
  );
}
