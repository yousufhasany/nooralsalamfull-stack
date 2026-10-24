"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/auth/action";
import { AppError } from "@/lib/errors";
import {
  advanceTransfer,
  approvePurchaseOrder,
  archiveItem,
  createPurchaseOrder,
  createTransfer,
  decideAdjustment,
  postIssue,
  postReceipt,
  receivePurchaseOrder,
  recordCleaningUse,
  requestAdjustment,
  saveCategory,
  saveItem,
  saveItemImage,
  saveLocation,
  saveSimpleInventory,
  saveSupplier,
} from "@/server/services/inventory.service";
import { amount, bool, opt, str } from "./form";

function refresh() {
  revalidatePath("/admin/inventory", "layout");
}

export async function recordCleaningUseAction(formData: FormData) {
  return adminAction("inventory.issue", async (user) => {
    await recordCleaningUse({ itemId: str(formData, "itemId"), quantity: amount(formData, "quantity"), userId: user.id });
    refresh();
  });
}

export async function saveSimpleInventoryAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    await saveSimpleInventory({
      date: str(formData, "date"),
      name: str(formData, "name"),
      quantity: amount(formData, "quantity"),
      price: amount(formData, "price"),
      userId: user.id,
    });
    refresh();
  });
}

export async function saveItemAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    await saveItem(opt(formData, "id") ?? null, {
      categoryId: str(formData, "categoryId"),
      locationId: str(formData, "locationId"),
      supplierId: opt(formData, "supplierId") ?? "",
      sku: str(formData, "sku"),
      barcode: opt(formData, "barcode") ?? "",
      nameEn: str(formData, "nameEn"),
      nameAr: str(formData, "nameAr"),
      description: opt(formData, "description") ?? "",
      unit: str(formData, "unit"),
      minQty: (amount(formData, "minQty") || "0"),
      reorderQty: (amount(formData, "reorderQty") || "0"),
      maxQty: amount(formData, "maxQty"),
      unitCost: (amount(formData, "unitCost") || "0"),
      batchNumber: opt(formData, "batchNumber") ?? "",
      expiryDate: opt(formData, "expiryDate") ?? "",
      isActive: bool(formData, "isActive"),
    }, user.id);
    refresh();
  });
}

export async function uploadItemImageAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new AppError("INVALID_INPUT", "Choose an image.");
    await saveItemImage(str(formData, "itemId"), Buffer.from(await file.arrayBuffer()), user.id);
    refresh();
  });
}

export async function archiveItemAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    await archiveItem(str(formData, "id"), user.id);
    refresh();
  });
}

export async function saveCategoryAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    await saveCategory(opt(formData, "id") ?? null, { code: str(formData, "code"), nameEn: str(formData, "nameEn"), nameAr: str(formData, "nameAr"), nameBn: str(formData, "nameBn") || str(formData, "nameEn") }, user.id);
    refresh();
  });
}

export async function saveLocationAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    const kind = str(formData, "kind");
    if (kind !== "MAIN" && kind !== "FLOOR" && kind !== "DEPARTMENT") throw new AppError("INVALID_INPUT", "Choose a location type.");
    await saveLocation({ code: str(formData, "code"), nameEn: str(formData, "nameEn"), nameAr: str(formData, "nameAr"), kind }, user.id);
    refresh();
  });
}

export async function saveSupplierAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    await saveSupplier(opt(formData, "id") ?? null, { name: str(formData, "name"), contactName: opt(formData, "contactName"), phone: opt(formData, "phone"), email: opt(formData, "email"), address: opt(formData, "address"), notes: opt(formData, "notes"), isActive: formData.has("id") ? bool(formData, "isActive") : true }, user.id);
    refresh();
  });
}

export async function receiveStockAction(formData: FormData) {
  return adminAction("inventory.receive", async (user) => {
    await postReceipt({ itemId: str(formData, "itemId"), quantity: amount(formData, "quantity"), unitCost: amount(formData, "unitCost"), supplierNote: opt(formData, "note"), reference: opt(formData, "reference"), userId: user.id });
    refresh();
  });
}

export async function issueStockAction(formData: FormData) {
  return adminAction("inventory.issue", async (user) => {
    await postIssue({ itemId: str(formData, "itemId"), quantity: amount(formData, "quantity"), department: str(formData, "department"), reason: str(formData, "reason"), userId: user.id });
    refresh();
  });
}

export async function createPurchaseOrderAction(formData: FormData) {
  return adminAction("inventory.manage", async (user) => {
    const itemId = str(formData, "itemId");
    await createPurchaseOrder({ supplierId: str(formData, "supplierId"), expectedDate: opt(formData, "expectedDate"), lines: [{ itemId, quantity: amount(formData, "quantity"), unitCost: amount(formData, "unitCost") }], userId: user.id });
    refresh();
  });
}

export async function approvePurchaseOrderAction(formData: FormData) {
  return adminAction("inventory.approve", async (user) => {
    await approvePurchaseOrder(str(formData, "id"), user.id);
    refresh();
  });
}

export async function receivePurchaseOrderAction(formData: FormData) {
  return adminAction("inventory.receive", async (user) => {
    await receivePurchaseOrder(str(formData, "id"), user.id);
    refresh();
  });
}

export async function createTransferAction(formData: FormData) {
  return adminAction("inventory.transfer", async (user) => {
    await createTransfer({ fromLocationId: str(formData, "fromLocationId"), toLocationId: str(formData, "toLocationId"), lines: [{ itemId: str(formData, "itemId"), quantity: amount(formData, "quantity") }], notes: opt(formData, "notes"), userId: user.id });
    refresh();
  });
}

export async function advanceTransferAction(formData: FormData) {
  return adminAction("inventory.transfer", async (user) => {
    const action = str(formData, "step");
    if (action !== "approve" && action !== "dispatch" && action !== "receive" && action !== "cancel") throw new AppError("INVALID_INPUT", "Unknown transfer step.");
    if (action === "approve" && !user.permissions.includes("inventory.approve")) throw new AppError("FORBIDDEN", "You cannot approve transfers.");
    await advanceTransfer(str(formData, "id"), action, user.id);
    refresh();
  });
}

export async function requestAdjustmentAction(formData: FormData) {
  return adminAction("inventory.adjust", async (user) => {
    await requestAdjustment({ itemId: str(formData, "itemId"), quantity: amount(formData, "quantity"), reason: str(formData, "reason"), userId: user.id });
    refresh();
  });
}

export async function decideAdjustmentAction(formData: FormData) {
  return adminAction("inventory.approve", async (user) => {
    await decideAdjustment(str(formData, "id"), str(formData, "decision") === "approve", user.id);
    refresh();
  });
}
