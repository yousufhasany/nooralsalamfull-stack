"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAction } from "@/server/auth/action";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { createRoom, deleteRoom, setRoomStatus, updateRoom } from "@/server/services/room.service";
import { startCleaning } from "@/server/services/housekeeping-clean.service";
import { saveUser } from "@/server/services/user.service";
import { saveFacility, saveGalleryImage, deleteFacility, deleteGalleryImage, saveHotelProfile } from "@/server/services/content.service";
import {
  addRoomImage,
  archiveRoomType,
  deletePricingRule,
  deleteRoomRate,
  removeRoomImage,
  savePricingRule,
  savePromotion,
  saveRatePlan,
  saveRoomRate,
  saveRoomType,
} from "@/server/services/catalog-admin.service";
import { saveSettings, getHotel, type SettingGroup } from "@/server/services/settings.service";
import { updateGuest, revealGuestId, deleteGuest } from "@/server/services/guest.service";
import type { RoomStatus } from "@/generated/prisma/enums";
import { savePublicImage } from "@/server/storage/public-files";
import { bool, list, obj, opt, str } from "./form";
import { audit, deleteAuditHistory } from "@/server/services/audit.service";

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export async function saveRoomTypeAction(formData: FormData) {
  return adminAction("roomtypes.manage", async (user) => {
    const id = opt(formData, "id") ?? null;
    await saveRoomType(id, { ...obj(formData), amenityIds: list(formData, "amenityIds"), isActive: bool(formData, "isActive") }, user.id);
    refresh("/admin/rooms/types");
  });
}

export async function archiveRoomTypeAction(formData: FormData) {
  return adminAction("roomtypes.manage", async (user) => {
    await archiveRoomType(str(formData, "id"), user.id);
    refresh("/admin/rooms/types");
  });
}

async function uploadedImageUrl(formData: FormData, folder: "rooms" | "gallery" | "hotel"): Promise<string | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  return savePublicImage(Buffer.from(await file.arrayBuffer()), folder);
}

function refreshPublicPhotos() {
  refresh("/admin/rooms/types", "/admin/content", "/admin/settings");
  for (const path of ["/[locale]/rooms", "/[locale]/rooms/[slug]", "/[locale]/gallery", "/[locale]"]) {
    revalidatePath(path, "page");
  }
}

export async function addRoomImageAction(formData: FormData) {
  return adminAction("roomtypes.manage", async (user) => {
    const uploaded = await uploadedImageUrl(formData, "rooms");
    const url = uploaded ?? opt(formData, "url");
    if (!url) throw new AppError("INVALID_INPUT", "Choose a photograph or paste an image link.");
    await addRoomImage(str(formData, "roomTypeId"), url, { en: str(formData, "altEn"), ar: str(formData, "altAr"), bn: str(formData, "altBn") }, user.id);
    refreshPublicPhotos();
  });
}

export async function removeRoomImageAction(formData: FormData) {
  return adminAction("roomtypes.manage", async (user) => {
    await removeRoomImage(str(formData, "id"), user.id);
    refreshPublicPhotos();
  });
}

export async function createRoomAction(formData: FormData) {
  return adminAction("rooms.manage", async (user) => {
    await createRoom({ number: str(formData, "number"), floor: Number(str(formData, "floor") || 0), roomTypeId: str(formData, "roomTypeId"), notes: opt(formData, "notes") ?? "", isActive: true }, user.id);
    refresh("/admin/rooms", "/admin/housekeeping");
  });
}

export async function updateRoomAction(formData: FormData) {
  return adminAction("rooms.manage", async (user) => {
    await updateRoom(str(formData, "id"), { number: str(formData, "number"), floor: Number(str(formData, "floor") || 0), roomTypeId: str(formData, "roomTypeId"), notes: opt(formData, "notes") ?? "", isActive: bool(formData, "isActive") }, user.id);
    refresh("/admin/rooms", "/admin/housekeeping");
  });
}

export async function deleteRoomAction(formData: FormData) {
  return adminAction("rooms.manage", async (user) => {
    await deleteRoom(str(formData, "id"), user.id);
    refresh("/admin/rooms");
  });
}

export async function setRoomStatusAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    await setRoomStatus({ roomId: str(formData, "roomId"), status: str(formData, "status") as RoomStatus, userId: user.id, note: opt(formData, "note") ?? "" });
    refresh("/admin/housekeeping", "/admin/rooms", "/admin");
  });
}

export async function saveRatePlanAction(formData: FormData) {
  return adminAction("rates.manage", async (user) => {
    await saveRatePlan(opt(formData, "id") ?? null, { ...obj(formData), isRefundable: bool(formData, "isRefundable"), isPublic: bool(formData, "isPublic"), isActive: bool(formData, "isActive") }, user.id);
    refresh("/admin/rates");
  });
}

export async function saveRoomRateAction(formData: FormData) {
  return adminAction("rates.manage", async (user) => {
    await saveRoomRate(opt(formData, "id") ?? null, { ...obj(formData), isActive: bool(formData, "isActive"), daysOfWeek: list(formData, "daysOfWeek").map(Number) }, user.id);
    refresh("/admin/rates");
  });
}

export async function deleteRoomRateAction(formData: FormData) {
  return adminAction("rates.manage", async (user) => {
    await deleteRoomRate(str(formData, "id"), user.id);
    refresh("/admin/rates");
  });
}

export async function savePricingRuleAction(formData: FormData) {
  return adminAction("rates.manage", async (user) => {
    await savePricingRule(opt(formData, "id") ?? null, { ...obj(formData), isActive: bool(formData, "isActive") }, user.id);
    refresh("/admin/rates");
  });
}

export async function deletePricingRuleAction(formData: FormData) {
  return adminAction("rates.manage", async (user) => {
    await deletePricingRule(str(formData, "id"), user.id);
    refresh("/admin/rates");
  });
}

export async function savePromotionAction(formData: FormData) {
  return adminAction("promotions.manage", async (user) => {
    await savePromotion(opt(formData, "id") ?? null, { ...obj(formData), isActive: bool(formData, "isActive"), roomTypeIds: list(formData, "roomTypeIds") }, user.id);
    refresh("/admin/rates");
  });
}

export async function saveUserAction(formData: FormData) {
  return adminAction("users.manage", async (user) => {
    await saveUser(opt(formData, "id") ?? null, { ...obj(formData), isActive: bool(formData, "isActive"), password: opt(formData, "password") }, user.id);
    refresh("/admin/users");
  });
}

export async function saveFacilityAction(formData: FormData) {
  return adminAction("content.manage", async (user) => {
    await saveFacility(opt(formData, "id") ?? null, { ...obj(formData), isActive: bool(formData, "isActive") }, user.id);
    refresh("/admin/content");
  });
}

export async function deleteFacilityAction(formData: FormData) {
  return adminAction("content.manage", async (user) => {
    await deleteFacility(str(formData, "id"), user.id);
    refresh("/admin/content");
  });
}

export async function saveGalleryAction(formData: FormData) {
  return adminAction("content.manage", async (user) => {
    const uploaded = await uploadedImageUrl(formData, "gallery");
    const raw: Record<string, string | boolean> = { ...obj(formData), isActive: bool(formData, "isActive") };
    if (uploaded) raw.url = uploaded;
    if (!String(raw.url ?? "").trim()) throw new AppError("INVALID_INPUT", "Choose a photograph or paste an image link.");
    await saveGalleryImage(opt(formData, "id") ?? null, raw, user.id);
    refreshPublicPhotos();
  });
}

export async function deleteGalleryAction(formData: FormData) {
  return adminAction("content.manage", async (user) => {
    await deleteGalleryImage(str(formData, "id"), user.id);
    refresh("/admin/content");
  });
}

export async function saveHotelProfileAction(formData: FormData) {
  return adminAction("settings.manage", async (user) => {
    await saveHotelProfile(obj(formData), user.id);
    refresh("/admin/settings", "/admin/content");
  });
}

export async function saveSettingsGroupAction(formData: FormData) {
  return adminAction("settings.manage", async () => {
    const hotel = await getHotel();
    const group = str(formData, "group") as SettingGroup;
    const raw = obj(formData);
    delete raw.group;
    const parsed: Record<string, unknown> = { ...raw };
    const numeric = new Set([
      "minStay",
      "maxStay",
      "maxRoomsPerBooking",
      "maxAdvanceDays",
      "holdMinutes",
      "cancellationFreeDays",
    ]);
    for (const [k, v] of Object.entries(raw)) {
      if (v === "on" || v === "true") parsed[k] = true;
      if (v === "off" || v === "false") parsed[k] = false;
      if (k === "weekendDays" || k === "idTypes") parsed[k] = list(formData, k);
      if (k === "rules") {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = [];
        }
      }
      if (numeric.has(k) && v !== "") parsed[k] = Number(v);
    }
    for (const key of Object.keys(raw)) {
      if (key.endsWith("__bool")) {
        const name = key.replace(/__bool$/, "");
        parsed[name] = bool(formData, name);
        delete parsed[key];
      }
    }
    await saveSettings(hotel.id, group, parsed);
    refresh("/admin/settings");
  });
}

export async function updateGuestAction(formData: FormData) {
  return adminAction("guests.edit", async () => {
    const id = str(formData, "guestId");
    await updateGuest(id, {
      firstName: str(formData, "firstName"),
      lastName: str(formData, "lastName"),
      email: opt(formData, "email") ?? "",
      phone: opt(formData, "phone") ?? "",
      nationality: opt(formData, "nationality") ?? "",
      notes: opt(formData, "notes") ?? "",
    });
    refresh("/admin/guests", `/admin/guests/${id}`);
  });
}

export async function deleteGuestAction(formData: FormData) {
  const result = await adminAction("guests.delete", async (user) => {
    const id = str(formData, "guestId");
    await deleteGuest(id, user.id);
    refresh("/admin/guests", `/admin/guests/${id}`, "/admin/history");
  });
  if (result.ok) redirect("/admin/guests");
  return result;
}

export async function revealGuestIdAction(formData: FormData) {
  return adminAction("guests.view_id", async () => revealGuestId(str(formData, "guestId")));
}

export async function deleteAuditHistoryAction(formData: FormData) {
  return adminAction("audit.delete", async () => {
    await deleteAuditHistory(str(formData, "id"));
    refresh("/admin/history");
  });
}

export async function markMessageReadAction(formData: FormData) {
  return adminAction("messages.view", async (user) => {
    const id = str(formData, "id");
    const before = await db.contactMessage.findUnique({ where: { id }, select: { isRead: true } });
    await db.contactMessage.update({ where: { id }, data: { isRead: true } });
    await audit({ userId: user.id, action: "MESSAGE_READ", entity: "ContactMessage", entityId: id, before, after: { isRead: true } });
    refresh("/admin/messages", "/admin", "/admin/history");
  });
}

export async function startHousekeepingTaskAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    const id = str(formData, "id") || str(formData, "taskId");
    if (!id) throw new AppError("INVALID_INPUT", "Choose a task.");
    await startCleaning(id, user.id, user.permissions.includes("housekeeping.inspect"));
    refresh("/admin/housekeeping", `/admin/housekeeping/tasks/${id}`);
  });
}

export async function completeHousekeepingTaskAction(formData: FormData) {
  return adminAction("housekeeping.update", async () => {
    void formData;
    throw new AppError("INVALID_STATE", "Upload the required photographs and submit the room for inspection. A manager must approve it before the room can be marked ready.");
  });
}
