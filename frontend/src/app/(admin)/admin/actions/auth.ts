"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { authenticate } from "@/server/auth/auth.service";
import { adminHomePath } from "@/server/auth/permissions";
import { clientIp, createSession, destroySession, requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { actionFail, type ActionResult } from "@/lib/errors";
import { isLocale } from "@/i18n/config";
import { str } from "./form";

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authenticate(str(formData, "email"), str(formData, "password"), await clientIp());
    await createSession(user);
    redirect(adminHomePath(user.role));
  } catch (e) {
    unstable_rethrow(e);
    return actionFail(e);
  }
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

export async function setAdminLocaleAction(formData: FormData) {
  const user = await requireUser();
  const locale = str(formData, "locale");
  if (!isLocale(locale)) return;
  await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/admin", "layout");
}

export async function changeOwnPasswordAction(formData: FormData) {
  try {
    const user = await requireUser();
    const { changePassword, validatePasswordStrength } = await import("@/server/auth/auth.service");
    const password = str(formData, "password");
    const weak = validatePasswordStrength(password);
    if (weak) throw new (await import("@/lib/errors")).AppError("INVALID_INPUT", weak);
    await changePassword(user.id, password, user.id);
    await destroySession();
    redirect("/admin/login");
  } catch (e) {
    unstable_rethrow(e);
    return actionFail(e);
  }
}
