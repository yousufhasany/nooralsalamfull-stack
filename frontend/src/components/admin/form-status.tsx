"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";

export function SubmitButton({ children, variant, disabled }: { children: string; variant?: "primary" | "danger" | "outline" | "gold"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? "…" : children}
    </Button>
  );
}

export function ActionAlert({ result }: { result?: ActionResult<unknown> | null }) {
  if (!result || result.ok) {
    if (result?.ok) return <Alert tone="success">Saved.</Alert>;
    return null;
  }
  return <Alert tone="danger">{result.message}</Alert>;
}

export function ConfirmSubmit({ name, value, label, message, variant = "danger" }: { name: string; value: string; label: string; message: string; variant?: "primary" | "danger" | "outline" }) {
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      variant={variant}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </Button>
  );
}
