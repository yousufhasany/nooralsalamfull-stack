import { db } from "@/server/db/client";
import type { ChannelContext, ChannelCredentials } from "@/integrations/channels/types";
import { getChannelProvider } from "@/integrations/channels/registry";
import { AppError } from "@/lib/errors";
import { decryptJson, decryptSecret, encryptJson, encryptSecret, randomToken } from "@/server/security/crypto";
import { audit } from "./audit.service";

export async function buildChannelContext(channelId: string): Promise<ChannelContext> {
  const channel = await db.channel.findUnique({ where: { id: channelId }, include: { connection: true } });
  if (!channel) throw new AppError("NOT_FOUND", "Channel not found.");
  const c = channel.connection;
  return {
    channelId: channel.id,
    channelCode: channel.code,
    providerKey: channel.providerKey,
    credentials: decryptJson<ChannelCredentials>(c?.credentialsEnc),
    config: (c?.config as Record<string, unknown> | null) ?? null,
    hotelExternalId: c?.hotelExternalId ?? null,
    webhookSecret: c?.webhookSecretEnc ? decryptSecret(c.webhookSecretEnc) : null,
  };
}

/** Never returns secrets; only whether they are set. */
export async function listChannelsForAdmin() {
  const channels = await db.channel.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      connection: true,
      _count: { select: { roomMappings: true, ratePlanMappings: true, reservations: true, hotelReservations: true } },
    },
  });
  const failedJobs = await db.syncJob.groupBy({ by: ["channelId"], where: { status: "FAILED" }, _count: true });
  return channels.map((c) => {
    const provider = getChannelProvider(c.providerKey);
    const failed = failedJobs.find((f) => f.channelId === c.id)?._count ?? 0;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      source: c.source,
      isEnabled: c.isEnabled,
      provider: {
        key: provider.key,
        name: provider.displayName,
        isSimulation: provider.isSimulation,
        isImplemented: provider.isImplemented,
        requirements: provider.requirements,
        capabilities: provider.capabilities,
      },
      connection: c.connection
        ? {
            status: c.connection.status,
            hotelExternalId: c.connection.hotelExternalId,
            hasCredentials: !!c.connection.credentialsEnc,
            hasWebhookSecret: !!c.connection.webhookSecretEnc,
            isTestVerified: c.connection.isTestVerified,
            lastTestAt: c.connection.lastTestAt,
            lastTestOk: c.connection.lastTestOk,
            lastTestMessage: c.connection.lastTestMessage,
            lastSyncAt: c.connection.lastSyncAt,
            lastSuccessfulSyncAt: c.connection.lastSuccessfulSyncAt,
            lastError: c.connection.lastError,
            inventoryNeedsVerification: c.connection.inventoryNeedsVerification,
            connectedAt: c.connection.connectedAt,
          }
        : null,
      counts: {
        roomMappings: c._count.roomMappings,
        rateMappings: c._count.ratePlanMappings,
        reservations: c._count.hotelReservations,
      },
      failedJobs: failed,
    };
  });
}

async function ensureConnection(channelId: string) {
  return db.channelConnection.upsert({ where: { channelId }, create: { channelId }, update: {} });
}

export async function saveChannelConfiguration(args: {
  channelId: string;
  credentials?: ChannelCredentials;
  hotelExternalId?: string | null;
  config?: Record<string, unknown> | null;
  rotateWebhookSecret?: boolean;
  userId?: string | null;
}) {
  await ensureConnection(args.channelId);
  const data: Record<string, unknown> = {};
  if (args.credentials) {
    // Merge: blank values keep the previously stored secret.
    const existing = decryptJson<ChannelCredentials>((await db.channelConnection.findUnique({ where: { channelId: args.channelId } }))?.credentialsEnc) ?? {};
    const merged: ChannelCredentials = { ...existing };
    for (const [k, v] of Object.entries(args.credentials)) if (v !== "") merged[k] = v;
    data.credentialsEnc = encryptJson(merged);
  }
  if (args.hotelExternalId !== undefined) data.hotelExternalId = args.hotelExternalId;
  if (args.config !== undefined) data.config = args.config ?? undefined;
  let newSecret: string | null = null;
  if (args.rotateWebhookSecret) {
    newSecret = randomToken(32);
    data.webhookSecretEnc = encryptSecret(newSecret);
  }
  // Any configuration change invalidates the previous test result.
  data.isTestVerified = false;
  await db.channelConnection.update({ where: { channelId: args.channelId }, data });
  await audit({ userId: args.userId, action: "channel.configured", entity: "Channel", entityId: args.channelId, after: { credentialsChanged: !!args.credentials, hotelExternalId: args.hotelExternalId } });
  return { newWebhookSecret: newSecret };
}

async function recordSyncLog(channelId: string, operation: "CONNECTION_TEST", ok: boolean, message: string) {
  await db.channelSyncLog.create({
    data: { channelId, operation, status: ok ? "SUCCESS" : "FAILED", error: ok ? null : message, endedAt: new Date() },
  });
}

/**
 * Test a connection through the provider. A channel is only ever marked CONNECTED when the provider
 * itself reports success - never on the strength of saved credentials alone.
 */
export async function testChannelConnection(channelId: string, userId?: string | null) {
  const ctx = await buildChannelContext(channelId);
  const provider = getChannelProvider(ctx.providerKey);
  let result;
  try {
    result = await provider.testConnection(ctx);
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : "Connection test failed" };
  }
  await ensureConnection(channelId);
  await db.channelConnection.update({
    where: { channelId },
    data: {
      lastTestAt: new Date(),
      lastTestOk: result.ok,
      lastTestMessage: result.message.slice(0, 500),
      isTestVerified: result.ok,
      ...(result.ok
        ? { status: "CONNECTED", lastError: null, connectedAt: new Date() }
        : { status: "ERROR", lastError: result.message.slice(0, 500) }),
    },
  });
  await recordSyncLog(channelId, "CONNECTION_TEST", result.ok, result.message);
  await audit({ userId, action: "channel.tested", entity: "Channel", entityId: channelId, after: { ok: result.ok } });
  return result;
}

export async function connectChannel(channelId: string, userId?: string | null) {
  const ctx = await buildChannelContext(channelId);
  const provider = getChannelProvider(ctx.providerKey);
  await ensureConnection(channelId);
  const res = await provider.connect(ctx);
  if (!res.ok) {
    await db.channelConnection.update({
      where: { channelId },
      data: { status: "ERROR", lastError: res.message.slice(0, 500), isTestVerified: false },
    });
    await audit({ userId, action: "channel.connect_failed", entity: "Channel", entityId: channelId, after: { message: res.message } });
    return { ok: false as const, message: res.message };
  }
  if (res.hotelExternalId) {
    await db.channelConnection.update({ where: { channelId }, data: { hotelExternalId: res.hotelExternalId } });
  }
  const test = await testChannelConnection(channelId, userId);
  return { ok: test.ok, message: test.message };
}

export async function disconnectChannel(channelId: string, userId?: string | null) {
  const ctx = await buildChannelContext(channelId);
  const provider = getChannelProvider(ctx.providerKey);
  try {
    await provider.disconnect(ctx);
  } catch (e) {
    console.error("[channel] disconnect error", e);
  }
  await ensureConnection(channelId);
  await db.channelConnection.update({
    where: { channelId },
    data: { status: "DISCONNECTED", isTestVerified: false, inventoryNeedsVerification: false },
  });
  await db.syncJob.updateMany({ where: { channelId, status: "PENDING" }, data: { status: "FAILED", lastError: "Channel disconnected", finishedAt: new Date() } });
  await audit({ userId, action: "channel.disconnected", entity: "Channel", entityId: channelId });
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

export async function upsertRoomMapping(args: {
  channelId: string;
  roomTypeId: string;
  externalRoomId: string;
  externalRoomName?: string;
  userId?: string | null;
}) {
  const externalRoomId = args.externalRoomId.trim();
  if (!externalRoomId) throw new AppError("INVALID_INPUT", "External room ID is required.");
  const m = await db.channelRoomMapping.upsert({
    where: { channelId_externalRoomId: { channelId: args.channelId, externalRoomId } },
    create: { channelId: args.channelId, roomTypeId: args.roomTypeId, externalRoomId, externalRoomName: args.externalRoomName ?? "" },
    update: { roomTypeId: args.roomTypeId, externalRoomName: args.externalRoomName ?? "", isActive: true },
  });
  await audit({ userId: args.userId, action: "channel.room_mapped", entity: "ChannelRoomMapping", entityId: m.id, after: m });
  return m;
}

export async function deleteRoomMapping(id: string, userId?: string | null) {
  await db.channelRoomMapping.delete({ where: { id } });
  await audit({ userId, action: "channel.room_unmapped", entity: "ChannelRoomMapping", entityId: id });
}

export async function upsertRatePlanMapping(args: {
  channelId: string;
  ratePlanId: string;
  roomTypeId?: string | null;
  externalRatePlanId: string;
  externalRatePlanName?: string;
  userId?: string | null;
}) {
  const externalRatePlanId = args.externalRatePlanId.trim();
  if (!externalRatePlanId) throw new AppError("INVALID_INPUT", "External rate plan ID is required.");
  const m = await db.channelRatePlanMapping.upsert({
    where: { channelId_externalRatePlanId: { channelId: args.channelId, externalRatePlanId } },
    create: {
      channelId: args.channelId,
      ratePlanId: args.ratePlanId,
      roomTypeId: args.roomTypeId ?? null,
      externalRatePlanId,
      externalRatePlanName: args.externalRatePlanName ?? "",
    },
    update: { ratePlanId: args.ratePlanId, roomTypeId: args.roomTypeId ?? null, externalRatePlanName: args.externalRatePlanName ?? "", isActive: true },
  });
  await audit({ userId: args.userId, action: "channel.rate_mapped", entity: "ChannelRatePlanMapping", entityId: m.id, after: m });
  return m;
}

export async function deleteRatePlanMapping(id: string, userId?: string | null) {
  await db.channelRatePlanMapping.delete({ where: { id } });
  await audit({ userId, action: "channel.rate_unmapped", entity: "ChannelRatePlanMapping", entityId: id });
}
