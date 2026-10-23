"use client";

import { useActionState, type ReactNode } from "react";
import { ActionAlert } from "@/components/admin/form-status";
import type { ActionResult } from "@/lib/errors";

type Action = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

export function ActionForm({
  action,
  children,
  className,
  id,
}: {
  action: (formData: FormData) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const bound: Action = async (_prev, formData) => action(formData);
  const [state, formAction] = useActionState(bound, null);
  return (
    <form id={id} action={formAction} className={className}>
      <ActionAlert result={state} />
      {children}
    </form>
  );
}
