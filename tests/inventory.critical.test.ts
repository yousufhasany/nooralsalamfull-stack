import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createReservation } from "@/server/services/reservation.service";
import { getAvailability } from "@/server/services/availability.service";
import { createWorld, stay, testGuest, type World } from "./helpers";
import type { ReservationSource } from "@/generated/prisma/enums";

const UNAVAILABLE = "Room is no longer available.";

async function book(world: World, source: ReservationSource, channelCode: string | null, n: number, rooms = 1, offset = 20) {
  return createReservation({
    source,
    channelId: channelCode ? world.channels[channelCode] : null,
    guest: testGuest(`${source}-${n}`),
    lines: [{ roomTypeId: world.roomType.id, adults: 2, quantity: rooms }],
    ...stay(offset),
    paymentCollection: "PAY_AT_HOTEL",
    allowPastDates: true,
  });
}

async function available(world: World, offset = 20) {
  const [a] = await getAvailability({ roomTypeIds: [world.roomType.id], ...stay(offset) });
  return a.available;
}

describe("CRITICAL: central inventory across all channels", () => {
  let world: World;
  beforeAll(async () => {
    world = await createWorld({ rooms: 20 });
  });

  it("20 rooms - 5 direct - 6 Booking.com - 3 Agoda - 2 Trip.com leaves exactly 4", async () => {
    for (let i = 0; i < 5; i++) await book(world, "DIRECT_WEBSITE", null, i);
    for (let i = 0; i < 6; i++) await book(world, "BOOKING_COM", "BOOKING_COM", i);
    for (let i = 0; i < 3; i++) await book(world, "AGODA", "AGODA", i);
    for (let i = 0; i < 2; i++) await book(world, "TRIP_COM", "TRIP_COM", i);

    expect(await available(world)).toBe(4);
    const count = await db.reservation.count({ where: { status: "CONFIRMED" } });
    expect(count).toBe(16);
  });

  it("rejects a request for 5 rooms when only 4 remain", async () => {
    await expect(book(world, "DIRECT_WEBSITE", null, 99, 5)).rejects.toThrow(UNAVAILABLE);
    expect(await available(world)).toBe(4);
  });

  it("accepts exactly the 4 remaining rooms, then rejects one more", async () => {
    await book(world, "DIRECT_WEBSITE", null, 100, 4);
    expect(await available(world)).toBe(0);
    await expect(book(world, "BOOKING_COM", "BOOKING_COM", 101, 1)).rejects.toThrow(UNAVAILABLE);
  });
});

describe("CRITICAL: concurrent booking requests never oversell", () => {
  it("30 simultaneous single-room requests on 20 rooms: exactly 20 succeed", async () => {
    const world = await createWorld({ rooms: 20 });
    const sources: Array<[ReservationSource, string | null]> = [
      ["DIRECT_WEBSITE", null],
      ["BOOKING_COM", "BOOKING_COM"],
      ["AGODA", "AGODA"],
      ["TRIP_COM", "TRIP_COM"],
    ];
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) => {
        const [s, c] = sources[i % sources.length];
        return book(world, s, c, i);
      }),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toBe(20);
    expect(failed).toHaveLength(10);
    for (const f of failed) expect(String(f.reason?.message)).toBe(UNAVAILABLE);
    expect(await available(world)).toBe(0);
  });

  it("concurrent multi-room requests: total booked rooms never exceed 20", async () => {
    const world = await createWorld({ rooms: 20 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => book(world, "DIRECT_WEBSITE", null, i, 3)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(6); // 6 x 3 = 18 rooms; the remaining 2 cannot satisfy a 3-room request
    expect(await available(world)).toBe(2);
    const held = await db.reservationRoom.count({ where: { isBlocking: true } });
    expect(held).toBe(18);
  });

  it("5 racing requests for the last 4 rooms (x1 each, then x2): no oversell", async () => {
    const world = await createWorld({ rooms: 4 });
    const results = await Promise.allSettled([
      book(world, "DIRECT_WEBSITE", null, 1, 2),
      book(world, "BOOKING_COM", "BOOKING_COM", 2, 2),
      book(world, "AGODA", "AGODA", 3, 2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await available(world)).toBe(0);
  });
});
