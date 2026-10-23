"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/auth/action";
import {
  connectChannel,
  disconnectChannel,
  saveChannelConfiguration,
  testChannelConnection,
  upsertRatePlanMapping,
  upsertRoomMapping,
  deleteRatePlanMapping,
  deleteRoomMapping,
} from "@/server/services/channel.service";
import { enqueueFullSync, importExistingReservations, retryJob, runDueJobs } from "@/server/services/channel-sync.service";
import { retryInboundEvent } from "@/server/services/channel-inbound.service";
import { opt, str } from "./form";

function refresh() {
  revalidatePath("/admin/channels");
  revalidatePath("/admin/channels/mapping");
  revalidatePath("/admin/channels/sync-log");
  revalidatePath("/admin");
}

export async function saveChannelConfigAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    const credentials: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("cred:") && typeof v === "string") credentials[k.slice(5)] = v;
    }
    const result = await saveChannelConfiguration({
      channelId: str(formData, "channelId"),
      credentials: Object.keys(credentials).length ? credentials : undefined,
      hotelExternalId: opt(formData, "hotelExternalId") ?? null,
      rotateWebhookSecret: formData.get("rotateWebhookSecret") === "on",
      userId: user.id,
    });
    refresh();
    return result;
  });
}

export async function testChannelAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    const result = await testChannelConnection(str(formData, "channelId"), user.id);
    refresh();
    return result;
  });
}

export async function connectChannelAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    const result = await connectChannel(str(formData, "channelId"), user.id);
    refresh();
    return result;
  });
}

export async function disconnectChannelAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    await disconnectChannel(str(formData, "channelId"), user.id);
    refresh();
  });
}

export async function syncChannelAction(formData: FormData) {
  return adminAction("channels.manage", async () => {
    const result = await enqueueFullSync(str(formData, "channelId"));
    await runDueJobs(10);
    refresh();
    return result;
  });
}

export async function importReservationsAction(formData: FormData) {
  return adminAction("channels.manage", async () => {
    const result = await importExistingReservations(str(formData, "channelId"));
    refresh();
    return result;
  });
}

export async function retryJobAction(formData: FormData) {
  return adminAction("channels.manage", async () => {
    await retryJob(str(formData, "jobId"));
    refresh();
  });
}

export async function retryInboundAction(formData: FormData) {
  return adminAction("channels.manage", async () => {
    const result = await retryInboundEvent(str(formData, "eventId"));
    refresh();
    return result;
  });
}

export async function saveRoomMappingAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    await upsertRoomMapping({
      channelId: str(formData, "channelId"),
      roomTypeId: str(formData, "roomTypeId"),
      externalRoomId: str(formData, "externalRoomId"),
      externalRoomName: opt(formData, "externalRoomName"),
      userId: user.id,
    });
    refresh();
  });
}

export async function deleteRoomMappingAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    await deleteRoomMapping(str(formData, "id"), user.id);
    refresh();
  });
}

export async function saveRateMappingAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    await upsertRatePlanMapping({
      channelId: str(formData, "channelId"),
      ratePlanId: str(formData, "ratePlanId"),
      roomTypeId: opt(formData, "roomTypeId") ?? null,
      externalRatePlanId: str(formData, "externalRatePlanId"),
      externalRatePlanName: opt(formData, "externalRatePlanName"),
      userId: user.id,
    });
    refresh();
  });
}

export async function deleteRateMappingAction(formData: FormData) {
  return adminAction("channels.manage", async (user) => {
    await deleteRatePlanMapping(str(formData, "id"), user.id);
    refresh();
  });
}
