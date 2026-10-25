"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type ToastTone = "success" | "danger";
/** `action` is the label of the button that was pressed, e.g. "Add room". */
type ToastInput = { tone: ToastTone; message?: string; action?: string };
type Toast = ToastInput & { id: number };
export type ToastLabels = { success: string; error: string; saved: string; actionDone: string; close: string };

const FLASH_COOKIE = "admin_flash";
const listeners = new Set<(t: ToastInput) => void>();

/** Show a notification in the admin console. */
export function notify(t: ToastInput) {
  for (const l of listeners) l(t);
}

function readFlash(): ToastInput | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!raw) return null;
  document.cookie = `${FLASH_COOKIE}=; path=/admin; max-age=0`;
  let value = raw.slice(FLASH_COOKIE.length + 1);
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(value) as { message?: unknown; tone?: unknown };
      if (typeof parsed.message !== "string") return null;
      return { message: parsed.message, tone: parsed.tone === "danger" ? "danger" : "success" };
    } catch {
      value = decodeURIComponent(value);
    }
  }
  return null;
}

export function Toaster({ labels }: { labels: ToastLabels }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    let next = 0;
    const add = (t: ToastInput) => {
      const id = Date.now() + next++;
      setToasts((list) => [{ ...t, id }, ...list].slice(0, 4));
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "danger" ? 8000 : 5000);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  useEffect(() => {
    const flash = readFlash();
    if (flash) notify(flash);
  }, [pathname]);

  return (
    <div className="toast-stack no-print" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "danger" ? "alert" : undefined}>
          <div className="min-w-0">
            <p className="toast-title">{t.tone === "success" ? labels.success : labels.error}</p>
            <p className="mt-0.5 text-ink-700">{t.message ?? (t.action ? labels.actionDone.replace("{action}", t.action) : labels.saved)}</p>
          </div>
          <button type="button" className="toast-close" aria-label={labels.close} onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
