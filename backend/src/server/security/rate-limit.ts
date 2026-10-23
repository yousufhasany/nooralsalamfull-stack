import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL so it works across multiple server instances.
 * The upsert is a single atomic statement.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const rows = await db.$queryRaw<{ count: number; windowEnds: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowEnds")
    VALUES (${key}, 1, now() + (${windowSeconds} || ' seconds')::interval)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowEnds" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowEnds" = CASE WHEN "RateLimitBucket"."windowEnds" < now() THEN now() + (${windowSeconds} || ' seconds')::interval ELSE "RateLimitBucket"."windowEnds" END
    RETURNING "count", "windowEnds"`;
  const row = rows[0];
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), resetAt: row.windowEnds };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const r = await hitRateLimit(key, limit, windowSeconds);
  if (!r.allowed) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
  }
}

export async function purgeExpiredRateLimits(): Promise<number> {
  const res = await db.rateLimitBucket.deleteMany({ where: { windowEnds: { lt: new Date() } } });
  return res.count;
}
