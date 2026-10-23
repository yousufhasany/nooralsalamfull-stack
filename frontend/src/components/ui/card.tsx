import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-sand-200 bg-white shadow-soft", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-sand-300 bg-sand-50 px-6 py-12 text-center">
      <p className="font-medium text-ink-800">{title}</p>
      {text ? <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "danger" }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", tone === "warn" && "text-warn-600", tone === "danger" && "text-danger-600")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </Card>
  );
}
