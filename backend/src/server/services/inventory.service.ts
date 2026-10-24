import { z } from "zod";
import { db, type Tx } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { D, round2, type MoneyInput } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { detectImage, photoMaxBytes, putPrivateFile } from "@/server/storage/private-files";
import { audit } from "./audit.service";
import { getHotel } from "./settings.service";
import Decimal from "decimal.js";

/**
 * Inventory valuation uses weighted-average cost in SAR.
 * On receipt: newCost = (onHand * oldCost + receivedQty * receiptCost) / (onHand + receivedQty).
 * Issues, transfers, and consumption keep the current average. They do not revalue remaining stock.
 * The ledger (InventoryMovement) is append-only. Corrections are ADJUSTMENT or REVERSAL rows.
 */

const Q = (v: MoneyInput) => D(v);
const qDb = (v: MoneyInput) => Q(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
const cDb = (v: MoneyInput) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);

export const CATEGORY_DEFAULTS = [
  { code: "amenities", nameEn: "Guest amenities", nameAr: "مستلزمات النزلاء", nameBn: "অতিথি সামগ্রী" },
  { code: "cleaning", nameEn: "Cleaning supplies", nameAr: "مواد التنظيف", nameBn: "পরিষ্কারের সামগ্রী" },
  { code: "linen", nameEn: "Bed linens and towels", nameAr: "المفروشات والمناشف", nameBn: "বিছানার চাদর ও তোয়ালে" },
  { code: "bathroom", nameEn: "Bathroom supplies", nameAr: "مستلزمات الحمام", nameBn: "বাথরুমের সামগ্রী" },
  { code: "food", nameEn: "Food and beverages", nameAr: "الأطعمة والمشروبات", nameBn: "খাদ্য ও পানীয়" },
  { code: "kitchen", nameEn: "Kitchen supplies", nameAr: "مستلزمات المطبخ", nameBn: "রান্নাঘরের সামগ্রী" },
  { code: "laundry", nameEn: "Laundry supplies", nameAr: "مستلزمات المغسلة", nameBn: "লন্ড্রি সামগ্রী" },
  { code: "maintenance", nameEn: "Maintenance and electrical supplies", nameAr: "مواد الصيانة والكهرباء", nameBn: "রক্ষণাবেক্ষণ ও বৈদ্যুতিক সামগ্রী" },
  { code: "office", nameEn: "Office supplies", nameAr: "اللوازم المكتبية", nameBn: "অফিস সামগ্রী" },
  { code: "furniture", nameEn: "Furniture and equipment", nameAr: "الأثاث والمعدات", nameBn: "আসবাব ও সরঞ্জাম" },
  { code: "other", nameEn: "Other", nameAr: "أخرى", nameBn: "অন্যান্য" },
] as const;

export const PHOTO_DEFAULTS = [
  { code: "overall", nameEn: "Overall room view", nameAr: "منظر الغرفة العام", nameBn: "রুমের সামগ্রিক দৃশ্য" },
  { code: "bed", nameEn: "Bed and bedding", nameAr: "السرير والمفروشات", nameBn: "বিছানা ও বিছানার চাদর" },
  { code: "bathroom", nameEn: "Bathroom", nameAr: "الحمام", nameBn: "বাথরুম" },
  { code: "sink", nameEn: "Sink and mirror", nameAr: "المغسلة والمرآة", nameBn: "বেসিন ও আয়না" },
  { code: "amenities", nameEn: "Towels and guest amenities", nameAr: "المناشف ومستلزمات النزيل", nameBn: "তোয়ালে ও অতিথি সামগ্রী" },
  { code: "floor", nameEn: "Floor and general cleanliness", nameAr: "الأرضية والنظافة العامة", nameBn: "মেঝে ও সাধারণ পরিচ্ছন্নতা" },
] as const;

export async function ensureInventoryDefaults(hotelId?: string) {
  const hotel = hotelId ? { id: hotelId } : await getHotel();
  for (const [i, c] of CATEGORY_DEFAULTS.entries()) {
    await db.inventoryCategory.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code: c.code } },
      update: {},
      create: { hotelId: hotel.id, ...c, nameBn: c.nameBn },
    });
    void i;
  }
  await db.inventoryLocation.upsert({
    where: { hotelId_code: { hotelId: hotel.id, code: "MAIN" } },
    update: {},
    create: { hotelId: hotel.id, code: "MAIN", nameEn: "Main store", nameAr: "المستودع الرئيسي", kind: "MAIN" },
  });
  await db.inventoryLocation.upsert({
    where: { hotelId_code: { hotelId: hotel.id, code: "IN_TRANSIT" } },
    update: {},
    create: { hotelId: hotel.id, code: "IN_TRANSIT", nameEn: "In transit", nameAr: "قيد النقل", kind: "IN_TRANSIT", isSystem: true },
  });
  for (const [i, c] of PHOTO_DEFAULTS.entries()) {
    await db.housekeepingPhotoCategory.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code: c.code } },
      update: {},
      create: { hotelId: hotel.id, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, nameBn: c.nameBn, mandatory: true, sortOrder: i },
    });
  }
  return hotel.id;
}

async function lockItem(tx: Tx, itemId: string) {
  await tx.$executeRaw`SELECT id FROM "InventoryItem" WHERE id = ${itemId} FOR UPDATE`;
}

export async function onHand(tx: Tx | typeof db, itemId: string, locationId?: string) {
  const rows = await tx.inventoryBalance.findMany({
    where: { itemId, ...(locationId ? { locationId } : {}), location: locationId ? undefined : { kind: { not: "IN_TRANSIT" } } },
  });
  return rows.reduce((s, r) => s.plus(Q(r.quantity)), D(0));
}

async function postMovement(
  tx: Tx,
  args: { itemId: string; locationId: string; delta: Decimal; type: "RECEIPT" | "ISSUE" | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT" | "CONSUMPTION" | "REVERSAL"; unitCost: string; reference: string; note: string; userId?: string | null },
) {
  await lockItem(tx, args.itemId);
  const existing = await tx.inventoryBalance.findUnique({ where: { itemId_locationId: { itemId: args.itemId, locationId: args.locationId } } });
  const current = Q(existing?.quantity ?? 0);
  const next = current.plus(args.delta);
  if (next.isNegative()) throw new AppError("INVALID_STATE", "Stock cannot go below zero.");
  if (existing) {
    await tx.inventoryBalance.update({ where: { itemId_locationId: { itemId: args.itemId, locationId: args.locationId } }, data: { quantity: qDb(next) } });
  } else {
    await tx.inventoryBalance.create({ data: { itemId: args.itemId, locationId: args.locationId, quantity: qDb(next) } });
  }
  return tx.inventoryMovement.create({
    data: {
      itemId: args.itemId,
      locationId: args.locationId,
      type: args.type,
      quantity: qDb(args.delta),
      unitCost: args.unitCost,
      balanceAfter: qDb(next),
      reference: args.reference,
      note: args.note,
      userId: args.userId ?? null,
    },
  });
}

export async function receiveStock(
  tx: Tx,
  args: { itemId: string; locationId: string; quantity: MoneyInput; unitCost: MoneyInput; reference: string; note?: string; userId?: string | null },
) {
  const qty = Q(args.quantity);
  if (qty.lte(0)) throw new AppError("INVALID_INPUT", "Received quantity must be greater than zero.");
  const cost = D(args.unitCost);
  if (cost.isNegative()) throw new AppError("INVALID_INPUT", "Unit cost cannot be negative.");
  const item = await tx.inventoryItem.findUnique({ where: { id: args.itemId } });
  if (!item || item.deletedAt) throw new AppError("NOT_FOUND", "Inventory item not found.");
  const held = await onHand(tx, item.id);
  const total = held.plus(qty);
  const average = total.isZero() ? cost : held.mul(item.unitCost).plus(qty.mul(cost)).div(total);
  await tx.inventoryItem.update({ where: { id: item.id }, data: { unitCost: cDb(average) } });
  const movement = await postMovement(tx, {
    itemId: item.id,
    locationId: args.locationId,
    delta: qty,
    type: "RECEIPT",
    unitCost: cDb(cost),
    reference: args.reference,
    note: args.note ?? "",
    userId: args.userId,
  });
  return movement;
}

export async function issueStock(
  tx: Tx,
  args: { itemId: string; locationId: string; quantity: MoneyInput; type?: "ISSUE" | "CONSUMPTION"; reference: string; note?: string; userId?: string | null },
) {
  const qty = Q(args.quantity);
  if (qty.lte(0)) throw new AppError("INVALID_INPUT", "Quantity must be greater than zero.");
  const item = await tx.inventoryItem.findUnique({ where: { id: args.itemId } });
  if (!item || item.deletedAt || !item.isActive) throw new AppError("NOT_FOUND", "Inventory item not found.");
  return postMovement(tx, {
    itemId: item.id,
    locationId: args.locationId,
    delta: qty.neg(),
    type: args.type ?? "ISSUE",
    unitCost: cDb(item.unitCost),
    reference: args.reference,
    note: args.note ?? "",
    userId: args.userId,
  });
}

export const itemSchema = z.object({
  categoryId: z.string().min(1),
  locationId: z.string().min(1),
  supplierId: z.string().optional().default(""),
  sku: z.string().trim().toUpperCase().min(1).max(40),
  barcode: z.string().trim().max(64).optional().default(""),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(""),
  unit: z.enum(["PIECE", "BOTTLE", "BOX", "KG", "LITRE", "PACK"]),
  minQty: z.coerce.number().min(0),
  reorderQty: z.coerce.number().min(0),
  maxQty: z.string().optional().default(""),
  unitCost: z.coerce.number().min(0).optional().default(0),
  batchNumber: z.string().trim().max(60).optional().default(""),
  expiryDate: z.string().optional().default(""),
  isActive: z.coerce.boolean().optional().default(true),
});

export async function saveItem(id: string | null, raw: unknown, userId?: string | null) {
  const data = itemSchema.parse(raw);
  const hotel = await getHotel();
  await ensureInventoryDefaults(hotel.id);
  const barcode = data.barcode || null;
  if (data.maxQty !== "" && !(Number(data.maxQty) >= 0)) throw new AppError("INVALID_INPUT", "Maximum quantity cannot be negative.", { field: "maxQty" });
  const dupSku = await db.inventoryItem.findFirst({
    where: { hotelId: hotel.id, deletedAt: null, sku: { equals: data.sku, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
  });
  if (dupSku) throw new AppError("CONFLICT", `Another item already uses SKU ${data.sku}.`, { field: "sku" });
  const payload = {
    categoryId: data.categoryId,
    locationId: data.locationId,
    supplierId: data.supplierId || null,
    sku: data.sku,
    barcode,
    nameEn: data.nameEn,
    nameAr: data.nameAr,
    description: data.description,
    unit: data.unit,
    minQty: qDb(data.minQty),
    reorderQty: qDb(data.reorderQty),
    maxQty: data.maxQty === "" ? null : qDb(data.maxQty),
    batchNumber: data.batchNumber,
    expiryDate: data.expiryDate ? new Date(`${data.expiryDate}T00:00:00Z`) : null,
    isActive: data.isActive,
  };
  if (id) {
    const before = await db.inventoryItem.findFirst({ where: { id, hotelId: hotel.id } });
    if (!before) throw new AppError("NOT_FOUND", "Item not found.");
    const item = await db.inventoryItem.update({ where: { id }, data: payload });
    await audit({ userId, action: "inventory.item_updated", entity: "InventoryItem", entityId: id, before, after: item });
    return item;
  }
  const item = await db.inventoryItem.create({
    data: { ...payload, hotelId: hotel.id, unitCost: cDb(data.unitCost) },
  });
  if (D(data.unitCost).gt(0)) {
    // Opening cost is stored, but quantity stays zero until a receipt. Valuation is quantity × cost.
  }
  await audit({ userId, action: "inventory.item_created", entity: "InventoryItem", entityId: item.id, after: item });
  return item;
}

export async function saveItemImage(itemId: string, bytes: Buffer, userId?: string | null) {
  if (bytes.length === 0 || bytes.length > photoMaxBytes()) throw new AppError("INVALID_INPUT", "Choose an image within the size limit.");
  const kind = detectImage(bytes);
  if (!kind) throw new AppError("INVALID_INPUT", "Upload a JPEG, PNG, or WebP image.");
  const hotel = await getHotel();
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, hotelId: hotel.id, deletedAt: null } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  const key = `inventory/${hotel.id}/${item.id}.${kind.ext}`;
  await putPrivateFile(key, bytes);
  await db.inventoryItem.update({ where: { id: item.id }, data: { imageKey: key } });
  await audit({ userId, action: "inventory.image_uploaded", entity: "InventoryItem", entityId: item.id });
}

export async function archiveItem(id: string, userId?: string | null) {
  const hotel = await getHotel();
  const item = await db.inventoryItem.findFirst({ where: { id, hotelId: hotel.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  const held = await onHand(db, id);
  if (held.gt(0)) throw new AppError("INVALID_STATE", "Issue or adjust the remaining stock before archiving this item.");
  await db.inventoryItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ userId, action: "inventory.item_archived", entity: "InventoryItem", entityId: id });
}

export async function saveCategory(id: string | null, raw: { code: string; nameEn: string; nameAr: string; nameBn: string }, userId?: string | null) {
  const hotel = await getHotel();
  const code = raw.code.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(code)) throw new AppError("INVALID_INPUT", "Category code must use lower-case letters, numbers, and dashes.");
  if (id) return db.inventoryCategory.update({ where: { id }, data: { nameEn: raw.nameEn, nameAr: raw.nameAr, nameBn: raw.nameBn } });
  const row = await db.inventoryCategory.create({ data: { hotelId: hotel.id, code, nameEn: raw.nameEn, nameAr: raw.nameAr, nameBn: raw.nameBn } });
  await audit({ userId, action: "inventory.category_saved", entity: "InventoryCategory", entityId: row.id });
  return row;
}

export async function saveLocation(raw: { code: string; nameEn: string; nameAr: string; kind: "MAIN" | "FLOOR" | "DEPARTMENT" }, userId?: string | null) {
  const hotel = await getHotel();
  const code = raw.code.trim().toUpperCase();
  if (code === "IN_TRANSIT") throw new AppError("INVALID_INPUT", "That location code is reserved.");
  const row = await db.inventoryLocation.create({ data: { hotelId: hotel.id, code, nameEn: raw.nameEn, nameAr: raw.nameAr, kind: raw.kind } });
  await audit({ userId, action: "inventory.location_created", entity: "InventoryLocation", entityId: row.id });
  return row;
}

export async function saveSupplier(id: string | null, raw: { name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean }, userId?: string | null) {
  const hotel = await getHotel();
  const data = {
    name: raw.name.trim(),
    contactName: raw.contactName ?? "",
    phone: raw.phone ?? "",
    email: raw.email ?? "",
    address: raw.address ?? "",
    notes: raw.notes ?? "",
    isActive: raw.isActive ?? true,
  };
  if (!data.name) throw new AppError("INVALID_INPUT", "Supplier name is required.");
  const row = id
    ? await db.supplier.update({ where: { id }, data })
    : await db.supplier.create({ data: { ...data, hotelId: hotel.id } });
  await audit({ userId, action: "inventory.supplier_saved", entity: "Supplier", entityId: row.id });
  return row;
}

async function nextDoc(tx: Tx | typeof db, hotelId: string, prefix: "PO" | "TR") {
  const start = `${prefix}-${new Date().getUTCFullYear()}-`;
  const where = { hotelId, number: { startsWith: start } };
  const rows = prefix === "PO"
    ? await tx.purchaseOrder.findMany({ where, select: { number: true } })
    : await tx.stockTransfer.findMany({ where, select: { number: true } });
  const n = rows.reduce((m, r) => Math.max(m, Number(r.number.slice(start.length)) || 0), 0) + 1;
  return `${start}${String(n).padStart(4, "0")}`;
}

export async function postReceipt(args: { itemId: string; quantity: string; unitCost: string; supplierNote?: string; reference?: string; userId?: string | null }) {
  const hotel = await getHotel();
  await ensureInventoryDefaults(hotel.id);
  const item = await db.inventoryItem.findFirst({ where: { id: args.itemId, hotelId: hotel.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  const movement = await db.$transaction((tx) =>
    receiveStock(tx, {
      itemId: item.id,
      locationId: item.locationId,
      quantity: args.quantity,
      unitCost: args.unitCost,
      reference: args.reference || `receipt:${item.sku}`,
      note: args.supplierNote ?? "",
      userId: args.userId,
    }),
  );
  await audit({ userId: args.userId, action: "inventory.received", entity: "InventoryItem", entityId: item.id, after: { quantity: args.quantity, unitCost: args.unitCost } });
  return movement;
}

/** One product row for the simple inventory screen: date, name, quantity on hand, and price. */
export async function listSimpleInventory() {
  const hotel = await getHotel();
  const items = await db.inventoryItem.findMany({
    where: { hotelId: hotel.id, deletedAt: null },
    include: { balances: { include: { location: true } } },
    orderBy: [{ createdAt: "desc" }, { nameEn: "asc" }],
  });
  return items.map((item) => {
    const quantity = item.balances.filter((b) => b.location.kind !== "IN_TRANSIT").reduce((s, b) => s.plus(Q(b.quantity)), D(0));
    return { id: item.id, date: item.createdAt.toISOString().slice(0, 10), name: item.nameEn, quantity, price: item.unitCost };
  });
}

/** Add a product, or update it when the same name is entered again. */
export async function saveSimpleInventory(args: { date: string; name: string; quantity: string; price: string; userId?: string | null }) {
  const name = args.name.trim();
  if (!name || name.length > 160) throw new AppError("INVALID_INPUT", "Enter a product name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || new Date(`${args.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== args.date) {
    throw new AppError("INVALID_INPUT", "Enter a valid date.");
  }
  const quantity = Q(args.quantity);
  const price = D(args.price);
  if (quantity.isNegative() || !quantity.isFinite()) throw new AppError("INVALID_INPUT", "Quantity cannot be negative.");
  if (price.isNegative() || !price.isFinite()) throw new AppError("INVALID_INPUT", "Price cannot be negative.");

  const hotel = await getHotel();
  await ensureInventoryDefaults(hotel.id);
  const category = await db.inventoryCategory.findFirstOrThrow({ where: { hotelId: hotel.id, code: "other" } });
  const location = await db.inventoryLocation.findFirstOrThrow({ where: { hotelId: hotel.id, code: "MAIN" } });
  const dated = new Date(`${args.date}T00:00:00.000Z`);

  let item = await db.inventoryItem.findFirst({
    where: { hotelId: hotel.id, deletedAt: null, nameEn: { equals: name, mode: "insensitive" } },
  });
  if (!item) {
    const sku = `P-${Date.now().toString(36).toUpperCase()}`;
    item = await saveItem(null, {
      categoryId: category.id,
      locationId: location.id,
      supplierId: "",
      sku,
      barcode: "",
      nameEn: name,
      nameAr: name,
      description: "",
      unit: "PIECE",
      minQty: 0,
      reorderQty: 0,
      maxQty: "",
      unitCost: 0,
      batchNumber: "",
      expiryDate: "",
      isActive: true,
    }, args.userId);
  }

  const held = await onHand(db, item.id);
  const delta = quantity.minus(held);
  if (delta.gt(0)) {
    await postReceipt({ itemId: item.id, quantity: delta.toString(), unitCost: price.toString(), userId: args.userId });
  } else if (delta.lt(0)) {
    await db.$transaction((tx) =>
      issueStock(tx, {
        itemId: item.id,
        locationId: item.locationId,
        quantity: delta.abs().toString(),
        reference: "inventory",
        note: "Quantity update",
        userId: args.userId,
      }),
    );
  }

  const updated = await db.inventoryItem.update({
    where: { id: item.id },
    data: { nameEn: name, nameAr: name, unitCost: cDb(price), createdAt: dated },
  });
  await audit({ userId: args.userId, action: "inventory.saved", entity: "InventoryItem", entityId: item.id, after: { name, quantity: quantity.toString(), price: price.toString(), date: args.date } });
  return updated;
}

/** Housekeeping records a product and the quantity used for cleaning. Stock goes down by that amount. */
export async function recordCleaningUse(args: { itemId: string; quantity: string; userId?: string | null }) {
  const hotel = await getHotel();
  const item = await db.inventoryItem.findFirst({ where: { id: args.itemId, hotelId: hotel.id, deletedAt: null, isActive: true } });
  if (!item) throw new AppError("NOT_FOUND", "Product not found.");
  const quantity = Q(args.quantity);
  if (quantity.lte(0) || !quantity.isFinite()) throw new AppError("INVALID_INPUT", "Enter the quantity needed for cleaning.");
  await db.$transaction((tx) =>
    issueStock(tx, {
      itemId: item.id,
      locationId: item.locationId,
      quantity: quantity.toString(),
      type: "CONSUMPTION",
      reference: "cleaning",
      note: "Used for cleaning",
      userId: args.userId,
    }),
  );
  await audit({ userId: args.userId, action: "inventory.cleaning_use", entity: "InventoryItem", entityId: item.id, after: { name: item.nameEn, quantity: quantity.toString() } });
}

export async function postIssue(args: { itemId: string; quantity: string; department: string; reason: string; userId?: string | null }) {
  const hotel = await getHotel();
  const item = await db.inventoryItem.findFirst({ where: { id: args.itemId, hotelId: hotel.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  if (!args.reason.trim()) throw new AppError("INVALID_INPUT", "A reason is required.");
  const departments = ["HOUSEKEEPING", "LAUNDRY", "MAINTENANCE", "KITCHEN", "FRONT_DESK", "OTHER"];
  if (!departments.includes(args.department)) throw new AppError("INVALID_INPUT", "Choose a department.");
  const movement = await db.$transaction((tx) =>
    issueStock(tx, { itemId: item.id, locationId: item.locationId, quantity: args.quantity, reference: `issue:${args.department}`, note: args.reason, userId: args.userId }),
  );
  await audit({ userId: args.userId, action: "inventory.issued", entity: "InventoryItem", entityId: item.id, after: { quantity: args.quantity, department: args.department, reason: args.reason } });
  return movement;
}

export async function createPurchaseOrder(args: { supplierId: string; expectedDate?: string; lines: { itemId: string; quantity: string; unitCost: string }[]; userId?: string | null }) {
  const hotel = await getHotel();
  if (args.lines.length === 0) throw new AppError("INVALID_INPUT", "Add at least one line.");
  const order = await db.$transaction(async (tx) => {
    const number = await nextDoc(tx, hotel.id, "PO");
    return tx.purchaseOrder.create({
      data: {
        hotelId: hotel.id,
        number,
        supplierId: args.supplierId,
        orderDate: new Date(),
        expectedDate: args.expectedDate ? new Date(`${args.expectedDate}T00:00:00Z`) : null,
        items: { create: args.lines.map((l) => ({ itemId: l.itemId, quantity: qDb(l.quantity), unitCost: cDb(l.unitCost) })) },
      },
    });
  });
  await audit({ userId: args.userId, action: "inventory.po_created", entity: "PurchaseOrder", entityId: order.id, after: { number: order.number } });
  return order;
}

export async function approvePurchaseOrder(id: string, userId: string) {
  const order = await db.purchaseOrder.findUnique({ where: { id } });
  if (!order || order.status !== "DRAFT") throw new AppError("INVALID_STATE", "Only a draft purchase order can be approved.");
  await db.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() } });
  await audit({ userId, action: "inventory.po_approved", entity: "PurchaseOrder", entityId: id });
}

export async function receivePurchaseOrder(id: string, userId?: string | null) {
  await db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order || !["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status)) {
      throw new AppError("INVALID_STATE", "Receive stock only against an approved purchase order.");
    }
    for (const line of order.items) {
      const remaining = Q(line.quantity).minus(line.receivedQty);
      if (remaining.lte(0)) continue;
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.itemId } });
      await receiveStock(tx, { itemId: line.itemId, locationId: item.locationId, quantity: remaining, unitCost: line.unitCost, reference: `po:${order.number}`, note: "Purchase receipt", userId });
      await tx.purchaseOrderItem.update({ where: { id: line.id }, data: { receivedQty: qDb(line.quantity) } });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED" } });
  });
  await audit({ userId, action: "inventory.po_received", entity: "PurchaseOrder", entityId: id });
}

export async function createTransfer(args: { fromLocationId: string; toLocationId: string; lines: { itemId: string; quantity: string }[]; notes?: string; userId?: string | null }) {
  if (args.fromLocationId === args.toLocationId) throw new AppError("INVALID_INPUT", "Choose two different locations.");
  const hotel = await getHotel();
  const row = await db.$transaction(async (tx) => {
    const number = await nextDoc(tx, hotel.id, "TR");
    return tx.stockTransfer.create({
      data: {
        hotelId: hotel.id,
        number,
        fromLocationId: args.fromLocationId,
        toLocationId: args.toLocationId,
        notes: args.notes ?? "",
        requestedById: args.userId ?? null,
        items: { create: args.lines.map((l) => ({ itemId: l.itemId, quantity: qDb(l.quantity) })) },
      },
    });
  });
  await audit({ userId: args.userId, action: "inventory.transfer_requested", entity: "StockTransfer", entityId: row.id });
  return row;
}

export async function advanceTransfer(id: string, action: "approve" | "dispatch" | "receive" | "cancel", userId?: string | null) {
  await db.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true, fromLocation: true, toLocation: true } });
    if (!transfer) throw new AppError("NOT_FOUND", "Transfer not found.");
    const transit = await tx.inventoryLocation.findFirst({ where: { hotelId: transfer.hotelId, code: "IN_TRANSIT" } });
    if (!transit) throw new AppError("NOT_CONFIGURED", "In-transit location is missing.");
    if (action === "cancel") {
      if (!["REQUESTED", "APPROVED"].includes(transfer.status)) throw new AppError("INVALID_STATE", "This transfer can no longer be cancelled.");
      await tx.stockTransfer.update({ where: { id }, data: { status: "CANCELLED" } });
      return;
    }
    if (action === "approve") {
      if (transfer.status !== "REQUESTED") throw new AppError("INVALID_STATE", "Only a requested transfer can be approved.");
      await tx.stockTransfer.update({ where: { id }, data: { status: "APPROVED", approvedById: userId ?? null } });
      return;
    }
    if (action === "dispatch") {
      if (transfer.status !== "APPROVED") throw new AppError("INVALID_STATE", "Approve the transfer before dispatch.");
      for (const line of transfer.items) {
        const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.itemId } });
        await postMovement(tx, { itemId: line.itemId, locationId: transfer.fromLocationId, delta: Q(line.quantity).neg(), type: "TRANSFER_OUT", unitCost: cDb(item.unitCost), reference: `transfer:${transfer.number}`, note: "Dispatched", userId });
        await postMovement(tx, { itemId: line.itemId, locationId: transit.id, delta: Q(line.quantity), type: "TRANSFER_IN", unitCost: cDb(item.unitCost), reference: `transfer:${transfer.number}`, note: "In transit", userId });
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      return;
    }
    if (transfer.status !== "DISPATCHED") throw new AppError("INVALID_STATE", "Only a dispatched transfer can be received.");
    for (const line of transfer.items) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.itemId } });
      await postMovement(tx, { itemId: line.itemId, locationId: transit.id, delta: Q(line.quantity).neg(), type: "TRANSFER_OUT", unitCost: cDb(item.unitCost), reference: `transfer:${transfer.number}`, note: "Left transit", userId });
      await postMovement(tx, { itemId: line.itemId, locationId: transfer.toLocationId, delta: Q(line.quantity), type: "TRANSFER_IN", unitCost: cDb(item.unitCost), reference: `transfer:${transfer.number}`, note: "Received", userId });
    }
    await tx.stockTransfer.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
  });
  await audit({ userId, action: `inventory.transfer_${action}`, entity: "StockTransfer", entityId: id });
}

export async function requestAdjustment(args: { itemId: string; quantity: string; reason: string; userId?: string | null }) {
  if (!args.reason.trim()) throw new AppError("INVALID_INPUT", "A reason is required.");
  const item = await db.inventoryItem.findUnique({ where: { id: args.itemId } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found.");
  const previous = await onHand(db, item.id, item.locationId);
  const row = await db.stockAdjustment.create({
    data: { itemId: item.id, locationId: item.locationId, previousQty: qDb(previous), adjustedQty: qDb(args.quantity), reason: args.reason.trim(), requestedById: args.userId ?? null },
  });
  await audit({ userId: args.userId, action: "inventory.adjustment_requested", entity: "StockAdjustment", entityId: row.id, before: { quantity: qDb(previous) }, after: { quantity: args.quantity, reason: args.reason } });
  return row;
}

export async function decideAdjustment(id: string, approve: boolean, userId: string) {
  await db.$transaction(async (tx) => {
    const row = await tx.stockAdjustment.findUnique({ where: { id } });
    if (!row || row.status !== "PENDING") throw new AppError("INVALID_STATE", "This adjustment is no longer pending.");
    if (!approve) {
      await tx.stockAdjustment.update({ where: { id }, data: { status: "REJECTED", approvedById: userId, decidedAt: new Date() } });
      return;
    }
    await lockItem(tx, row.itemId);
    const bal = await tx.inventoryBalance.findUnique({ where: { itemId_locationId: { itemId: row.itemId, locationId: row.locationId } } });
    const current = Q(bal?.quantity ?? 0);
    if (!current.equals(Q(row.previousQty))) {
      throw new AppError("CONFLICT", "Stock changed after this count. Reject it and count again.");
    }
    const delta = Q(row.adjustedQty).minus(current);
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: row.itemId } });
    if (!delta.isZero()) {
      await postMovement(tx, {
        itemId: row.itemId,
        locationId: row.locationId,
        delta,
        type: "ADJUSTMENT",
        unitCost: cDb(item.unitCost),
        reference: `adjustment:${row.id}`,
        note: row.reason,
        userId,
      });
    }
    await tx.stockAdjustment.update({ where: { id }, data: { status: "APPROVED", approvedById: userId, decidedAt: new Date() } });
  });
  await audit({ userId, action: approve ? "inventory.adjustment_approved" : "inventory.adjustment_rejected", entity: "StockAdjustment", entityId: id });
}

export function valuation(quantity: MoneyInput, unitCost: MoneyInput) {
  return round2(Q(quantity).mul(D(unitCost)));
}

export async function inventorySnapshot(hotelId: string) {
  await ensureInventoryDefaults(hotelId);
  const monthStart = new Date(`${todayIn("Asia/Riyadh").slice(0, 7)}-01T00:00:00+03:00`);
  const [items, movements, pendingOrders, pendingAdjustments, monthMoves] = await Promise.all([
    db.inventoryItem.findMany({ where: { hotelId, deletedAt: null }, include: { balances: { include: { location: true } }, category: true }, orderBy: { nameEn: "asc" } }),
    db.inventoryMovement.findMany({ where: { item: { hotelId } }, orderBy: { createdAt: "desc" }, take: 12, include: { item: true } }),
    db.purchaseOrder.count({ where: { hotelId, status: { in: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"] } } }),
    db.stockAdjustment.count({ where: { item: { hotelId }, status: "PENDING" } }),
    db.inventoryMovement.findMany({ where: { item: { hotelId }, createdAt: { gte: monthStart }, type: { in: ["RECEIPT", "CONSUMPTION"] } } }),
  ]);
  const rows = items.map((item) => {
    const qty = item.balances.filter((b) => b.location.kind !== "IN_TRANSIT").reduce((s, b) => s.plus(Q(b.quantity)), D(0));
    const transit = item.balances.filter((b) => b.location.kind === "IN_TRANSIT").reduce((s, b) => s.plus(Q(b.quantity)), D(0));
    return { item, qty, transit, value: valuation(qty.plus(transit), item.unitCost), low: qty.lte(item.reorderQty), out: qty.lte(0) };
  });
  const soon = new Date();
  soon.setUTCDate(soon.getUTCDate() + 30);
  return {
    rows,
    movements,
    pendingOrders,
    pendingAdjustments,
    totals: {
      items: rows.length,
      quantity: rows.reduce((s, r) => s.plus(r.qty), D(0)),
      value: rows.reduce((s, r) => s.plus(r.value), D(0)),
      low: rows.filter((r) => r.low && r.item.isActive).length,
      out: rows.filter((r) => r.out && r.item.isActive).length,
      expiring: rows.filter((r) => r.item.expiryDate && r.item.expiryDate <= soon && r.qty.gt(0)).length,
      monthPurchases: monthMoves.filter((m) => m.type === "RECEIPT").reduce((s, m) => s.plus(valuation(m.quantity, m.unitCost)), D(0)),
      monthConsumption: monthMoves.filter((m) => m.type === "CONSUMPTION").reduce((s, m) => s.plus(Q(m.quantity).abs()), D(0)),
    },
  };
}
