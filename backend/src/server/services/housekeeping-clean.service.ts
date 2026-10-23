import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { D } from "@/lib/money";
import { deletePrivateFile, detectImage, photoMaxBytes, photoRetentionDays, putPrivateFile } from "@/server/storage/private-files";
import { audit } from "./audit.service";
import { issueStock } from "./inventory.service";
import { setRoomStatus } from "./room.service";

async function loadTask(id: string) {
  const task = await db.housekeepingTask.findUnique({
    where: { id },
    include: { room: true, photos: true, supplyLines: true, inspections: { orderBy: { attempt: "desc" } } },
  });
  if (!task) throw new AppError("NOT_FOUND", "Cleaning task not found.");
  return task;
}

function assertAssignee(task: { assignedToId: string | null }, userId: string, manage: boolean) {
  if (manage) return;
  if (task.assignedToId && task.assignedToId !== userId) {
    throw new AppError("FORBIDDEN", "This cleaning task is assigned to someone else.");
  }
}

export function canViewCleaningPhoto(args: { userId: string; inspect: boolean; assignedToId: string | null }) {
  if (args.inspect) return true;
  return !args.assignedToId || args.assignedToId === args.userId;
}

function photoStored(storageKey: string) {
  return !storageKey.startsWith("pending/");
}

/** Open the cleaning task for a room, creating and starting one when the room does not already have one. */
export async function openRoomCleaning(roomId: string, userId: string, manage = false) {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room || room.deletedAt) throw new AppError("NOT_FOUND", "Room not found.");
  if (["MAINTENANCE", "OUT_OF_ORDER"].includes(room.status)) {
    throw new AppError("INVALID_STATE", "This room is out of service. Clear that status before cleaning.");
  }
  const existing = await db.housekeepingTask.findFirst({
    where: { roomId, status: { in: ["OPEN", "IN_PROGRESS", "REJECTED", "AWAITING_INSPECTION"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (!manage && existing.assignedToId && existing.assignedToId !== userId) {
      throw new AppError("FORBIDDEN", "This cleaning task is assigned to someone else.");
    }
    if (existing.status === "OPEN") await startCleaning(existing.id, userId, manage);
    return existing.id;
  }
  const created = await db.housekeepingTask.create({
    data: { roomId, type: "CLEAN", assignedToId: userId, notes: "" },
  });
  await startCleaning(created.id, userId, manage);
  return created.id;
}

export async function startCleaning(taskId: string, userId: string, manage = false) {
  const task = await loadTask(taskId);
  assertAssignee(task, userId, manage);
  if (!["OPEN", "REJECTED"].includes(task.status)) throw new AppError("INVALID_STATE", "This task cannot be started.");
  if (["MAINTENANCE", "OUT_OF_ORDER"].includes(task.room.status)) {
    throw new AppError("INVALID_STATE", "This room is out of service. Clear that status before cleaning.");
  }
  await db.$transaction(async (tx) => {
    await tx.housekeepingTask.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", assignedToId: task.assignedToId ?? userId, startedAt: task.startedAt ?? new Date() },
    });
    if (task.room.status === "DIRTY") {
      await setRoomStatus({ roomId: task.roomId, status: "CLEANING", userId, system: true, note: "Cleaning started" }, tx);
    }
  });
  await audit({ userId, action: "housekeeping.started", entity: "HousekeepingTask", entityId: taskId });
}

export async function uploadCleaningPhoto(args: { taskId: string; categoryId: string; userId: string; manage: boolean; bytes: Buffer; note?: string }) {
  if (args.bytes.length === 0) throw new AppError("INVALID_INPUT", "Choose a photograph.");
  if (args.bytes.length > photoMaxBytes()) throw new AppError("INVALID_INPUT", "This photograph is larger than the allowed size.");
  const kind = detectImage(args.bytes);
  if (!kind) throw new AppError("INVALID_INPUT", "Upload a JPEG, PNG, or WebP photograph.");
  const task = await loadTask(args.taskId);
  assertAssignee(task, args.userId, args.manage);
  if (task.status === "OPEN") {
    await startCleaning(task.id, args.userId, args.manage);
  } else if (!["IN_PROGRESS", "REJECTED"].includes(task.status)) {
    throw new AppError("INVALID_STATE", "Photographs can be added while cleaning is in progress or after a rejection.");
  }
  const category = await db.housekeepingPhotoCategory.findFirst({ where: { id: args.categoryId, isActive: true } });
  if (!category) throw new AppError("NOT_FOUND", "Photo category not found.");
  const photo = await db.housekeepingPhoto.create({
    data: {
      taskId: task.id,
      categoryId: category.id,
      uploadedById: args.userId,
      storageKey: `pending/${randomUUID()}`,
      mimeType: kind.mime,
      byteSize: args.bytes.length,
      note: (args.note ?? "").slice(0, 300),
    },
  });
  const key = `housekeeping/${task.room.hotelId}/${task.id}/${photo.id}.${kind.ext}`;
  try {
    await putPrivateFile(key, args.bytes);
    await db.housekeepingPhoto.update({ where: { id: photo.id }, data: { storageKey: key } });
  } catch {
    await deletePrivateFile(key);
    await db.housekeepingPhoto.delete({ where: { id: photo.id } }).catch(() => undefined);
    throw new AppError("INTERNAL", "The photograph could not be stored. Try again.");
  }
  await audit({ userId: args.userId, action: "housekeeping.photo_uploaded", entity: "HousekeepingPhoto", entityId: photo.id, after: { taskId: task.id, category: category.code } });
  return photo.id;
}

export async function saveSupplyLine(args: { taskId: string; itemId: string; quantity: string; userId: string; manage: boolean }) {
  const task = await loadTask(args.taskId);
  assertAssignee(task, args.userId, args.manage);
  if (task.suppliesDeducted) throw new AppError("INVALID_STATE", "Supplies for this task were already posted. Use a stock adjustment to correct them.");
  if (!["IN_PROGRESS", "REJECTED", "OPEN"].includes(task.status)) throw new AppError("INVALID_STATE", "Supplies can no longer be edited.");
  const qty = D(args.quantity);
  if (qty.lte(0)) {
    await db.housekeepingSupplyLine.deleteMany({ where: { taskId: task.id, itemId: args.itemId } });
    return;
  }
  await db.housekeepingSupplyLine.upsert({
    where: { taskId_itemId: { taskId: task.id, itemId: args.itemId } },
    update: { quantity: qty.toFixed(3) },
    create: { taskId: task.id, itemId: args.itemId, quantity: qty.toFixed(3) },
  });
}

export async function submitCleaning(taskId: string, userId: string, manage: boolean, note?: string) {
  await db.$transaction(async (tx) => {
    const task = await tx.housekeepingTask.findUnique({
      where: { id: taskId },
      include: { room: true, photos: true, supplyLines: true, inspections: true },
    });
    if (!task) throw new AppError("NOT_FOUND", "Cleaning task not found.");
    assertAssignee(task, userId, manage);
    if (!["IN_PROGRESS", "REJECTED"].includes(task.status)) throw new AppError("INVALID_STATE", "Start the cleaning before submitting it.");
    const required = await tx.housekeepingPhotoCategory.findMany({ where: { hotelId: task.room.hotelId, isActive: true, mandatory: true } });
    const missing = required.filter((c) => !task.photos.some((p) => p.categoryId === c.id && photoStored(p.storageKey)));
    if (missing.length > 0) {
      throw new AppError("INVALID_INPUT", `Upload a photograph for: ${missing.map((m) => m.nameEn).join(", ")}.`);
    }
    if (!task.suppliesDeducted) {
      for (const line of task.supplyLines) {
        const item = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
        if (!item) throw new AppError("NOT_FOUND", "A supply item no longer exists.");
        const movement = await issueStock(tx, {
          itemId: item.id,
          locationId: item.locationId,
          quantity: line.quantity,
          type: "CONSUMPTION",
          reference: `housekeeping:${task.id}`,
          note: `Room ${task.room.number}`,
          userId,
        });
        await tx.inventoryConsumption.create({ data: { taskId: task.id, itemId: item.id, movementId: movement.id, quantity: line.quantity } });
      }
    }
    const attempt = task.inspections.length + 1;
    await tx.housekeepingInspection.create({
      data: { taskId: task.id, attempt, status: "PENDING", submittedById: userId },
    });
    await tx.housekeepingTask.update({
      where: { id: task.id },
      data: {
        status: "AWAITING_INSPECTION",
        submittedAt: new Date(),
        suppliesDeducted: true,
        assignedToId: task.assignedToId ?? userId,
        ...(note?.trim() ? { notes: note.trim().slice(0, 1000) } : {}),
      },
    });
  });
  await audit({ userId, action: "housekeeping.submitted", entity: "HousekeepingTask", entityId: taskId });
}

export async function reviewCleaning(args: { taskId: string; userId: string; approve: boolean; reason?: string; areas?: string }) {
  const task = await db.$transaction(async (tx) => {
    const current = await tx.housekeepingTask.findUnique({ where: { id: args.taskId }, include: { room: true, photos: true, inspections: { orderBy: { attempt: "desc" } } } });
    if (!current || current.status !== "AWAITING_INSPECTION") throw new AppError("INVALID_STATE", "This task is not waiting for inspection.");
    const pending = current.inspections.find((i) => i.status === "PENDING");
    if (!pending) throw new AppError("INVALID_STATE", "No inspection submission was found.");
    if (!args.approve && !args.reason?.trim()) throw new AppError("INVALID_INPUT", "A rejection reason is required.");
    if (args.approve) {
      const required = await tx.housekeepingPhotoCategory.findMany({ where: { hotelId: current.room.hotelId, isActive: true, mandatory: true } });
      const missing = required.filter((c) => !current.photos.some((p) => p.categoryId === c.id && photoStored(p.storageKey)));
      if (missing.length > 0) throw new AppError("INVALID_STATE", "Required photographs are missing. Reject the task instead.");
    }
    await tx.housekeepingInspection.update({
      where: { id: pending.id },
      data: { status: args.approve ? "APPROVED" : "REJECTED", reviewedById: args.userId, reviewedAt: new Date(), reason: args.reason?.trim() ?? "", areas: args.areas?.trim() ?? "" },
    });
    await tx.housekeepingTask.update({
      where: { id: current.id },
      data: args.approve ? { status: "COMPLETED", completedAt: new Date() } : { status: "REJECTED" },
    });
    if (args.approve) {
      await setRoomStatus({ roomId: current.roomId, status: "AVAILABLE", userId: args.userId, inspectionApproved: true, note: "Housekeeping inspection approved" }, tx);
    }
    await tx.notificationLog.create({
      data: {
        event: args.approve ? "housekeeping.approved" : "housekeeping.rejected",
        channel: "EMAIL",
        recipient: current.assignedToId ?? "housekeeping",
        subject: args.approve ? `Room ${current.room.number} approved` : `Room ${current.room.number} needs recleaning`,
        body: args.reason?.trim() || "Inspection recorded.",
        status: "SKIPPED",
        error: "No outbound provider is configured. The inspection is recorded for the assigned employee in the task.",
        referenceId: current.id,
      },
    });
    return current;
  });
  await audit({
    userId: args.userId,
    action: args.approve ? "housekeeping.approved" : "housekeeping.rejected",
    entity: "HousekeepingTask",
    entityId: args.taskId,
    after: { reason: args.reason ?? "", roomStatus: task.room.status },
  });
}

export async function savePhotoCategory(id: string, data: { nameEn: string; nameAr: string; nameBn: string; mandatory: boolean; isActive: boolean }, userId: string) {
  await db.housekeepingPhotoCategory.update({ where: { id }, data });
  await audit({ userId, action: "housekeeping.photo_category_updated", entity: "HousekeepingPhotoCategory", entityId: id, after: data });
}

/** Deletes photograph files older than HOUSEKEEPING_PHOTO_RETENTION_DAYS. Inspection rows stay. */
export async function purgeExpiredHousekeepingPhotos() {
  const days = photoRetentionDays();
  if (days === 0) return { deleted: 0 };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const old = await db.housekeepingPhoto.findMany({ where: { createdAt: { lt: cutoff } }, take: 200 });
  for (const photo of old) {
    if (photoStored(photo.storageKey)) await deletePrivateFile(photo.storageKey);
    await db.housekeepingPhoto.delete({ where: { id: photo.id } });
  }
  return { deleted: old.length };
}
