import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { createReservation } from "@/server/services/reservation.service";
import { checkIn } from "@/server/services/frontdesk.service";
import { setRoomStatus } from "@/server/services/room.service";
import { detectImage } from "@/server/storage/private-files";
import {
  advanceTransfer,
  approvePurchaseOrder,
  createPurchaseOrder,
  createTransfer,
  decideAdjustment,
  ensureInventoryDefaults,
  inventorySnapshot,
  onHand,
  postIssue,
  postReceipt,
  receivePurchaseOrder,
  receiveStock,
  requestAdjustment,
  saveItem,
  saveLocation,
  saveSupplier,
} from "@/server/services/inventory.service";
import {
  canViewCleaningPhoto,
  reviewCleaning,
  saveSupplyLine,
  startCleaning,
  submitCleaning,
  uploadCleaningPhoto,
} from "@/server/services/housekeeping-clean.service";
import { createWorld, testGuest, type World } from "./helpers";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

async function person(role: "HOTEL_MANAGER" | "HOUSEKEEPING" = "HOTEL_MANAGER") {
  const row = await db.role.findUniqueOrThrow({ where: { key: role } });
  return db.user.create({
    data: { email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, name: role, passwordHash: "x", roleId: row.id },
  });
}

async function stockItem(world: World, sku: string, reorder = "0") {
  await ensureInventoryDefaults(world.hotelId);
  const category = await db.inventoryCategory.findFirstOrThrow({ where: { hotelId: world.hotelId, code: "amenities" } });
  const location = await db.inventoryLocation.findFirstOrThrow({ where: { hotelId: world.hotelId, code: "MAIN" } });
  return saveItem(null, {
    categoryId: category.id,
    locationId: location.id,
    sku,
    nameEn: sku,
    nameAr: "صنف",
    unit: "PIECE",
    minQty: 0,
    reorderQty: reorder,
    unitCost: 0,
    isActive: true,
  });
}

async function photographEveryCategory(taskId: string, userId: string) {
  const categories = await db.housekeepingPhotoCategory.findMany({ where: { isActive: true, mandatory: true } });
  for (const category of categories) {
    await uploadCleaningPhoto({ taskId, categoryId: category.id, userId, manage: false, bytes: jpeg });
  }
}

describe("inventory ledger", () => {
  it("rejects an item without an Arabic name and keeps a weighted-average cost", async () => {
    const world = await createWorld({ rooms: 1 });
    await ensureInventoryDefaults(world.hotelId);
    const category = await db.inventoryCategory.findFirstOrThrow({ where: { hotelId: world.hotelId } });
    const location = await db.inventoryLocation.findFirstOrThrow({ where: { hotelId: world.hotelId, code: "MAIN" } });
    await expect(saveItem(null, { categoryId: category.id, locationId: location.id, sku: "BAD", nameEn: "Soap", nameAr: "", unit: "PIECE" })).rejects.toThrow();

    const item = await stockItem(world, "SOAP");
    await postReceipt({ itemId: item.id, quantity: "10", unitCost: "2" });
    await postReceipt({ itemId: item.id, quantity: "10", unitCost: "4" });
    const stored = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stored.unitCost.toString()).toBe("3");
    expect((await onHand(db, item.id)).toString()).toBe("20");
    const ledger = await db.inventoryMovement.aggregate({ where: { itemId: item.id }, _sum: { quantity: true } });
    expect(ledger._sum.quantity?.toString()).toBe("20");
  });

  it("refuses negative stock and rolls a failed receipt back", async () => {
    const world = await createWorld({ rooms: 1 });
    const item = await stockItem(world, "TOWEL");
    await postReceipt({ itemId: item.id, quantity: "1", unitCost: "5" });
    await expect(postIssue({ itemId: item.id, quantity: "2", department: "HOUSEKEEPING", reason: "Too many" })).rejects.toThrow(/zero/i);
    expect((await onHand(db, item.id)).toString()).toBe("1");

    await expect(
      db.$transaction(async (tx) => {
        await receiveStock(tx, { itemId: item.id, locationId: item.locationId, quantity: "9", unitCost: "1", reference: "fail" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow(/rollback/);
    expect((await onHand(db, item.id)).toString()).toBe("1");
  });

  it("does not increase stock when a purchase order is approved", async () => {
    const world = await createWorld({ rooms: 1 });
    const user = await person();
    const item = await stockItem(world, "SHAMPOO");
    const supplier = await saveSupplier(null, { name: "Amenity Co" }, user.id);
    const order = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ itemId: item.id, quantity: "6", unitCost: "1.25" }], userId: user.id });
    await approvePurchaseOrder(order.id, user.id);
    expect((await onHand(db, item.id)).toString()).toBe("0");
    await receivePurchaseOrder(order.id, user.id);
    expect((await onHand(db, item.id)).toString()).toBe("6");
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("RECEIVED");
  });

  it("moves stock through request, approval, dispatch, and receipt without double counting", async () => {
    const world = await createWorld({ rooms: 1 });
    const user = await person();
    const item = await stockItem(world, "BAG");
    await postReceipt({ itemId: item.id, quantity: "5", unitCost: "2" });
    const floor = await saveLocation({ code: "F1", nameEn: "Floor 1", nameAr: "الدور الأول", kind: "FLOOR" }, user.id);
    const transfer = await createTransfer({ fromLocationId: item.locationId, toLocationId: floor.id, lines: [{ itemId: item.id, quantity: "2" }], userId: user.id });
    await advanceTransfer(transfer.id, "approve", user.id);
    await advanceTransfer(transfer.id, "dispatch", user.id);
    expect((await onHand(db, item.id)).toString()).toBe("3");
    const transit = await db.inventoryLocation.findFirstOrThrow({ where: { hotelId: world.hotelId, code: "IN_TRANSIT" } });
    expect((await onHand(db, item.id, transit.id)).toString()).toBe("2");
    await advanceTransfer(transfer.id, "receive", user.id);
    expect((await onHand(db, item.id, item.locationId)).toString()).toBe("3");
    expect((await onHand(db, item.id, floor.id)).toString()).toBe("2");
    expect((await onHand(db, item.id, transit.id)).toString()).toBe("0");
    const types = (await db.inventoryMovement.findMany({ where: { reference: { contains: transfer.number } } })).map((m) => m.type);
    expect(types).toContain("TRANSFER_OUT");
    expect(types).toContain("TRANSFER_IN");
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).unitCost.toString()).toBe("2");
  });

  it("keeps a count unchanged until an approver confirms it", async () => {
    const world = await createWorld({ rooms: 1 });
    const user = await person();
    const item = await stockItem(world, "BULB", "2");
    await postReceipt({ itemId: item.id, quantity: "4", unitCost: "3" });
    const adjustment = await requestAdjustment({ itemId: item.id, quantity: "3", reason: "Broken", userId: user.id });
    expect((await onHand(db, item.id)).toString()).toBe("4");
    await decideAdjustment(adjustment.id, false, user.id);
    expect((await onHand(db, item.id)).toString()).toBe("4");
    const again = await requestAdjustment({ itemId: item.id, quantity: "3", reason: "Broken", userId: user.id });
    await decideAdjustment(again.id, true, user.id);
    expect((await onHand(db, item.id)).toString()).toBe("3");
    const snap = await inventorySnapshot(world.hotelId);
    const row = snap.rows.find((r) => r.item.id === item.id);
    expect(row?.low).toBe(false);
    const low = await stockItem(world, "LOW", "5");
    await postReceipt({ itemId: low.id, quantity: "5", unitCost: "1" });
    const after = await inventorySnapshot(world.hotelId);
    expect(after.rows.find((r) => r.item.id === low.id)?.low).toBe(true);
  });

  it("lets only one of two simultaneous issues succeed", async () => {
    const world = await createWorld({ rooms: 1 });
    const item = await stockItem(world, "LAST");
    await postReceipt({ itemId: item.id, quantity: "1", unitCost: "1" });
    const results = await Promise.allSettled([
      postIssue({ itemId: item.id, quantity: "1", department: "KITCHEN", reason: "A" }),
      postIssue({ itemId: item.id, quantity: "1", department: "LAUNDRY", reason: "B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await onHand(db, item.id)).toString()).toBe("0");
  });
});

describe("housekeeping photographs and room readiness", () => {
  it("requires a real image, a size limit, and a successful store before the photo exists", async () => {
    expect(detectImage(Buffer.from("not-a-photo"))).toBeNull();
    expect(detectImage(jpeg)?.mime).toBe("image/jpeg");
    const world = await createWorld({ rooms: 2 });
    const housekeeper = await person("HOUSEKEEPING");
    const other = await person("HOUSEKEEPING");
    await ensureInventoryDefaults(world.hotelId);
    await db.room.update({ where: { id: world.roomIds[0] }, data: { status: "DIRTY" } });
    const task = await db.housekeepingTask.create({ data: { roomId: world.roomIds[0], type: "CHECKOUT_CLEAN", assignedToId: housekeeper.id } });
    const category = await db.housekeepingPhotoCategory.findFirstOrThrow({ where: { hotelId: world.hotelId } });
    await expect(uploadCleaningPhoto({ taskId: task.id, categoryId: category.id, userId: other.id, manage: false, bytes: jpeg })).rejects.toThrow(/someone else/i);
    expect(canViewCleaningPhoto({ userId: other.id, inspect: false, assignedToId: housekeeper.id })).toBe(false);
    expect(canViewCleaningPhoto({ userId: housekeeper.id, inspect: false, assignedToId: housekeeper.id })).toBe(true);
    await startCleaning(task.id, housekeeper.id);

    const previous = process.env.HOUSEKEEPING_PHOTO_MAX_BYTES;
    process.env.HOUSEKEEPING_PHOTO_MAX_BYTES = "8";
    try {
      await expect(uploadCleaningPhoto({ taskId: task.id, categoryId: category.id, userId: housekeeper.id, manage: false, bytes: jpeg })).rejects.toThrow(/larger/i);
    } finally {
      if (previous === undefined) delete process.env.HOUSEKEEPING_PHOTO_MAX_BYTES;
      else process.env.HOUSEKEEPING_PHOTO_MAX_BYTES = previous;
    }

    await expect(uploadCleaningPhoto({ taskId: task.id, categoryId: category.id, userId: housekeeper.id, manage: false, bytes: Buffer.from("hello-image") })).rejects.toThrow(/JPEG/i);

    const storage = process.env.PRIVATE_STORAGE_DIR;
    process.env.PRIVATE_STORAGE_DIR = path.join(process.cwd(), "package.json");
    try {
      await expect(uploadCleaningPhoto({ taskId: task.id, categoryId: category.id, userId: housekeeper.id, manage: false, bytes: jpeg })).rejects.toThrow(/stored/i);
    } finally {
      if (storage === undefined) delete process.env.PRIVATE_STORAGE_DIR;
      else process.env.PRIVATE_STORAGE_DIR = storage;
    }
    expect(await db.housekeepingPhoto.count({ where: { taskId: task.id } })).toBe(0);
  });

  it("deducts supplies once, keeps a rejected inspection, and withholds the room until approval", async () => {
    const world = await createWorld({ rooms: 1 });
    const housekeeper = await person("HOUSEKEEPING");
    const manager = await person("HOTEL_MANAGER");
    const item = await stockItem(world, "SOAP-HK");
    await postReceipt({ itemId: item.id, quantity: "10", unitCost: "1.5" });
    await db.room.update({ where: { id: world.roomIds[0] }, data: { status: "DIRTY" } });
    const task = await db.housekeepingTask.create({ data: { roomId: world.roomIds[0], type: "CHECKOUT_CLEAN" } });
    const reservation = await createReservation({
      source: "WALK_IN",
      guest: testGuest("hk"),
      lines: [{ roomTypeId: world.roomType.id, adults: 1 }],
      checkIn: todayIn("Asia/Riyadh"),
      checkOut: addDays(todayIn("Asia/Riyadh"), 1),
      allowPastDates: true,
    });
    await expect(checkIn({ reservationId: reservation.id, guestVerified: true })).rejects.toThrow(/ready/i);

    await startCleaning(task.id, housekeeper.id);
    expect((await db.room.findUniqueOrThrow({ where: { id: world.roomIds[0] } })).status).toBe("CLEANING");
    await expect(submitCleaning(task.id, housekeeper.id, false)).rejects.toThrow(/photograph/i);
    await photographEveryCategory(task.id, housekeeper.id);
    await saveSupplyLine({ taskId: task.id, itemId: item.id, quantity: "2", userId: housekeeper.id, manage: false });
    await submitCleaning(task.id, housekeeper.id, false, "Ready for inspection");
    expect((await onHand(db, item.id)).toString()).toBe("8");
    expect(await db.inventoryConsumption.count({ where: { taskId: task.id } })).toBe(1);
    expect((await db.room.findUniqueOrThrow({ where: { id: world.roomIds[0] } })).status).toBe("CLEANING");

    await expect(reviewCleaning({ taskId: task.id, userId: manager.id, approve: false })).rejects.toThrow(/reason/i);
    await reviewCleaning({ taskId: task.id, userId: manager.id, approve: false, reason: "Bathroom mirror", areas: "Bathroom" });
    expect(await db.housekeepingInspection.count({ where: { taskId: task.id, status: "REJECTED" } })).toBe(1);
    await submitCleaning(task.id, housekeeper.id, false);
    expect((await onHand(db, item.id)).toString()).toBe("8");
    expect(await db.inventoryConsumption.count({ where: { taskId: task.id } })).toBe(1);
    expect(await db.housekeepingInspection.count({ where: { taskId: task.id } })).toBe(2);

    await reviewCleaning({ taskId: task.id, userId: manager.id, approve: true });
    expect((await db.room.findUniqueOrThrow({ where: { id: world.roomIds[0] } })).status).toBe("AVAILABLE");
    await expect(reviewCleaning({ taskId: task.id, userId: manager.id, approve: true })).rejects.toThrow(/not waiting/i);
    expect(await db.notificationLog.count({ where: { referenceId: task.id, event: "housekeeping.approved" } })).toBe(1);
    const stay = await checkIn({ reservationId: reservation.id, guestVerified: true });
    expect(stay.status).toBe("CHECKED_IN");
  });

  it("does not free an occupied room or an out-of-order room when cleaning is approved", async () => {
    const world = await createWorld({ rooms: 2 });
    const housekeeper = await person("HOUSEKEEPING");
    const manager = await person("HOTEL_MANAGER");
    await ensureInventoryDefaults(world.hotelId);

    await db.room.update({ where: { id: world.roomIds[0] }, data: { status: "OCCUPIED" } });
    const occupied = await db.housekeepingTask.create({ data: { roomId: world.roomIds[0], type: "STAYOVER", status: "IN_PROGRESS", assignedToId: housekeeper.id, startedAt: new Date() } });
    await photographEveryCategory(occupied.id, housekeeper.id);
    await submitCleaning(occupied.id, housekeeper.id, false);
    await reviewCleaning({ taskId: occupied.id, userId: manager.id, approve: true });
    expect((await db.room.findUniqueOrThrow({ where: { id: world.roomIds[0] } })).status).toBe("OCCUPIED");

    await db.room.update({ where: { id: world.roomIds[1] }, data: { status: "DIRTY" } });
    const blocked = await db.housekeepingTask.create({ data: { roomId: world.roomIds[1], type: "CHECKOUT_CLEAN" } });
    await expect(startCleaning(blocked.id, housekeeper.id)).resolves.toBeUndefined();
    await setRoomStatus({ roomId: world.roomIds[1], status: "OUT_OF_ORDER", userId: manager.id, note: "Leak" });
    await photographEveryCategory(blocked.id, housekeeper.id);
    await db.housekeepingTask.update({ where: { id: blocked.id }, data: { status: "IN_PROGRESS" } });
    await submitCleaning(blocked.id, housekeeper.id, false);
    await reviewCleaning({ taskId: blocked.id, userId: manager.id, approve: true });
    expect((await db.room.findUniqueOrThrow({ where: { id: world.roomIds[1] } })).status).toBe("OUT_OF_ORDER");
  });
});
