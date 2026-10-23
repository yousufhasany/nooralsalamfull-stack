import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteObject, getObject, objectStorageConfigured, PRIVATE_BUCKET, putObject } from "@/server/storage/object-store";

/**
 * Private file store for housekeeping photographs and inventory images.
 * Callers use keys, never filesystem paths. When Neon Object Storage env vars are set
 * and PRIVATE_STORAGE_DIR is empty, bytes go to the private `assets` bucket.
 * An explicit PRIVATE_STORAGE_DIR keeps the local directory (used by tests).
 */
export function privateStorageRoot(): string {
  const configured = process.env.PRIVATE_STORAGE_DIR?.trim();
  if (configured) return configured;
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "frontend"))) return path.join(cwd, ".data", "private");
  const parent = path.resolve(cwd, "..", ".data", "private");
  if (existsSync(parent)) return parent;
  return path.join(cwd, ".data", "private");
}

export function photoMaxBytes(): number {
  const n = Number(process.env.HOUSEKEEPING_PHOTO_MAX_BYTES ?? 8 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
}

/** Days to retain housekeeping photographs. 0 means keep until a manager deletes the policy job runs. */
export function photoRetentionDays(): number {
  const n = Number(process.env.HOUSEKEEPING_PHOTO_RETENTION_DAYS ?? 365);
  return Number.isFinite(n) && n >= 0 ? n : 365;
}

function safeKey(key: string): string {
  if (!/^[a-z0-9/_.-]{8,200}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function useObjectStorage(): boolean {
  if (process.env.PRIVATE_STORAGE_DIR?.trim()) return false;
  return objectStorageConfigured();
}

function fullPath(key: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ privateStorageRoot());
  const file = path.resolve(/*turbopackIgnore: true*/ root, safeKey(key));
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return file;
}

export async function putPrivateFile(key: string, body: Buffer): Promise<void> {
  const safe = safeKey(key);
  if (useObjectStorage()) {
    await putObject(PRIVATE_BUCKET, safe, body);
    return;
  }
  const file = fullPath(safe);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ file, body);
}

export async function readPrivateFile(key: string): Promise<Buffer> {
  const safe = safeKey(key);
  if (useObjectStorage()) return getObject(PRIVATE_BUCKET, safe);
  return readFile(/*turbopackIgnore: true*/ fullPath(safe));
}

export function openPrivateFile(key: string) {
  if (useObjectStorage()) throw new Error("Private Neon objects are read with readPrivateFile.");
  return createReadStream(/*turbopackIgnore: true*/ fullPath(key));
}

export async function deletePrivateFile(key: string): Promise<void> {
  const safe = safeKey(key);
  if (useObjectStorage()) {
    await deleteObject(PRIVATE_BUCKET, safe).catch(() => undefined);
    return;
  }
  await unlink(/*turbopackIgnore: true*/ fullPath(safe)).catch(() => undefined);
}

const TYPES: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
};

/** Detect JPEG, PNG, or WebP from magic bytes. The client-supplied MIME type is ignored. */
export function detectImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return TYPES.jpeg;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return TYPES.png;
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return TYPES.webp;
  return null;
}
