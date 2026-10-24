"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAction } from "@/server/auth/action";
import { AppError } from "@/lib/errors";
import { openRoomCleaning, reviewCleaning, savePhotoCategory, saveSupplyLine, startCleaning, submitCleaning, uploadCleaningPhoto } from "@/server/services/housekeeping-clean.service";
import { amount, bool, opt, str } from "./form";
import { flash } from "./flash";

function refresh(taskId?: string) {
  revalidatePath("/admin/housekeeping");
  revalidatePath("/admin/housekeeping/inspections");
  if (taskId) revalidatePath(`/admin/housekeeping/tasks/${taskId}`);
}

export async function openRoomCleaningAction(formData: FormData) {
  const id = await adminAction("housekeeping.update", async (user) => {
    const taskId = await openRoomCleaning(str(formData, "roomId"), user.id, user.permissions.includes("housekeeping.inspect"));
    refresh(taskId);
    return taskId;
  });
  if (id.ok) {
    await flash("Cleaning task opened.");
    redirect(`/admin/housekeeping/tasks/${id.data}`);
  }
  return id;
}

export async function startCleaningAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    const id = str(formData, "taskId");
    await startCleaning(id, user.id, user.permissions.includes("housekeeping.inspect"));
    refresh(id);
  });
}

export async function uploadCleaningPhotoAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new AppError("INVALID_INPUT", "Choose a photograph.");
    const id = str(formData, "taskId");
    await uploadCleaningPhoto({
      taskId: id,
      categoryId: str(formData, "categoryId"),
      userId: user.id,
      manage: user.permissions.includes("housekeeping.inspect"),
      bytes: Buffer.from(await file.arrayBuffer()),
      note: opt(formData, "note"),
    });
    refresh(id);
  });
}

export async function saveSupplyAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    const id = str(formData, "taskId");
    await saveSupplyLine({ taskId: id, itemId: str(formData, "itemId"), quantity: amount(formData, "quantity"), userId: user.id, manage: user.permissions.includes("housekeeping.inspect") });
    refresh(id);
  });
}

export async function submitCleaningAction(formData: FormData) {
  return adminAction("housekeeping.update", async (user) => {
    const id = str(formData, "taskId");
    await submitCleaning(id, user.id, user.permissions.includes("housekeeping.inspect"), opt(formData, "note"));
    refresh(id);
  });
}

export async function reviewCleaningAction(formData: FormData) {
  return adminAction("housekeeping.inspect", async (user) => {
    const id = str(formData, "taskId");
    await reviewCleaning({ taskId: id, userId: user.id, approve: str(formData, "decision") === "approve", reason: opt(formData, "reason"), areas: opt(formData, "areas") });
    refresh(id);
  });
}

export async function savePhotoCategoryAction(formData: FormData) {
  return adminAction("housekeeping.inspect", async (user) => {
    await savePhotoCategory(str(formData, "id"), { nameEn: str(formData, "nameEn"), nameAr: str(formData, "nameAr"), nameBn: str(formData, "nameBn") || str(formData, "nameEn"), mandatory: bool(formData, "mandatory"), isActive: bool(formData, "isActive") }, user.id);
    refresh();
  });
}
