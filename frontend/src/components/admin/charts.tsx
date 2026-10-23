export function BarList({
  items,
  value,
  label,
}: {
  items: { key: string; label: string; value: number }[];
  value?: (n: number) => string;
  label?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3" aria-label={label}>
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex justify-between text-xs text-ink-600">
            <span>{i.label}</span>
            <span className="tabular-nums">{value ? value(i.value) : i.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-200">
            <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.round((i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SparkBars({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div aria-label={label} className="flex h-32 items-end gap-1">
      {points.map((p) => (
        <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t bg-brand-700/80"
              style={{ height: `${Math.max(4, Math.round((p.value / max) * 100))}%` }}
              title={`${p.label}: ${p.value}`}
            />
          </div>
          <span className="truncate text-[10px] text-ink-400">{p.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
