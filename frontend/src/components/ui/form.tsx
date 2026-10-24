import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-sand-100 aria-[invalid=true]:border-danger-600";

/** Number entries are plain text with a numeric keypad, so the mouse wheel and spinner arrows can't change them. */
export function Input({ className, type, min, max, step, ...props }: ComponentProps<"input">) {
  if (type === "number") {
    const whole = step === undefined || Number(step) === 1;
    return <input className={cn(control, "h-11", className)} type="text" inputMode={whole ? "numeric" : "decimal"} autoComplete="off" {...props} />;
  }
  return <input className={cn(control, "h-11", className)} type={type} min={min} max={max} step={step} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-11 pe-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  optionalText,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  optionalText?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-field className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? <span aria-hidden className="ms-0.5 text-danger-600">*</span> : optionalText ? <span className="ms-1 text-xs font-normal text-ink-500">({optionalText})</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "success" | "warn" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-ok-600/30 bg-ok-50 text-ok-600",
    warn: "border-warn-600/30 bg-warn-50 text-warn-600",
    danger: "border-danger-600/30 bg-danger-50 text-danger-600",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
