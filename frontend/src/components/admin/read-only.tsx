import type { ReactNode } from "react";

/** Leaves lists and links usable, and blocks forms when this person may only look. */
export function ReadOnly({ locked, notice, children }: { locked: boolean; notice?: string; children: ReactNode }) {
  if (!locked) return children;
  return (
    <div>
      {notice ? <p className="mb-4 rounded-lg border border-sand-200 bg-sand-100 px-3 py-2 text-sm text-ink-600">{notice}</p> : null}
      <div className="read-only-lock">{children}</div>
    </div>
  );
}
