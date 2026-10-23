import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brand-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Pager({
  page,
  pages,
  href,
  labels,
}: {
  page: number;
  pages: number;
  href: (p: number) => string;
  labels?: { previous: string; next: string; page: string };
}) {
  if (pages <= 1) return null;
  const previous = labels?.previous ?? "Previous";
  const next = labels?.next ?? "Next";
  const current = labels?.page ?? `Page ${page} of ${pages}`;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <a className="text-brand-800 hover:underline" href={href(page - 1)}>
          {previous}
        </a>
      ) : (
        <span />
      )}
      <span className="text-ink-500">{current}</span>
      {page < pages ? (
        <a className="text-brand-800 hover:underline" href={href(page + 1)}>
          {next}
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
