import { z } from "zod";
import { db, type Tx } from "@/server/db/client";
import type { RoomStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { fromDate, todayIn, toDate } from "@/lib/dates";
import { getHotel } from "./settings.service";
import { audit } from "./audit.service";
import { lockRooms } from "./availability.service";
import { enqueueInventorySync } from "./channel-queue.service";

export const roomInputSchema = z.object({
  number: z.string().trim().min(1, "Room number is required").max(20).transform((v) => v.toUpperCase()),
  floor: z.coerce.number().int("Floor must be a whole number").min(0, "Floor cannot be negative").max(200).default(0),
  roomTypeId: z.string().min(1),
  notes: z.string().trim().max(500).optional().default(""),
  isActive: z.coerce.boolean().optional().default(true),
});

export async function createRoom(input: z.input<typeof roomInputSchema>, userId?: string | null) {
  const data = roomInputSchema.parse(input);
  const hotel = await getHotel();
  await assertRoomNumberFree(hotel.id, data.number);
  const room = await db.room.create({ data: { ...data, hotelId: hotel.id } });
  await audit({ userId, action: "room.created", entity: "Room", entityId: room.id, after: room });
  await enqueueInventorySync({ roomTypeIds: [room.roomTypeId], from: todayIn(hotel.timezone), to: toYear(hotel.timezone) }).catch(() => undefined);
  return room;
}

async function assertRoomNumberFree(hotelId: string, number: string, exceptId?: string) {
  const dup = await db.room.findFirst({
    where: { hotelId, number: { equals: number, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (dup) throw new AppError("CONFLICT", `Room ${number} already exists.`, { field: "number" });
}

function toYear(tz: string) {
  const t = toDate(todayIn(tz));
  t.setUTCDate(t.getUTCDate() + 365);
  return fromDate(t);
}

export async function updateRoom(id: string, input: Partial<z.input<typeof roomInputSchema>>, userId?: string | null) {
  const before = await db.room.findUnique({ where: { id } });
  if (!before) throw new AppError("NOT_FOUND", "Room not found.");
  const data = roomInputSchema.partial().parse(input);
  if (data.number) await assertRoomNumberFree(before.hotelId, data.number, id);
  const room = await db.room.update({ where: { id }, data });
  await audit({ userId, action: "room.updated", entity: "Room", entityId: id, before, after: room });
  if (data.isActive !== undefined || data.roomTypeId !== undefined) {
    const hotel = await getHotel();
    const ids = [...new Set([before.roomTypeId, room.roomTypeId])];
    await enqueueInventorySync({ roomTypeIds: ids, from: todayIn(hotel.timezone), to: toYear(hotel.timezone) }).catch(() => undefined);
  }
  return room;
}

/** Soft delete. Refuses if the room still holds future inventory commitments. */
export async function deleteRoom(id: string, userId?: string | null) {
  const room = await db.room.findUnique({ where: { id } });
  if (!room) throw new AppError("NOT_FOUND", "Room not found.");
  const hotel = await getHotel();
  const future = await db.reservationRoom.count({
    where: { roomId: id, isBlocking: true, checkOut: { gt: toDate(todayIn(hotel.timezone)) }, reservation: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } } },
  });
  if (future > 0) throw new AppError("INVALID_STATE", "This room is assigned to current or future reservations. Reassign them first.");
  await db.room.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ userId, action: "room.deleted", entity: "Room", entityId: id, before: room });
  await enqueueInventorySync({ roomTypeIds: [room.roomTypeId], from: todayIn(hotel.timezone), to: toYear(hotel.timezone) }).catch(() => undefined);
}

async function closeOpenBlocks(tx: Tx, roomId: string, today: string) {
  await tx.roomBlock.updateMany({ where: { roomId, OR: [{ endDate: null }, { endDate: { gt: toDate(today) } }] }, data: { endDate: toDate(today) } });
}

const ALLOWED_MANUAL: Record<RoomStatus, RoomStatus[]> = {
  AVAILABLE: ["DIRTY", "CLEANING", "MAINTENANCE", "OUT_OF_ORDER", "RESERVED"],
  RESERVED: ["AVAILABLE", "DIRTY", "CLEANING", "MAINTENANCE", "OUT_OF_ORDER"],
  OCCUPIED: [],
  DIRTY: ["CLEANING", "MAINTENANCE", "OUT_OF_ORDER"],
  CLEANING: ["DIRTY", "MAINTENANCE", "OUT_OF_ORDER"],
  MAINTENANCE: ["AVAILABLE", "DIRTY", "CLEANING", "OUT_OF_ORDER"],
  OUT_OF_ORDER: ["AVAILABLE", "DIRTY", "CLEANING", "MAINTENANCE"],
};

export interface SetRoomStatusInput {
  roomId: string;
  status: RoomStatus;
  userId?: string | null;
  note?: string;
  /** Used by check-in / check-out which are allowed to move rooms to/from OCCUPIED. */
  system?: boolean;
  /** Set only by an approved housekeeping inspection. Staff cannot mark a dirty room ready themselves. */
  inspectionApproved?: boolean;
}

/**
 * Change a room's operational status. Records who/when/what (RoomStatusLog).
 * MAINTENANCE / OUT_OF_ORDER remove the room from sellable inventory via a RoomBlock.
 */
export async function setRoomStatus(input: SetRoomStatusInput, tx?: Tx) {
  const run = async (t: Tx) => {
    await lockRooms(t, [input.roomId]);
    const room = await t.room.findUnique({ where: { id: input.roomId } });
    if (!room || room.deletedAt) throw new AppError("NOT_FOUND", "Room not found.");
    if (room.status === input.status) return { room, changedInventory: false };
    const privileged = input.system || input.inspectionApproved;
    if (!privileged && !ALLOWED_MANUAL[room.status].includes(input.status)) {
      throw new AppError("INVALID_STATE", `A room cannot be changed from ${room.status} to ${input.status} manually.`);
    }
    if (input.status === "AVAILABLE" && (room.status === "DIRTY" || room.status === "CLEANING") && !privileged) {
      throw new AppError("INVALID_STATE", "This room stays unavailable until a manager approves the housekeeping inspection.");
    }
    if (input.inspectionApproved && input.status === "AVAILABLE" && !["DIRTY", "CLEANING"].includes(room.status)) {
      return { room, changedInventory: false };
    }
    const hotel = await getHotel(t);
    const today = todayIn(hotel.timezone);
    const entering = input.status === "MAINTENANCE" || input.status === "OUT_OF_ORDER";
    const leaving = room.status === "MAINTENANCE" || room.status === "OUT_OF_ORDER";

    if (entering) {
      const conflict = await t.reservationRoom.findFirst({
        where: {
          roomId: room.id,
          isBlocking: true,
          checkOut: { gt: toDate(today) },
          reservation: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } },
        },
        include: { reservation: { select: { number: true } } },
      });
      if (conflict) {
        throw new AppError("CONFLICT", `Room ${room.number} is assigned to reservation ${conflict.reservation.number}. Reassign it before taking the room out of service.`);
      }
      await closeOpenBlocks(t, room.id, today);
      await t.roomBlock.create({ data: { roomId: room.id, type: input.status as "MAINTENANCE" | "OUT_OF_ORDER", startDate: toDate(today), reason: input.note ?? "" } });
    } else if (leaving) {
      await closeOpenBlocks(t, room.id, today);
    }

    let releasedCheckedOut = false;
    if (input.status === "AVAILABLE") {
      const released = await t.reservationRoom.updateMany({
        where: { roomId: room.id, isBlocking: true, reservation: { status: "CHECKED_OUT" } },
        data: { isBlocking: false },
      });
      releasedCheckedOut = released.count > 0;
    }

    const updated = await t.room.update({ where: { id: room.id }, data: { status: input.status } });
    await t.roomStatusLog.create({ data: { roomId: room.id, fromStatus: room.status, toStatus: input.status, userId: input.userId ?? null, note: input.note ?? "" } });

    if (input.status === "AVAILABLE" || input.status === "RESERVED") {
      await t.housekeepingTask.updateMany({
        where: { roomId: room.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: { status: "COMPLETED", completedAt: new Date(), assignedToId: input.userId ?? undefined },
      });
    } else if (input.status === "CLEANING") {
      await t.housekeepingTask.updateMany({
        where: { roomId: room.id, status: "OPEN" },
        data: { status: "IN_PROGRESS", startedAt: new Date(), assignedToId: input.userId ?? undefined },
      });
    }
    await audit({ userId: input.userId, action: "room.status_changed", entity: "Room", entityId: room.id, before: { status: room.status }, after: { status: input.status, note: input.note } }, t);
    return { room: updated, changedInventory: entering || leaving || releasedCheckedOut };
  };
  const result = tx ? await run(tx) : await db.$transaction(run);
  if (result.changedInventory) {
    const hotel = await getHotel();
    await enqueueInventorySync({ roomTypeIds: [result.room.roomTypeId], from: todayIn(hotel.timezone), to: toYear(hotel.timezone) }).catch(() => undefined);
  }
  return result.room;
}

export async function createHousekeepingTask(roomId: string, type: string, notes = "", tx: Tx | typeof db = db) {
  return tx.housekeepingTask.create({ data: { roomId, type, notes } });
}
