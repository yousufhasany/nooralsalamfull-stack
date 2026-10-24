import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createReservation } from "@/server/services/reservation.service";
import { checkIn, checkOut } from "@/server/services/frontdesk.service";
import { setRoomStatus } from "@/server/services/room.service";
import { addDays, todayIn } from "@/lib/dates";
import { createWorld, testGuest } from "./helpers";

const today = () => todayIn("Asia/Riyadh");

async function arrivingToday(world: Awaited<ReturnType<typeof createWorld>>, nights = 2, quantity = 1) {
  return createReservation({
    source: "WALK_IN",
    guest: testGuest(Math.random().toString(36).slice(2, 7)),
    lines: [{ roomTypeId: world.roomType.id, adults: 2, quantity }],
    checkIn: today(),
    checkOut: addDays(today(), nights),
    allowPastDates: true,
  });
}

describe("check-in / check-out", () => {
  it("requires identity verification and a CONFIRMED reservation", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await arrivingToday(w);
    await expect(checkIn({ reservationId: r.id, guestVerified: false })).rejects.toThrow(/verified/i);
    const future = await createReservation({
      source: "PHONE",
      guest: testGuest("f"),
      lines: [{ roomTypeId: w.roomType.id, adults: 1 }],
      checkIn: addDays(today(), 10),
      checkOut: addDays(today(), 11),
    });
    await expect(checkIn({ reservationId: future.id, guestVerified: true })).rejects.toThrow(/early/i);
  });

  it("assigns a ready room, marks it occupied, and double check-in is rejected", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await arrivingToday(w);
    const res = await checkIn({ reservationId: r.id, guestVerified: true });
    expect(res.status).toBe("CHECKED_IN");
    const roomId = res.rooms[0].roomId!;
    expect((await db.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe("OCCUPIED");
    await expect(checkIn({ reservationId: r.id, guestVerified: true })).rejects.toThrow(/already/i);
  });

  it("never assigns a dirty room to an arriving guest", async () => {
    const w = await createWorld({ rooms: 1 });
    await db.room.update({ where: { id: w.roomIds[0] }, data: { status: "DIRTY" } });
    const r = await arrivingToday(w);
    await expect(checkIn({ reservationId: r.id, guestVerified: true })).rejects.toThrow(/ready|available/i);
  });

  it("checkout blocks on unpaid balance, then issues one invoice, dirties the room and creates a housekeeping task", async () => {
    const w = await createWorld({ rooms: 1, taxRate: "5" });
    const r = await arrivingToday(w, 2);
    const ci = await checkIn({ reservationId: r.id, guestVerified: true });
    const roomId = ci.rooms[0].roomId!;

    await expect(checkOut({ reservationId: r.id })).rejects.toThrow(/outstanding balance/i);

    const invoice = await checkOut({
      reservationId: r.id,
      payment: { amount: "630.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" },
    });
    expect(invoice.number).toMatch(/^NAS-INV-\d{4}-\d{6}$/);
    expect(invoice.total.toString()).toBe("630");

    const res = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(res.status).toBe("CHECKED_OUT");
    expect(res.paymentStatus).toBe("PAID");
    expect((await db.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe("DIRTY");
    expect(await db.housekeepingTask.count({ where: { roomId, status: { in: ["OPEN", "IN_PROGRESS"] } } })).toBe(1);
  });

  it("sells a checked-out room again tonight once housekeeping marks it available", async () => {
    const w = await createWorld({ rooms: 1, taxRate: "5" });
    const r = await arrivingToday(w, 2);
    const ci = await checkIn({ reservationId: r.id, guestVerified: true });
    const roomId = ci.rooms[0].roomId!;
    await checkOut({
      reservationId: r.id,
      payment: { amount: "630.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" },
    });
    const { getAvailability } = await import("@/server/services/availability.service");
    const dirty = await getAvailability({ roomTypeIds: [w.roomType.id], checkIn: today(), checkOut: addDays(today(), 1) });
    expect(dirty[0].nights[0].available).toBe(0);

    await setRoomStatus({ roomId, status: "AVAILABLE", inspectionApproved: true, note: "Inspection approved" });
    const ready = await getAvailability({ roomTypeIds: [w.roomType.id], checkIn: today(), checkOut: addDays(today(), 1) });
    expect(ready[0].totalRooms).toBe(1);
    expect(ready[0].nights[0].available).toBe(1);
  });

  it("checks a new guest into a ready checked-out room and records a card payment", async () => {
    const w = await createWorld({ rooms: 1, taxRate: "5" });
    const first = await arrivingToday(w, 2);
    const ci = await checkIn({ reservationId: first.id, guestVerified: true });
    const roomId = ci.rooms[0].roomId!;
    await checkOut({
      reservationId: first.id,
      payment: { amount: "630.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" },
    });
    await db.room.update({ where: { id: roomId }, data: { status: "AVAILABLE" } });

    const second = await arrivingToday(w, 1);
    const again = await checkIn({
      reservationId: second.id,
      guestVerified: true,
      assignments: { [second.rooms[0].id]: roomId },
      deposit: { amount: "100.00", source: "HOTEL_CARD", collectionMethod: "HOTEL_COLLECTED" },
    });
    expect(again.status).toBe("CHECKED_IN");
    expect(again.rooms[0].roomId).toBe(roomId);
    const payment = await db.payment.findFirstOrThrow({ where: { reservationId: second.id } });
    expect(payment.source).toBe("HOTEL_CARD");
    expect(payment.amount.toString()).toBe("100");
  });

  it("counts a check-in payment and requires the rest at check-out", async () => {
    const w = await createWorld({ rooms: 1, taxRate: "5" });
    const r = await arrivingToday(w, 2);
    await checkIn({
      reservationId: r.id,
      guestVerified: true,
      deposit: { amount: "100.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" },
    });
    const stayed = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(stayed.paidAmount.toString()).toBe("100");

    await expect(checkOut({ reservationId: r.id })).rejects.toThrow(/outstanding balance/i);
    await expect(
      checkOut({ reservationId: r.id, payment: { amount: "100.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" } }),
    ).rejects.toThrow(/outstanding balance/i);

    await checkOut({ reservationId: r.id, payment: { amount: "530.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" } });
    const payments = await db.payment.findMany({ where: { reservationId: r.id, status: "SUCCEEDED" } });
    expect(payments.map((p) => p.amount.toString()).sort()).toEqual(["100", "530"]);
  });

  it("early departure frees the remaining nights for sale", async () => {
    const w = await createWorld({ rooms: 1 });
    const r = await arrivingToday(w, 3);
    await checkIn({ reservationId: r.id, guestVerified: true });
    await checkOut({ reservationId: r.id, payment: { amount: "900.00", source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" } });
    // tomorrow is free again
    const next = await createReservation({
      source: "PHONE",
      guest: testGuest("later"),
      lines: [{ roomTypeId: w.roomType.id, adults: 1 }],
      checkIn: addDays(today(), 1),
      checkOut: addDays(today(), 2),
    });
    expect(next.status).toBe("CONFIRMED");
  });
});

describe("room status rules", () => {
  it("blocks maintenance rooms from inventory and rejects illegal transitions", async () => {
    const w = await createWorld({ rooms: 2 });
    await setRoomStatus({ roomId: w.roomIds[0], status: "MAINTENANCE", note: "AC repair" });
    const { getAvailability } = await import("@/server/services/availability.service");
    const [a] = await getAvailability({ roomTypeIds: [w.roomType.id], checkIn: addDays(today(), 1), checkOut: addDays(today(), 2) });
    expect(a.available).toBe(1);
    await setRoomStatus({ roomId: w.roomIds[0], status: "AVAILABLE" });
    const [b] = await getAvailability({ roomTypeIds: [w.roomType.id], checkIn: addDays(today(), 1), checkOut: addDays(today(), 2) });
    expect(b.available).toBe(2);
  });
});
