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
      (fieldErrors[key] ??= []).push(friendly(issue));
    }
    const first = e.issues[0];
    const message = first ? friendly(first) : "Invalid input.";
    const count = Object.keys(fieldErrors).length;
    return { ok: false, code: "INVALID_INPUT", message: count > 1 ? `${message} (and ${count - 1} more)` : message, fieldErrors };
  }
  return actionFail(e);
}

/** Plain-language message naming the field, e.g. "Max children must be 20 or less." */
function friendly(issue: ZodError["issues"][number]): string {
  const key = issue.path[issue.path.length - 1];
  const name = key === undefined ? "This value" : humanize(String(key));
  if (!/^(Too (big|small)|Invalid|Expected)/.test(issue.message)) return issue.message;
  switch (issue.code) {
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `${name} must be at most ${max} characters.`;
      if (issue.origin === "array" || issue.origin === "set") return `${name} can have at most ${max} items.`;
      return issue.inclusive ? `${name} must be ${max} or less.` : `${name} must be less than ${max}.`;
    }
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? `${name} is required.` : `${name} must be at least ${min} characters.`;
      if (issue.origin === "array" || issue.origin === "set") return `Choose at least ${min} ${name.toLowerCase()}.`;
      return issue.inclusive ? `${name} must be ${min} or more.` : `${name} must be more than ${min}.`;
    }
    case "invalid_type":
      if (issue.input === undefined || issue.input === null || issue.input === "") return `${name} is required.`;
      return issue.expected === "number" || issue.expected === "int" ? `${name} must be a number.` : `${name} is not valid.`;
    case "invalid_format":
      return issue.format === "email" ? "Enter a valid email address." : `${name} is not in the right format.`;
    case "not_multiple_of":
      return `${name} must be a whole number.`;
    case "invalid_value":
      return `Choose a valid ${name.toLowerCase()}.`;
    default:
      return key === undefined ? issue.message : `${name}: ${issue.message}`;
  }
}

function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
