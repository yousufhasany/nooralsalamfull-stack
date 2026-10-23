import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "green" | "gold" | "red" | "blue" | "amber" | "gray";

const tones: Record<Tone, string> = {
  neutral: "bg-sand-100 text-ink-700 ring-sand-300",
  green: "bg-ok-50 text-ok-600 ring-ok-600/25",
  gold: "bg-gold-100 text-gold-700 ring-gold-500/40",
  red: "bg-danger-50 text-danger-600 ring-danger-600/25",
  blue: "bg-brand-50 text-brand-800 ring-brand-300",
  amber: "bg-warn-50 text-warn-600 ring-warn-600/25",
  gray: "bg-ink-200/50 text-ink-700 ring-ink-200",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

export const reservationTone: Record<string, Tone> = {
  PENDING: "amber",
  CONFIRMED: "blue",
  CHECKED_IN: "green",
  CHECKED_OUT: "gray",
  CANCELLED: "red",
  NO_SHOW: "red",
};

export const paymentTone: Record<string, Tone> = {
  UNPAID: "red",
  PENDING: "amber",
  PARTIALLY_PAID: "amber",
  PAID: "green",
  PAY_AT_HOTEL: "neutral",
  PAID_BY_OTA: "green",
  PARTIALLY_REFUNDED: "amber",
  REFUNDED: "gray",
  FAILED: "red",
  INFORMATION_NOT_PROVIDED: "amber",
};

export const sourceTone: Record<string, Tone> = {
  DIRECT_WEBSITE: "green",
  BOOKING_COM: "blue",
  AGODA: "blue",
  TRIP_COM: "blue",
  EXPEDIA: "blue",
  PHONE: "neutral",
  WALK_IN: "neutral",
  OTHER: "gray",
};
