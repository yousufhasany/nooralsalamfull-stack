"use client";

import { useTransition, type FormEvent, type ReactNode } from "react";
import { requestFormReset } from "react-dom";
import { ActionPendingContext } from "@/components/admin/action-pending";
import { notify } from "@/components/admin/toaster";
import type { ActionResult } from "@/lib/errors";

type Failure = Extract<ActionResult<unknown>, { ok: false }>;
type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isControl(el: Element | RadioNodeList | null): el is FieldControl {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

function findControl(form: HTMLFormElement, key: string): FieldControl | null {
  for (const name of new Set([key, key.split(".").pop() ?? key])) {
    const found = form.elements.namedItem(name);
    const el = found instanceof RadioNodeList ? found[0] ?? null : found;
    if (el instanceof Element && isControl(el) && !(el instanceof HTMLInputElement && el.type === "hidden")) return el;
  }
  return null;
}

function clearMark(el: Element) {
  if (!el.hasAttribute("data-action-invalid")) return;
  el.removeAttribute("aria-invalid");
  el.removeAttribute("data-action-invalid");
  el.closest("[data-field]")?.removeAttribute("data-error");
}

function clearMarks(form: HTMLFormElement) {
  form.querySelectorAll("[data-action-invalid]").forEach(clearMark);
}

function markFields(form: HTMLFormElement, fieldErrors: Record<string, string[]> | undefined) {
  clearMarks(form);
  let first: FieldControl | null = null;
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const el = findControl(form, key);
    if (!el) continue;
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("data-action-invalid", "");
    const wrapper = el.closest("[data-field]");
    if (wrapper && form.contains(wrapper)) wrapper.setAttribute("data-error", messages[0] ?? "");
    first ??= el;
  }
  first?.focus();
}

/** Number entries must never be negative. Fields that are signed on purpose opt out with `data-allow-negative`. */
function negativeEntries(form: HTMLFormElement): Failure | null {
  const fieldErrors: Record<string, string[]> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement) || el.disabled || !el.name || "allowNegative" in el.dataset) continue;
    const numeric = el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric";
    const value = el.value.trim();
    if (!numeric || value === "") continue;
    if (value.startsWith("-") || Number(value) < 0) fieldErrors[el.name] = ["Enter a positive number. Negative numbers are not allowed."];
    else if (el.inputMode === "numeric" && !/^\d+$/.test(value)) fieldErrors[el.name] = ["Enter a whole number, e.g. 2"];
    else if (!/^\d+(\.\d+)?$/.test(value)) fieldErrors[el.name] = ["Enter a valid number, e.g. 25 or 350.50"];
  }
  const keys = Object.keys(fieldErrors);
  if (keys.length === 0) return null;
  return { ok: false, code: "INVALID_INPUT", message: fieldErrors[keys[0]][0], fieldErrors };
}

export function ActionForm({
  action,
  children,
  className,
  id,
  successMessage,
  resetOnSuccess = true,
}: {
  action: (formData: FormData) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Notification text after a successful save. Defaults to the label of the button that was pressed. */
  successMessage?: string;
  /** Clear the entries after a successful save (the form shows fresh data from the server). */
  resetOnSuccess?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function fail(form: HTMLFormElement, result: Failure) {
    markFields(form, result.fieldErrors);
    notify({ tone: "danger", message: result.message });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
    const local = negativeEntries(form);
    if (local) return fail(form, local);
    const formData = new FormData(form, submitter ?? undefined);
    const label = submitter?.textContent?.trim() || (submitter instanceof HTMLInputElement ? submitter.value : "");

    startTransition(async () => {
      const result = await action(formData);
      // A server action that redirects navigates away and resolves without a result.
      if (!result) return;
      startTransition(() => {
        if (result.ok) {
          clearMarks(form);
          notify({ tone: "success", message: successMessage, action: successMessage ? undefined : label || undefined });
          if (resetOnSuccess) requestFormReset(form);
        } else fail(form, result);
      });
    });
  }

  return (
    <form
      id={id}
      onSubmit={onSubmit}
      onInput={(e) => clearMark(e.target as Element)}
      onChange={(e) => clearMark(e.target as Element)}
      className={className}
      aria-busy={pending || undefined}
    >
      <ActionPendingContext.Provider value={pending}>{children}</ActionPendingContext.Provider>
    </form>
  );
}
