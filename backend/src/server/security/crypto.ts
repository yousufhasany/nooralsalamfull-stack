import crypto from "node:crypto";

/**
 * Secret vault: AES-256-GCM encryption for data that must be readable by the server
 * but never exposed to browsers (OTA credentials, webhook secrets, guest ID numbers).
 *
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required in production");
  }
  // Development convenience only: derive a stable key from AUTH_SECRET.
  const seed = process.env.AUTH_SECRET ?? "development-only-secret";
  return crypto.createHash("sha256").update(`vault:${seed}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T = unknown>(payload: string | null | undefined): T | null {
  if (!payload) return null;
  return JSON.parse(decryptSecret(payload)) as T;
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Stable JSON stringify (sorted keys) for hashing payloads. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
