import { db } from "@/server/db/client";
import type { PaymentCollectionMethod, PaymentSource } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, type MoneyInput } from "@/lib/money";
import { addDays, fromDate, todayIn, toDate } from "@/lib/dates";
import { assertRoomFree, findAssignableRooms, lockRoomTypes, lockRooms } from "./availability.service";
import { getReservationBalance, recordPayment } from "./financial.service";
import { generateInvoice } from "./invoice.service";
import { createHousekeepingTask, setRoomStatus } from "./room.service";
import { getHotel } from "./settings.service";
import { audit } from "./audit.service";
import { notifyReservationEvent } from "./notification.service";
import { enqueueInventorySync } from "./channel-queue.service";

const TX = { timeout: 20_000, maxWait: 15_000 } as const;

export interface PaymentEntry {
  amount: MoneyInput;
  source: PaymentSource;
  collectionMethod: PaymentCollectionMethod;
  reference?: string;
}

export interface CheckInInput {
  reservationId: string;
  /** reservationRoomId -> roomId. Missing entries are auto-assigned. */
  assignments?: Record<string, string>;
  /** Receptionist confirms they have verified the guest's identity documents. */
  guestVerified: boolean;
  deposit?: PaymentEntry;
  userId?: string | null;
  /** Allow arrival before the booked check-in date (early arrival). */
  allowEarly?: boolean;
  now?: Date;
}

export async function checkIn(input: CheckInInput) {
  if (!input.guestVerified) throw new AppError("INVALID_INPUT", "Guest identity must be verified before check-in.");
  const hotel = await getHotel();
  const today = todayIn(hotel.timezone, input.now);

  await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUnique({ where: { id: input.reservationId }, include: { rooms: { include: { roomType: true } } } });
    if (!res || res.deletedAt) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (res.status === "CHECKED_IN") throw new AppError("INVALID_STATE", "This guest is already checked in.");
    if (res.status !== "CONFIRMED") {
      throw new AppError("INVALID_STATE", res.status === "PENDING" ? "Confirm the reservation before check-in." : `A ${res.status.toLowerCase().replace("_", " ")} reservation cannot be checked in.`);
    }
    const checkInDate = fromDate(res.checkIn);
    if (today < checkInDate && !input.allowEarly) {
      throw new AppError("INVALID_STATE", `Arrival is on ${checkInDate}. Enable early check-in to proceed.`);
    }
    if (today >= fromDate(res.checkOut)) throw new AppError("INVALID_STATE", "The stay period has already ended.");

    await lockRoomTypes(tx, res.rooms.map((r) => r.roomTypeId));
    const used = new Set<string>();
    for (const rr of res.rooms) {
      let roomId = input.assignments?.[rr.id] ?? rr.roomId;
      const ci = fromDate(rr.checkIn);
      const co = fromDate(rr.checkOut);
      if (!roomId) {
        const candidates = await findAssignableRooms(tx, { roomTypeId: rr.roomTypeId, checkIn: ci, checkOut: co, excludeReservationRoomId: rr.id, requireReady: true });
        const pick = candidates.find((c) => !used.has(c.id));
        if (!pick) throw new AppError("ROOM_UNAVAILABLE", `No ready ${rr.roomType.nameEn} is available right now. Clean or release a room, or assign a different room.`);
        roomId = pick.id;
      }
      if (used.has(roomId)) throw new AppError("INVALID_INPUT", "The same room cannot be assigned twice.");
      used.add(roomId);
      const room = await assertRoomFree(tx, roomId, ci, co, rr.id);
      if (!["AVAILABLE", "RESERVED"].includes(room.status)) {
        throw new AppError("INVALID_STATE", `Room ${room.number} is ${room.status} and cannot be given to a guest.`);
      }
      await tx.reservationRoom.update({ where: { id: rr.id }, data: { roomId } });
      await setRoomStatus({ roomId, status: "OCCUPIED", userId: input.userId, system: true, note: `Check-in ${res.number}` }, tx);
    }

    if (input.deposit && D(input.deposit.amount).greaterThan(0)) {
      await recordPayment(tx, { reservationId: res.id, userId: input.userId, ...input.deposit, note: "Deposit at check-in" });
    }
    await tx.reservation.update({ where: { id: res.id }, data: { status: "CHECKED_IN", checkedInAt: input.now ?? new Date() } });
    await audit({ userId: input.userId, action: "guest.checked_in", entity: "Reservation", entityId: res.id, before: { status: "CONFIRMED" }, after: { status: "CHECKED_IN", rooms: [...used] } }, tx);
  }, TX);

  void notifyReservationEvent("guest.checked_in", input.reservationId);
  return db.reservation.findUniqueOrThrow({ where: { id: input.reservationId }, include: { rooms: { include: { room: true } } } });
}

export interface CheckOutInput {
  reservationId: string;
  payment?: PaymentEntry;
  /** Permit leaving with an unpaid balance (requires a manager decision; audited). */
  allowOutstanding?: boolean;
  userId?: string | null;
  now?: Date;
}

export async function checkOut(input: CheckOutInput) {
  const hotel = await getHotel();
  const today = todayIn(hotel.timezone, input.now);

  const out = await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUnique({ where: { id: input.reservationId }, include: { rooms: true } });
    if (!res || res.deletedAt) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (res.status !== "CHECKED_IN") throw new AppError("INVALID_STATE", "Only checked-in guests can be checked out.");
    await lockRooms(tx, res.rooms.map((r) => r.roomId).filter((x): x is string => !!x));

    if (input.payment && D(input.payment.amount).greaterThan(0)) {
      await recordPayment(tx, { reservationId: res.id, userId: input.userId, ...input.payment, note: "Payment at check-out" });
    }
    const bal = await getReservationBalance(tx, res.id);
    // OTA-collected bookings: what the OTA collected is already counted as paid, so only extras remain due here.
    if (bal.balance.greaterThan(0) && !input.allowOutstanding) {
      throw new AppError("PAYMENT_FAILED", `An outstanding balance of ${bal.balance.toFixed(2)} ${res.currency} must be settled before check-out.`);
    }

    const invoice = await generateInvoice(res.id, input.userId, tx);

    const plannedOut = fromDate(res.checkOut);
    const early = today < plannedOut;
    for (const rr of res.rooms) {
      if (rr.roomId) {
        await setRoomStatus({ roomId: rr.roomId, status: "DIRTY", userId: input.userId, system: true, note: `Check-out ${res.number}` }, tx);
        await createHousekeepingTask(rr.roomId, "CHECKOUT_CLEAN", `Departed ${res.number}`, tx);
      }
      // An early departure frees the remaining nights for sale. The ledger is not touched: charges for
      // unused nights stay as booked unless staff post an explicit adjustment. A same-day departure keeps
      // the arrival night (a stay needs at least one night).
      if (early) {
        const released = today > fromDate(rr.checkIn) ? today : addDays(fromDate(rr.checkIn), 1);
        await tx.reservationRoom.update({ where: { id: rr.id }, data: { checkOut: toDate(released) } });
      }
    }
    await tx.reservation.update({ where: { id: res.id }, data: { status: "CHECKED_OUT", checkedOutAt: input.now ?? new Date() } });
    await audit(
      {
        userId: input.userId,
        action: "guest.checked_out",
        entity: "Reservation",
        entityId: res.id,
        before: { status: "CHECKED_IN" },
        after: { status: "CHECKED_OUT", invoice: invoice.number, outstanding: bal.balance.toFixed(2), earlyDeparture: early },
      },
      tx,
    );
    return { invoice, roomTypeIds: res.rooms.map((r) => r.roomTypeId), early, plannedOut };
  }, TX);

  if (out.early) await enqueueInventorySync({ roomTypeIds: out.roomTypeIds, from: today, to: out.plannedOut }).catch(() => undefined);
  void notifyReservationEvent("guest.checked_out", input.reservationId);
  return out.invoice;
}

/** Reassign a physical room before check-in (or for a checked-in guest, e.g. a room move). */
export async function changeAssignedRoom(args: { reservationRoomId: string; roomId: string; userId?: string | null }) {
  await db.$transaction(async (tx) => {
    const rr = await tx.reservationRoom.findUnique({ where: { id: args.reservationRoomId }, include: { reservation: true } });
    if (!rr) throw new AppError("NOT_FOUND", "Reservation room not found.");
    if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(rr.reservation.status)) throw new AppError("INVALID_STATE", "This reservation can no longer be changed.");
    const target = await tx.room.findUnique({ where: { id: args.roomId } });
    if (!target) throw new AppError("NOT_FOUND", "Room not found.");
    if (target.roomTypeId !== rr.roomTypeId) throw new AppError("INVALID_INPUT", "Choose a room of the booked room type, or change the room type via modify.");
    await assertRoomFree(tx, args.roomId, fromDate(rr.checkIn), fromDate(rr.checkOut), rr.id);
    if (rr.reservation.status === "CHECKED_IN") {
      if (!["AVAILABLE", "RESERVED"].includes(target.status)) throw new AppError("INVALID_STATE", `Room ${target.number} is not ready.`);
      if (rr.roomId) {
        await setRoomStatus({ roomId: rr.roomId, status: "DIRTY", userId: args.userId, system: true, note: "Guest moved rooms" }, tx);
        await createHousekeepingTask(rr.roomId, "CHECKOUT_CLEAN", "Guest moved rooms", tx);
      }
      await setRoomStatus({ roomId: args.roomId, status: "OCCUPIED", userId: args.userId, system: true, note: "Guest moved rooms" }, tx);
    }
    await tx.reservationRoom.update({ where: { id: rr.id }, data: { roomId: args.roomId } });
    await audit({ userId: args.userId, action: "reservation.room_assigned", entity: "Reservation", entityId: rr.reservationId, after: { reservationRoomId: rr.id, roomId: args.roomId } }, tx);
  }, TX);
}
