import type { DbOrTx } from "@/server/db/client";
import { db } from "@/server/db/client";

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  source?: "ADMIN" | "WEBSITE" | "SYSTEM" | "CHANNEL" | "API";
  ip?: string | null;
}

const SENSITIVE_KEYS = new Set([
  "passwordHash",
  "credentialsEnc",
  "webhookSecretEnc",
  "idNumberEnc",
  "password",
  "secret",
  "apiKey",
  "token",
]);

function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  // Decimal (Prisma / decimal.js) and other values that know how to serialise themselves.
  const maybeJson = value as { toJSON?: () => unknown };
  if (typeof maybeJson.toJSON === "function") return scrub(maybeJson.toJSON());
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : scrub(v);
  }
  return out;
}

export async function listAuditHistory(limit = 200) {
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true, role: { select: { key: true } } } } },
  });
}

/** Remove one history row. The caller must already be a Super Admin. */
export async function deleteAuditHistory(id: string): Promise<void> {
  await db.auditLog.delete({ where: { id } });
}

/** Append an audit record. Pass the transaction client to make it atomic with the change. */
export async function audit(input: AuditInput, client: DbOrTx = db): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before == null ? undefined : (scrub(input.before) as object),
      after: input.after == null ? undefined : (scrub(input.after) as object),
      source: input.source ?? "ADMIN",
      ip: input.ip ?? null,
    },
  });
}
