export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function opt(fd: FormData, key: string): string | undefined {
  const v = str(fd, key);
  return v === "" ? undefined : v;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).map(String).map((s) => s.trim()).filter(Boolean);
}

export function obj(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
