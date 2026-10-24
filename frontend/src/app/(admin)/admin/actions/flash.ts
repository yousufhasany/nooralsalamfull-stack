import { cookies } from "next/headers";

export const FLASH_COOKIE = "admin_flash";

/** Queue a notification for the next admin page; used before `redirect()` from a server action. */
export async function flash(message: string, tone: "success" | "danger" = "success") {
  const store = await cookies();
  store.set(FLASH_COOKIE, JSON.stringify({ message, tone }), { path: "/admin", maxAge: 60, sameSite: "lax" });
}
