import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { actionFail, type ActionResult } from "@/lib/errors";
import type { Permission } from "./permissions";
import { requireActionPermission, type SessionUser } from "./session";

/** Wrap a server action: authorise, run, and convert errors to customer-safe results. */
export async function adminAction<T>(permission: Permission, fn: (user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireActionPermission(permission);
    return { ok: true, data: await fn(user) };
  } catch (e) {
    unstable_rethrow(e);
    return toResult(e);
  }
}

/** Wrap a public server action (no login required). */
export async function publicAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return toResult(e);
  }
}

function toResult(e: unknown): ActionResult<never> {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: "INVALID_INPUT", message: e.issues[0]?.message ?? "Invalid input.", fieldErrors };
  }
  return actionFail(e);
}
