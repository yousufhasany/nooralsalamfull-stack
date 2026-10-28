import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { detectImage, photoMaxBytes } from "@/server/storage/private-files";
import { db } from "@/server/db/client";
import { deleteObject, objectStorageConfigured, PUBLIC_BUCKET, publicObjectKey, publicObjectUrl, putObject } from "@/server/storage/object-store";

const IMAGE_FOLDER = ["rooms", "gallery", "hotel"] as const;
type ImageFolder = (typeof IMAGE_FOLDER)[number];

/** The Next.js `public` folder, whether the process was started from the repo root or from `frontend`. */
export function publicRoot(): string {
  const cwd = process.cwd();
  const nested = path.join(cwd, "frontend", "public");
  if (existsSync(nested)) return nested;
  return path.join(cwd, "public");
}

/**
 * Accept a pasted image link or a site path such as `/photos/room.jpg`.
 * A link without http:// or https:// is treated as https.
 */
export function imageReference(raw: string): string {
  const value = raw.trim();
  if (!value) throw new AppError("INVALID_INPUT", "Choose a photograph or paste an image link.");
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("..") && !value.includes("\\") && value.length <= 500) {
    return value;
  }
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AppError("INVALID_INPUT", "That image link is not valid. Use a full link, for example https://example.com/room.jpg");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("INVALID_INPUT", "The image link must start with http:// or https://");
  }
  if (parsed.toString().length > 500) throw new AppError("INVALID_INPUT", "That image link is too long.");
  return parsed.toString();
}

export function optionalImageReference(raw: string): string {
  return raw.trim() ? imageReference(raw) : "";
}

function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = v4.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new AppError("INVALID_INPUT", "That image link is not valid.");
  }
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new AppError("INVALID_INPUT", "That image link is not valid.");
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
  }
  if (records.length === 0 || records.some((record) => isBlockedAddress(record.address))) {
    throw new AppError("INVALID_INPUT", "That image link is not valid.");
  }
}

async function readLimited(response: Response, max: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) throw new AppError("INVALID_INPUT", "This photograph is larger than the allowed size.");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new AppError("INVALID_INPUT", "This photograph is larger than the allowed size.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function imageFromHtml(html: string, base: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metas) {
    const key = /(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i.test(tag);
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (!key || !content) continue;
    try {
      return new URL(content.replace(/&amp;/g, "&"), base).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function looksLikeImageFile(url: string): boolean {
  try {
    return /\.(jpe?g|png|webp|avif)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** JPEG, PNG, WebP, and AVIF. Share sites often serve the photograph as AVIF. */
function detectPublicImage(buf: Buffer): { ext: string } | null {
  const basic = detectImage(buf);
  if (basic) return basic;
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return { ext: "avif" };
  }
  return null;
}

/** Download a pasted link. Share pages (ImgBB and similar) are followed to the photograph itself. */
async function fetchImageBytes(startUrl: string, allowHtml: boolean): Promise<Buffer> {
  let current = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new AppError("INVALID_INPUT", "The image link must start with http:// or https://");
    }
    await assertPublicHost(parsed.hostname);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(current, {
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
          headers: {
            accept: "image/avif,image/webp,image/jpeg,image/png,text/html;q=0.8,*/*;q=0.5",
            "user-agent": "Mozilla/5.0",
          },
        });
        break;
      } catch {
        if (attempt === 1) {
          throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
        }
      }
    }
    if (!response) throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
    }
    const type = response.headers.get("content-type") ?? "";
    const html = type.includes("text/html") || type.includes("application/xhtml");
    const bytes = await readLimited(response, html ? 1_500_000 : photoMaxBytes());
    if (detectPublicImage(bytes)) return bytes;
    if (allowHtml && (html || /^\s*</.test(bytes.subarray(0, 64).toString("utf8")))) {
      const picture = imageFromHtml(bytes.toString("utf8"), current);
      if (!picture) {
        throw new AppError(
          "INVALID_INPUT",
          "That link opens a web page, not a photograph. Upload the file, or paste a direct image address ending in .jpg, .png, or .webp.",
        );
      }
      return fetchImageBytes(picture, false);
    }
    throw new AppError("INVALID_INPUT", "Upload a JPEG, PNG, WebP, or AVIF photograph.");
  }
  throw new AppError("INVALID_INPUT", "That image link could not be opened. Upload the photograph from your computer instead.");
}

/**
 * Turn a pasted link or site path into a picture this website can show.
 * Remote photographs are copied into `public/uploads` so a share page is not stored as the picture.
 */
export async function materializeImage(raw: string, folder: ImageFolder): Promise<string> {
  const ref = imageReference(raw);
  if (ref.startsWith("/")) return ref;
  try {
    return await savePublicImage(await fetchImageBytes(ref, true), folder);
  } catch (error) {
    if (error instanceof AppError && looksLikeImageFile(ref) && error.message.includes("could not be opened")) return ref;
    throw error;
  }
}

export async function materializeOptionalImage(raw: string, folder: ImageFolder): Promise<string> {
  return raw.trim() ? materializeImage(raw, folder) : "";
}

const PUBLIC_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/** Store a JPEG, PNG, WebP, or AVIF and return the address the website can use. */
export async function savePublicImage(bytes: Buffer, folder: "rooms" | "gallery" | "hotel"): Promise<string> {
  if (bytes.length === 0) throw new AppError("INVALID_INPUT", "Choose a photograph.");
  if (bytes.length > photoMaxBytes()) throw new AppError("INVALID_INPUT", "This photograph is larger than the allowed size.");
  const kind = detectPublicImage(bytes);
  if (!kind) throw new AppError("INVALID_INPUT", "Upload a JPEG, PNG, WebP, or AVIF photograph.");
  const name = `${randomUUID()}.${kind.ext}`;
  const key = `${folder}/${name}`;
  const mimeType = PUBLIC_MIME[kind.ext] ?? "application/octet-stream";
  if (objectStorageConfigured()) {
    await putObject(PUBLIC_BUCKET, key, bytes, mimeType);
    return publicObjectUrl(key);
  }
  // A deployed site cannot keep a file written to its own disk. Store the photograph and serve /media.
  await db.storedImage.create({ data: { path: key, mimeType, bytes: Uint8Array.from(bytes) } });
  return `/media/${key}`;
}

export async function deletePublicImage(url: string): Promise<void> {
  const objectKey = publicObjectKey(url);
  if (objectKey) {
    await deleteObject(PUBLIC_BUCKET, objectKey).catch(() => undefined);
    return;
  }
  if (url.startsWith("/media/") && !url.includes("..")) {
    const storedPath = url.slice("/media/".length);
    if (/^(rooms|gallery|hotel)\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i.test(storedPath)) {
      await db.storedImage.delete({ where: { path: storedPath } }).catch(() => undefined);
    }
    return;
  }
  if (!url.startsWith("/uploads/") || url.includes("..")) return;
  const file = path.resolve(/*turbopackIgnore: true*/ publicRoot(), url.slice(1));
  const root = path.resolve(/*turbopackIgnore: true*/ publicRoot(), "uploads");
  if (!file.startsWith(root + path.sep)) return;
  await unlink(/*turbopackIgnore: true*/ file).catch(() => undefined);
}
