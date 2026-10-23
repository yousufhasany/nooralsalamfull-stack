"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/(admin)/admin/actions/auth";
import { Field, Input, Alert } from "@/components/ui/form";
import { SubmitButton } from "@/components/admin/form-status";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
