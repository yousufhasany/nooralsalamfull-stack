import { db } from "@/server/db/client";
import type { SyncJob } from "@/generated/prisma/client";
import type { SyncOperation } from "@/generated/prisma/enums";
import { getChannelProvider } from "@/integrations/channels/registry";
import type {
  AvailabilityUpdate,
  ChannelContext,
  ChannelManagerProvider,
  PushResult,
  RateUpdate,
  RestrictionUpdate,
} from "@/integrations/channels/types";
import { addDays, eachNight, fromDate, toDate, todayIn, diffDays, type DateStr } from "@/lib/dates";
import { buildChannelContext } from "./channel.service";
import { getAvailability } from "./availability.service";
import { loadPricingContext, nightlyPrice } from "./pricing.service";
import { getHotel, getSettings } from "./settings.service";
import { processExternalReservation } from "./channel-inbound.service";
import { enqueueInventorySync, enqueueRateSync, enqueueReservationPull, enqueueRestrictionSync, pushableChannels } from "./channel-queue.service";
import { expirePendingHolds } from "./reservation.service";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";

/** How far ahead we keep channels loaded (days). */
const HORIZON_DAYS = 365;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const BASE_BACKOFF_MS = 30_000;
const STALE_LOCK_MS = 10 * 60 * 1000;
const CHUNK = 200;

export function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

interface RangePayload {
  roomTypeIds: string[] | null;
  from: DateStr;
  to: DateStr;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function pushChunks<T>(items: T[], push: (batch: T[]) => Promise<PushResult>): Promise<PushResult> {
  let count = 0;
  for (const batch of chunk(items, CHUNK)) {
    const r = await push(batch);
    if (!r.ok) return { ...r, recordCount: count };
    count += r.recordCount;
  }
  return { ok: true, recordCount: count };
}

// ---------------------------------------------------------------------------
// Builders (central inventory -> channel representation)
// ---------------------------------------------------------------------------

async function buildAvailability(channelId: string, p: RangePayload): Promise<AvailabilityUpdate[]> {
  const mappings = await db.channelRoomMapping.findMany({
    where: { channelId, isActive: true, ...(p.roomTypeIds ? { roomTypeId: { in: p.roomTypeIds } } : {}) },
  });
  if (mappings.length === 0) return [];
  const checkOut = addDays(p.to, 1);
  const availability = await getAvailability({ roomTypeIds: [...new Set(mappings.map((m) => m.roomTypeId))], checkIn: p.from, checkOut });
  const updates: AvailabilityUpdate[] = [];
  for (const m of mappings) {
    const a = availability.find((x) => x.roomTypeId === m.roomTypeId);
    if (!a) continue;
    for (const n of a.nights) updates.push({ externalRoomId: m.externalRoomId, date: n.date, available: n.available });
  }
  return updates;
}

async function buildRates(channelId: string, source: Parameters<typeof nightlyPrice>[3], p: RangePayload): Promise<RateUpdate[]> {
  const hotel = await getHotel();
  const pricing = await getSettings(hotel.id, "pricing");
  const roomMaps = await db.channelRoomMapping.findMany({
    where: { channelId, isActive: true, ...(p.roomTypeIds ? { roomTypeId: { in: p.roomTypeIds } } : {}) },
  });
  const rateMaps = await db.channelRatePlanMapping.findMany({ where: { channelId, isActive: true } });
  const nights = eachNight(p.from, addDays(p.to, 1));
  const updates: RateUpdate[] = [];
  for (const rm of roomMaps) {
    const plans = rateMaps.filter((r) => !r.roomTypeId || r.roomTypeId === rm.roomTypeId);
    const targets = plans.length ? plans : [{ ratePlanId: null as string | null, externalRatePlanId: null as string | null }];
    for (const plan of targets) {
      const ctx = await loadPricingContext(db, rm.roomTypeId, plan.ratePlanId, p.from, p.to, pricing.weekendDays);
      for (const date of nights) {
        updates.push({
          externalRoomId: rm.externalRoomId,
          externalRatePlanId: plan.externalRatePlanId,
          date,
          price: nightlyPrice(ctx, date, 1, source).toFixed(2),
          currency: hotel.currency,
        });
      }
    }
  }
  return updates;
}

async function buildRestrictions(channelId: string, p: RangePayload): Promise<RestrictionUpdate[]> {
  const roomMaps = await db.channelRoomMapping.findMany({ where: { channelId, isActive: true } });
  const rateMaps = await db.channelRatePlanMapping.findMany({ where: { channelId, isActive: true } });
  const rows = await db.channelRestriction.findMany({
    where: {
      isActive: true,
      startDate: { lte: toDate(p.to) },
      endDate: { gte: toDate(p.from) },
      OR: [{ channelId: null }, { channelId }],
    },
  });
  const out: RestrictionUpdate[] = [];
  for (const r of rows) {
    const rooms = roomMaps.filter((m) => !r.roomTypeId || m.roomTypeId === r.roomTypeId);
    for (const m of rooms) {
      const plan = r.ratePlanId ? rateMaps.find((x) => x.ratePlanId === r.ratePlanId) : null;
      if (r.ratePlanId && !plan) continue;
      out.push({
        externalRoomId: m.externalRoomId,
        externalRatePlanId: plan?.externalRatePlanId ?? null,
        startDate: fromDate(r.startDate),
        endDate: fromDate(r.endDate),
        stopSell: r.stopSell,
        minStay: r.minStay,
        maxStay: r.maxStay,
        closedToArrival: r.closedToArrival,
        closedToDeparture: r.closedToDeparture,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

interface JobOutcome {
  ok: boolean;
  records: number;
  failed?: number;
  error?: string;
  retryable?: boolean;
}

async function execute(job: SyncJob, ctx: ChannelContext, provider: ChannelManagerProvider, channelSource: Parameters<typeof nightlyPrice>[3]): Promise<JobOutcome> {
  const payload = (job.payload ?? null) as RangePayload | null;
  const range: RangePayload = payload ?? { roomTypeIds: null, from: todayIn(), to: addDays(todayIn(), HORIZON_DAYS) };

  switch (job.operation as SyncOperation) {
    case "INVENTORY_PUSH": {
      if (!provider.capabilities.pushAvailability) return { ok: false, records: 0, error: "Provider does not support availability push", retryable: false };
      const updates = await buildAvailability(job.channelId, range);
      const r = await pushChunks(updates, (b) => provider.pushAvailability(ctx, b));
      if (r.ok) {
        for (const batch of chunk(updates, 500)) {
          const roomMaps = await db.channelRoomMapping.findMany({ where: { channelId: job.channelId } });
          await db.$transaction(
            batch.flatMap((u) => {
              const m = roomMaps.find((x) => x.externalRoomId === u.externalRoomId);
              if (!m) return [];
              return [
                db.channelInventory.upsert({
                  where: { channelId_roomTypeId_date: { channelId: job.channelId, roomTypeId: m.roomTypeId, date: toDate(u.date) } },
                  create: { channelId: job.channelId, roomTypeId: m.roomTypeId, date: toDate(u.date), available: u.available },
                  update: { available: u.available, pushedAt: new Date() },
                }),
              ];
            }),
          );
        }
      }
      return { ok: r.ok, records: r.recordCount, error: r.error, retryable: r.retryable };
    }
    case "RATE_PUSH": {
      if (!provider.capabilities.pushRates) return { ok: false, records: 0, error: "Provider does not support rate push", retryable: false };
      const updates = await buildRates(job.channelId, channelSource, range);
      const r = await pushChunks(updates, (b) => provider.pushRates(ctx, b));
      return { ok: r.ok, records: r.recordCount, error: r.error, retryable: r.retryable };
    }
    case "RESTRICTION_PUSH": {
      if (!provider.capabilities.pushRestrictions) return { ok: false, records: 0, error: "Provider does not support restriction push", retryable: false };
      const updates = await buildRestrictions(job.channelId, range);
      const r = await provider.pushRestrictions(ctx, updates);
      return { ok: r.ok, records: r.recordCount, error: r.error, retryable: r.retryable };
    }
    case "RESERVATION_PULL": {
      const conn = await db.channelConnection.findUnique({ where: { channelId: job.channelId } });
      const since = conn?.lastSuccessfulSyncAt ?? undefined;
      const reservations = await provider.getReservations(ctx, since);
      let ok = 0;
      let failed = 0;
      for (const ext of reservations) {
        const res = await processExternalReservation(job.channelId, ext, "POLL");
        if (res.outcome === "FAILED") failed++;
        else {
          ok++;
          const ack = await provider.acknowledgeReservation(ctx, ext.externalReservationId).catch((e) => ({ ok: false, error: String(e) }));
          if (!ack.ok) console.warn("[channel] acknowledge failed", ext.externalReservationId);
        }
      }
      return failed === 0
        ? { ok: true, records: ok }
        : { ok: false, records: ok, failed, error: `${failed} reservation(s) could not be imported (see webhook events)`, retryable: false };
    }
    default:
      return { ok: false, records: 0, error: `Unsupported operation ${job.operation}`, retryable: false };
  }
}

/** Claim and run one job. Returns false if another worker claimed it first. */
export async function runJob(jobId: string): Promise<boolean> {
  const claimed = await db.syncJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return false;
  const job = await db.syncJob.findUniqueOrThrow({ where: { id: jobId } });
  const channel = await db.channel.findUniqueOrThrow({ where: { id: job.channelId } });
  const log = await db.channelSyncLog.create({
    data: { channelId: job.channelId, jobId: job.id, operation: job.operation, status: "PENDING", retryCount: job.attempts - 1, referenceId: job.id },
  });

  let outcome: JobOutcome;
  try {
    const ctx = await buildChannelContext(job.channelId);
    const provider = getChannelProvider(channel.providerKey);
    outcome = await execute(job, ctx, provider, channel.source);
  } catch (e) {
    outcome = { ok: false, records: 0, error: e instanceof Error ? e.message : String(e), retryable: true };
  }

  const now = new Date();
  const exhausted = job.attempts >= job.maxAttempts;
  const giveUp = !outcome.ok && (outcome.retryable === false || exhausted);

  await db.channelSyncLog.update({
    where: { id: log.id },
    data: {
      status: outcome.ok ? "SUCCESS" : outcome.records > 0 ? "PARTIAL" : "FAILED",
      recordCount: outcome.records,
      failedCount: outcome.failed ?? 0,
      error: outcome.error?.slice(0, 1000) ?? null,
      endedAt: now,
    },
  });

  if (outcome.ok) {
    await db.syncJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: now, lastError: null } });
    const stillFailing = await db.syncJob.count({ where: { channelId: job.channelId, operation: job.operation, status: "FAILED" } });
    await db.channelConnection.updateMany({
      where: { channelId: job.channelId },
      data: {
        lastSyncAt: now,
        lastSuccessfulSyncAt: now,
        lastError: null,
        ...(job.operation === "INVENTORY_PUSH" && stillFailing === 0 ? { inventoryNeedsVerification: false } : {}),
      },
    });
  } else if (giveUp) {
    await db.syncJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: now, lastError: outcome.error?.slice(0, 1000) } });
    await db.channelConnection.updateMany({
      where: { channelId: job.channelId },
      data: {
        lastSyncAt: now,
        lastError: outcome.error?.slice(0, 500),
        ...(job.operation === "INVENTORY_PUSH" ? { inventoryNeedsVerification: true } : {}),
      },
    });
  } else {
    await db.syncJob.update({
      where: { id: job.id },
      data: { status: "PENDING", lockedAt: null, runAt: new Date(now.getTime() + backoffMs(job.attempts)), lastError: outcome.error?.slice(0, 1000) },
    });
    await db.channelConnection.updateMany({ where: { channelId: job.channelId }, data: { lastSyncAt: now, lastError: outcome.error?.slice(0, 500) } });
  }
  return true;
}

export async function runDueJobs(limit = 25, now = new Date()): Promise<{ ran: number }> {
  // Recover jobs whose worker died mid-run.
  await db.syncJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "PENDING", lockedAt: null },
  });
  const due = await db.syncJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let ran = 0;
  for (const j of due) if (await runJob(j.id)) ran++;
  return { ran };
}

/** Manual retry from the admin UI: resets attempts and schedules immediately. */
export async function retryJob(jobId: string) {
  await db.syncJob.update({ where: { id: jobId }, data: { status: "PENDING", attempts: 0, runAt: new Date(), lastError: null, finishedAt: null } });
  return runJob(jobId);
}

// ---------------------------------------------------------------------------
// Scheduling (called by scripts/worker.ts and /api/jobs/run)
// ---------------------------------------------------------------------------

/** Queue a complete re-sync of inventory, rates and restrictions for one channel. */
export async function enqueueFullSync(channelId: string) {
  const from = todayIn();
  const to = addDays(from, HORIZON_DAYS);
  const channel = await db.channel.findUniqueOrThrow({ where: { id: channelId } });
  const channels = await pushableChannels();
  if (!channels.some((c) => c.id === channelId)) return { queued: false as const, reason: `${channel.name} is not connected.` };
  await enqueueInventorySync({ roomTypeIds: null, from, to, onlyChannelId: channelId });
  await enqueueRateSync({ from, to, channelId });
  await enqueueRestrictionSync({ from, to, channelId });
  const provider = getChannelProvider(channel.providerKey);
  if (provider.capabilities.polling) await enqueueReservationPull(channelId);
  return { queued: true as const };
}

/** Periodic housekeeping for the scheduler. */
export async function runScheduler(now = new Date()) {
  const expired = await expirePendingHolds(now);
  const channels = await pushableChannels();
  for (const c of channels) {
    const provider = getChannelProvider(c.providerKey);
    if (provider.capabilities.polling) await enqueueReservationPull(c.id);
    // Rolling safety net: re-push the next 30 days so a lost update is healed within one cycle.
    const from = todayIn();
    await enqueueInventorySync({ roomTypeIds: null, from, to: addDays(from, 30), onlyChannelId: c.id }).catch(() => undefined);
  }
  const purged = await purgeExpiredRateLimits();
  const { ran } = await runDueJobs(50, now);
  return { expiredHolds: expired, jobsRun: ran, rateLimitsPurged: purged, channels: channels.length };
}

/** Import every reservation the provider currently reports (first connection). */
export async function importExistingReservations(channelId: string) {
  const ctx = await buildChannelContext(channelId);
  const channel = await db.channel.findUniqueOrThrow({ where: { id: channelId } });
  const provider = getChannelProvider(channel.providerKey);
  if (!provider.isImplemented) {
    return { found: 0, imported: 0, skipped: 0, failed: 0, error: `${provider.displayName} connector is not implemented.` };
  }
  const reservations = await provider.getReservations(ctx);
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const ext of reservations) {
    const r = await processExternalReservation(channelId, ext, "IMPORT");
    if (r.outcome === "FAILED") {
      failed++;
      errors.push(`${ext.externalReservationId}: ${r.error}`);
    } else if (r.outcome === "DUPLICATE" || r.outcome === "UNCHANGED") skipped++;
    else imported++;
  }
  await db.channelSyncLog.create({
    data: {
      channelId,
      operation: "RESERVATION_IMPORT",
      status: failed === 0 ? "SUCCESS" : imported > 0 ? "PARTIAL" : "FAILED",
      recordCount: imported,
      failedCount: failed,
      error: errors.slice(0, 5).join("; ") || null,
      endedAt: new Date(),
    },
  });
  return { found: reservations.length, imported, skipped, failed, errors };
}

/** Days between two dates helper re-exported for UI (avoid importing dates in client code). */
export const daysBetween = diffDays;
