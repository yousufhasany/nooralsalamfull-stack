"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { ActionPendingContext } from "@/components/admin/action-pending";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, variant, disabled }: { children: string; variant?: "primary" | "danger" | "outline" | "gold"; disabled?: boolean }) {
  const status = useFormStatus();
  const actionPending = useContext(ActionPendingContext);
  const pending = status.pending || actionPending;
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? "…" : children}
    </Button>
  );
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
