import { db, type DbOrTx } from "@/server/db/client";
import type { SyncOperation } from "@/generated/prisma/enums";
import { addDays, type DateStr } from "@/lib/dates";
import { getChannelProvider } from "@/integrations/channels/registry";

/**
 * Outbox for channel synchronisation. Business operations (a booking, a cancellation, a rate change)
 * only ENQUEUE work here; channel-sync.service.ts executes it with retry + exponential backoff.
 * Enqueueing is cheap, never calls an external system and therefore can never fail a booking.
 */

export interface SyncRange {
  roomTypeIds?: string[];
  from: DateStr;
  to: DateStr;
}

interface InventoryPayload {
  roomTypeIds: string[] | null;
  from: DateStr;
  to: DateStr;
}

/** Channels that are really connected and can accept pushes. */
export async function pushableChannels(client: DbOrTx = db, excludeChannelId?: string) {
  const channels = await client.channel.findMany({
    where: {
      isEnabled: true,
      connection: { is: { status: "CONNECTED" } },
      ...(excludeChannelId ? { id: { not: excludeChannelId } } : {}),
    },
    include: { connection: true },
  });
  return channels.filter((c) => {
    const p = getChannelProvider(c.providerKey);
    return p.isImplemented && (!p.isSimulation || process.env.NODE_ENV !== "production");
  });
}

async function upsertCoalesced(
  client: DbOrTx,
  channelId: string,
  operation: SyncOperation,
  dedupeKey: string,
  payload: InventoryPayload,
  runAt: Date,
) {
  const existing = await client.syncJob.findFirst({ where: { channelId, dedupeKey, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (existing) {
    const old = existing.payload as unknown as InventoryPayload;
    const merged: InventoryPayload = {
      roomTypeIds:
        old.roomTypeIds === null || payload.roomTypeIds === null
          ? null
          : [...new Set([...old.roomTypeIds, ...payload.roomTypeIds])],
      from: old.from < payload.from ? old.from : payload.from,
      to: old.to > payload.to ? old.to : payload.to,
    };
    await client.syncJob.update({ where: { id: existing.id }, data: { payload: merged as object, runAt: existing.runAt < runAt ? existing.runAt : runAt } });
    return existing.id;
  }
  const job = await client.syncJob.create({ data: { channelId, operation, dedupeKey, payload: payload as object, runAt } });
  return job.id;
}

/**
 * Queue an availability push. `roomTypeIds: null` = every mapped room type.
 * The range is inclusive of `to` as a *stay night*; callers pass the check-out date of the affected
 * stay, so the night before it is the last affected night (one extra night is harmless).
 */
export async function enqueueInventorySync(args: {
  roomTypeIds: string[] | null;
  from: DateStr;
  to: DateStr;
  excludeChannelId?: string;
  onlyChannelId?: string;
}, client: DbOrTx = db) {
  const channels = (await pushableChannels(client, args.excludeChannelId)).filter((c) => !args.onlyChannelId || c.id === args.onlyChannelId);
  const ids: string[] = [];
  for (const c of channels) {
    ids.push(
      await upsertCoalesced(client, c.id, "INVENTORY_PUSH", `inv:${c.id}`, { roomTypeIds: args.roomTypeIds, from: args.from, to: addDays(args.to, 0) }, new Date()),
    );
  }
  return ids;
}

export async function enqueueRateSync(args: { roomTypeIds?: string[]; from: DateStr; to: DateStr; channelId?: string }, client: DbOrTx = db) {
  const channels = (await pushableChannels(client)).filter((c) => !args.channelId || c.id === args.channelId);
  const ids: string[] = [];
  for (const c of channels) {
    ids.push(await upsertCoalesced(client, c.id, "RATE_PUSH", `rate:${c.id}`, { roomTypeIds: args.roomTypeIds ?? null, from: args.from, to: args.to }, new Date()));
  }
  return ids;
}

export async function enqueueRestrictionSync(args: { from: DateStr; to: DateStr; channelId?: string }, client: DbOrTx = db) {
  const channels = (await pushableChannels(client)).filter((c) => !args.channelId || c.id === args.channelId);
  const ids: string[] = [];
  for (const c of channels) {
    ids.push(await upsertCoalesced(client, c.id, "RESTRICTION_PUSH", `res:${c.id}`, { roomTypeIds: null, from: args.from, to: args.to }, new Date()));
  }
  return ids;
}

export async function enqueueReservationPull(channelId: string, client: DbOrTx = db) {
  const existing = await client.syncJob.findFirst({ where: { channelId, operation: "RESERVATION_PULL", status: { in: ["PENDING", "RUNNING"] } } });
  if (existing) return existing.id;
  const job = await client.syncJob.create({ data: { channelId, operation: "RESERVATION_PULL", dedupeKey: `pull:${channelId}` } });
  return job.id;
}
