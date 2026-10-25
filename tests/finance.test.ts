import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { cancelReservation, createReservation, modifyReservation } from "@/server/services/reservation.service";
import { getAvailability } from "@/server/services/availability.service";
import { recordPayment, recordRefund, getReservationBalance } from "@/server/services/financial.service";
import { addDays, isoWeekday, todayIn } from "@/lib/dates";
import { createWorld, stay, testGuest, type World } from "./helpers";

async function reserve(world: World, opts: { offset?: number; nights?: number; promotionCode?: string; collection?: "PAY_AT_HOTEL" | "ONLINE_PAYMENT" } = {}) {
  return createReservation({
    source: "PHONE",
    guest: testGuest(Math.random().toString(36).slice(2, 8)),
    lines: [{ roomTypeId: world.roomType.id, adults: 2 }],
    ...stay(opts.offset ?? 20, opts.nights ?? 2),
    promotionCode: opts.promotionCode,
    paymentCollection: opts.collection ?? "PAY_AT_HOTEL",
  });
}

const pay = (reservationId: string, amount: string) =>
  db.$transaction((tx) => recordPayment(tx, { reservationId, amount, source: "HOTEL_CASH", collectionMethod: "HOTEL_COLLECTED" }));

describe("pricing and tax (server-side, decimal-safe)", () => {
  it("exclusive tax: 2 nights x 300 + 7.5% = 645.00", async () => {
    const w = await createWorld({ rooms: 2, taxRate: "7.5" });
    const r = await reserve(w);
    expect(r.roomsSubtotal.toString()).toBe("600");
    expect(r.taxTotal.toString()).toBe("45");
    expect(r.totalAmount.toString()).toBe("645");
  });

  it("no tax configured => no tax (nothing is hard-coded)", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await reserve(w);
    expect(r.taxTotal.toString()).toBe("0");
    expect(r.totalAmount.toString()).toBe("600");
  });

  it("inclusive tax: gross stays 600.00 and tax is extracted (54.55)", async () => {
    const w = await createWorld({ rooms: 2, taxRate: "10", pricesIncludeTax: true });
    const r = await reserve(w);
    expect(r.totalAmount.toString()).toBe("600");
    expect(r.taxTotal.toString()).toBe("54.55");
    expect(r.roomsSubtotal.toString()).toBe("545.45");
  });

  it("weekend nights use the weekend price", async () => {
    const w = await createWorld({ rooms: 2, weekendPrice: "500.00" });
    const today = todayIn("Asia/Riyadh");
    let friday = addDays(today, 10);
    while (isoWeekday(friday) !== 5) friday = addDays(friday, 1);
    const sunday = addDays(friday, 2);
    const fri = await createReservation({ source: "PHONE", guest: testGuest("w1"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn: friday, checkOut: addDays(friday, 1) });
    const sun = await createReservation({ source: "PHONE", guest: testGuest("w2"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn: sunday, checkOut: addDays(sunday, 1) });
    expect(fri.totalAmount.toString()).toBe("500");
    expect(sun.totalAmount.toString()).toBe("300");
  });

  it("a staff price per night replaces the room type price and survives a date change", async () => {
    const w = await createWorld({ rooms: 2, weekendPrice: "500.00", taxRate: "15" });
    const today = todayIn("Asia/Riyadh");
    let friday = addDays(today, 10);
    while (isoWeekday(friday) !== 5) friday = addDays(friday, 1);
    const base = { source: "WALK_IN" as const, guest: testGuest("manual"), checkIn: addDays(friday, -1), checkOut: addDays(friday, 1) };
    await expect(createReservation({ ...base, lines: [{ roomTypeId: w.roomType.id, adults: 1, nightlyPrice: "abc" }] })).rejects.toThrow(/price per night/i);

    const r = await createReservation({ ...base, lines: [{ roomTypeId: w.roomType.id, adults: 1, nightlyPrice: "150" }] });
    expect(r.roomsSubtotal.toString()).toBe("300");
    expect(r.taxTotal.toString()).toBe("0");
    expect(r.totalAmount.toString()).toBe("300");

    const m = await modifyReservation({ reservationId: r.id, checkOut: addDays(friday, 2) });
    expect(m.roomsSubtotal.toString()).toBe("450");
    expect(m.taxTotal.toString()).toBe("0");
    expect(m.totalAmount.toString()).toBe("450");
  });

  it("percent promotion is validated and applied on the server", async () => {
    const w = await createWorld({ rooms: 3 });
    const today = todayIn("Asia/Riyadh");
    await db.promotion.create({
      data: { code: "TEST10", nameEn: "t", nameAr: "t", nameBn: "t", discountType: "PERCENT", amount: "10", startDate: new Date(addDays(today, -1)), endDate: new Date(addDays(today, 90)), usageLimit: 1 },
    });
    const r = await reserve(w, { promotionCode: "TEST10" });
    expect(r.discountTotal.toString()).toBe("60");
    expect(r.totalAmount.toString()).toBe("540");
    await expect(reserve(w, { promotionCode: "TEST10" })).rejects.toThrow(/usage limit/i);
    await expect(reserve(w, { promotionCode: "NOPE" })).rejects.toThrow(/not valid/i);
  });

  it("rejects past dates, zero-night stays and over-capacity occupancy", async () => {
    const w = await createWorld({ rooms: 2 });
    const today = todayIn("Asia/Riyadh");
    const base = { source: "DIRECT_WEBSITE" as const, guest: testGuest("x"), lines: [{ roomTypeId: w.roomType.id, adults: 2 }] };
    await expect(createReservation({ ...base, checkIn: addDays(today, -3), checkOut: addDays(today, -1) })).rejects.toThrow(/past/i);
    await expect(createReservation({ ...base, checkIn: addDays(today, 5), checkOut: addDays(today, 5) })).rejects.toThrow(/after check-in/i);
    await expect(createReservation({ ...base, lines: [{ roomTypeId: w.roomType.id, adults: 9 }], ...stay() })).rejects.toThrow(/capacity/i);
  });
});

describe("payments, refunds and payment status", () => {
  it("pay-at-hotel is never shown as paid until money is recorded", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await reserve(w);
    expect(r.paymentStatus).toBe("PAY_AT_HOTEL");
    await pay(r.id, "200.00");
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).paymentStatus).toBe("PARTIALLY_PAID");
    await pay(r.id, "400.00");
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).paymentStatus).toBe("PAID");
  });

  it("refunds cannot exceed the payment and update the status", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await reserve(w);
    const p = await pay(r.id, "600.00");
    await expect(db.$transaction((tx) => recordRefund(tx, { paymentId: p.id, amount: "700.00", reason: "x" }))).rejects.toThrow(/exceeds/i);
    await db.$transaction((tx) => recordRefund(tx, { paymentId: p.id, amount: "100.00", reason: "goodwill" }));
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).paymentStatus).toBe("PARTIALLY_REFUNDED");
    await db.$transaction((tx) => recordRefund(tx, { paymentId: p.id, amount: "500.00", reason: "rest" }));
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).paymentStatus).toBe("REFUNDED");
    const bal = await getReservationBalance(db, r.id);
    expect(bal.net.toString()).toBe("0");
  });

  it("rejects zero and negative payments", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await reserve(w);
    await expect(pay(r.id, "0")).rejects.toThrow();
    await expect(pay(r.id, "-5")).rejects.toThrow();
  });
});

describe("ledger integrity", () => {
  it("ledger rows are append-only (database rejects UPDATE and DELETE)", async () => {
    const w = await createWorld({ rooms: 2 });
    const r = await reserve(w);
    const row = await db.financialTransaction.findFirstOrThrow({ where: { reservationId: r.id } });
    await expect(db.financialTransaction.update({ where: { id: row.id }, data: { description: "tamper" } })).rejects.toThrow();
    await expect(db.financialTransaction.delete({ where: { id: row.id } })).rejects.toThrow();
    const audit = await db.auditLog.findFirstOrThrow({});
    await expect(db.auditLog.update({ where: { id: audit.id }, data: { action: "tamper" } })).rejects.toThrow();
    await db.auditLog.delete({ where: { id: audit.id } });
    await expect(db.auditLog.findUnique({ where: { id: audit.id } })).resolves.toBeNull();
  });

  it("cancelling reverses charges without deleting history and frees inventory", async () => {
    const w = await createWorld({ rooms: 1, taxRate: "5" });
    const r = await reserve(w);
    const before = await db.financialTransaction.count({ where: { reservationId: r.id } });
    const [a0] = await getAvailability({ roomTypeIds: [w.roomType.id], ...stay() });
    expect(a0.available).toBe(0);

    await cancelReservation({ reservationId: r.id, reason: "guest request" });
    const after = await db.financialTransaction.count({ where: { reservationId: r.id } });
    expect(after).toBeGreaterThan(before);
    const net = await db.financialTransaction.aggregate({ where: { reservationId: r.id, category: { in: ["REVENUE", "TAX"] } }, _sum: { amount: true } });
    expect(net._sum.amount?.toString()).toBe("0");
    const res = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(res.status).toBe("CANCELLED");
    expect(res.totalAmount.toString()).toBe("0");
    const [a1] = await getAvailability({ roomTypeIds: [w.roomType.id], ...stay() });
    expect(a1.available).toBe(1);

    // idempotent
    await cancelReservation({ reservationId: r.id, reason: "again" });
    expect(await db.financialTransaction.count({ where: { reservationId: r.id } })).toBe(after);
  });

  it("modifying dates re-prices through reversal + repost and checks availability", async () => {
    const w = await createWorld({ rooms: 1 });
    const r = await reserve(w, { nights: 2 });
    const rowsBefore = await db.financialTransaction.count({ where: { reservationId: r.id } });
    const { checkIn } = stay();
    await modifyReservation({ reservationId: r.id, checkIn, checkOut: addDays(checkIn, 3) });
    const res = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(res.nights).toBe(3);
    expect(res.totalAmount.toString()).toBe("900");
    expect(await db.financialTransaction.count({ where: { reservationId: r.id } })).toBeGreaterThan(rowsBefore);

    // a second booking blocks the modification of the first
    const other = await createReservation({ source: "PHONE", guest: testGuest("o"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn: addDays(checkIn, 3), checkOut: addDays(checkIn, 5) });
    await expect(modifyReservation({ reservationId: r.id, checkIn, checkOut: addDays(checkIn, 4) })).rejects.toThrow(/no longer available/i);
    expect(other.status).toBe("CONFIRMED");
  });

  it("same-day turnover: a stay may start on the day another ends", async () => {
    const w = await createWorld({ rooms: 1, sameDayTurnover: true });
    const { checkIn, checkOut } = stay(20, 2);
    await createReservation({ source: "PHONE", guest: testGuest("a"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn, checkOut });
    await expect(
      createReservation({ source: "PHONE", guest: testGuest("b"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn: addDays(checkIn, 1), checkOut: addDays(checkOut, 1) }),
    ).rejects.toThrow(/no longer available/i);
    await createReservation({ source: "PHONE", guest: testGuest("c"), lines: [{ roomTypeId: w.roomType.id, adults: 1 }], checkIn: checkOut, checkOut: addDays(checkOut, 1) });
  });
});

describe("multi-room reservations", () => {
  it("books several rooms in one reservation and prices each", async () => {
    const w = await createWorld({ rooms: 5 });
    const r = await createReservation({ source: "DIRECT_WEBSITE", guest: testGuest("m"), lines: [{ roomTypeId: w.roomType.id, adults: 2, quantity: 3 }], ...stay() });
    expect(r.rooms).toHaveLength(3);
    expect(r.totalAmount.toString()).toBe("1800");
    const [a] = await getAvailability({ roomTypeIds: [w.roomType.id], ...stay() });
    expect(a.available).toBe(2);
  });
});
