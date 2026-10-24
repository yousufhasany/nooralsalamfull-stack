import { fieldError } from "@/lib/errors";

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function opt(fd: FormData, key: string): string | undefined {
  const v = str(fd, key);
  return v === "" ? undefined : v;
}

/** Whole or decimal number entered by staff. Entries must be zero or more. */
export function num(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key);
  if (v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw fieldError(key, "Enter a number.");
  if (n < 0) throw fieldError(key, "Enter a positive number. Negative numbers are not allowed.");
  return n;
}

/** Money or quantity kept as a string for exact decimal maths. Rejects negative and malformed values. */
export function amount(fd: FormData, key: string): string {
  const v = str(fd, key);
  if (v === "") return v;
  if (v.startsWith("-")) throw fieldError(key, "Enter a positive amount. Negative numbers are not allowed.");
  if (!/^\d+(\.\d+)?$/.test(v)) throw fieldError(key, "Enter a valid amount, e.g. 350.00");
  return v;
}

export function optAmount(fd: FormData, key: string): string | undefined {
  const v = amount(fd, key);
  return v === "" ? undefined : v;
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
