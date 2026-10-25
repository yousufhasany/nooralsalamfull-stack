import { z } from "zod";
import { db, type Tx } from "@/server/db/client";
import type {
  PaymentCollectionMethod,
  ReservationSource,
  ReservationStatus,
} from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, ZERO, round2, toDb } from "@/lib/money";
import { diffDays, todayIn, toDate, fromDate, type DateStr, isDateStr, addDays } from "@/lib/dates";
import { getHotel, getSettings } from "./settings.service";
import {
  assertInventory,
  assertRoomFree,
  findRestrictionViolation,
  lockRoomTypes,
  validateStayDates,
} from "./availability.service";
import { findOrCreateGuest, type GuestInput } from "./guest.service";
import {
  buildQuote,
  findPromotion,
  loadPricingContext,
  withPriceOverride,
  type PromotionData,
  type QuoteBreakdown,
  type TaxLine,
} from "./pricing.service";
import {
  postLedger,
  postStayCharges,
  refreshPaymentStatus,
  refreshReservationTotals,
  reverseScope,
} from "./financial.service";
import { audit } from "./audit.service";
import { notifyReservationEvent } from "./notification.service";
import { enqueueInventorySync } from "./channel-queue.service";
import { createHousekeepingTask, setRoomStatus } from "./room.service";

const TX_OPTIONS = { timeout: 20_000, maxWait: 15_000 } as const;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface RoomLineInput {
  roomTypeId: string;
  ratePlanId?: string | null;
  adults: number;
  children?: number;
  quantity?: number;
  /** Staff-only: price per night for each room on this line, used instead of the room type price. */
  nightlyPrice?: string | null;
}

/** Amounts delivered by an OTA. They replace the pricing engine and are never recomputed. */
export interface ExternalPricing {
  currency: string;
  /** Room charge before tax, for the whole reservation. */
  netRoomCharge: string;
  netDiscount?: string;
  taxLines?: TaxLine[];
}

export interface CreateReservationInput {
  source: ReservationSource;
  channelId?: string | null;
  externalReservationId?: string | null;
  guest: GuestInput | { guestId: string };
  lines: RoomLineInput[];
  checkIn: DateStr;
  checkOut: DateStr;
  promotionCode?: string | null;
  paymentCollection?: PaymentCollectionMethod;
  specialRequests?: string;
  internalNotes?: string;
  locale?: "en" | "ar" | "bn";
  status?: ReservationStatus;
  actorId?: string | null;
  auditSource?: "ADMIN" | "WEBSITE" | "SYSTEM" | "CHANNEL" | "API";
  /** OTA imports must be recorded even if the hotel is already full; the booking is then flagged. */
  allowOverbooking?: boolean;
  external?: ExternalPricing;
  /** Back-office entries (phone / walk-in / OTA) may use past dates (e.g. same-day walk-in or historic import). */
  allowPastDates?: boolean;
  skipRestrictions?: boolean;
  isDemo?: boolean;
  now?: Date;
}

export const publicBookingSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().optional().nullable(),
  checkIn: z.string().refine(isDateStr, "Invalid check-in date"),
  checkOut: z.string().refine(isDateStr, "Invalid check-out date"),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20).default(0),
  rooms: z.coerce.number().int().min(1).max(10).default(1),
  promotionCode: z.string().trim().max(40).optional().nullable(),
  paymentMethod: z.enum(["PAY_AT_HOTEL", "ONLINE_PAYMENT"]).default("PAY_AT_HOTEL"),
  specialRequests: z.string().trim().max(1000).optional().default(""),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextReservationNumber(tx: Tx, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ReservationCounter" ("year", "value") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "ReservationCounter"."value" + 1
    RETURNING "value"`;
  return `NAS-${year}-${String(rows[0].value).padStart(6, "0")}`;
}

function aggregateQuotes(quotes: QuoteBreakdown[]) {
  let netRooms = ZERO;
  let netDiscount = ZERO;
  const taxMap = new Map<string, TaxLine>();
  for (const q of quotes) {
    netRooms = netRooms.plus(q.netRoomsSubtotal);
    netDiscount = netDiscount.plus(q.netDiscount);
    for (const t of q.taxes) {
      const prev = taxMap.get(t.code);
      if (prev) {
        prev.amount = toDb(D(prev.amount).plus(t.amount));
        prev.taxableAmount = toDb(D(prev.taxableAmount).plus(t.taxableAmount));
      } else taxMap.set(t.code, { ...t });
    }
  }
  return { netRooms, netDiscount, taxLines: [...taxMap.values()] };
}

interface ExpandedRoom {
  roomTypeId: string;
  ratePlanId: string | null;
  adults: number;
  children: number;
  nightlyPrice: string | null;
}

function parseNightlyPrice(v: string | null | undefined): string | null {
  if (v == null || v.trim() === "") return null;
  const s = v.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new AppError("INVALID_INPUT", "Enter the price per night as a number, for example 150 or 150.50.", { field: "nightlyPrice" });
  if (D(s).greaterThan(1_000_000)) throw new AppError("INVALID_INPUT", "The price per night is too large.", { field: "nightlyPrice" });
  return toDb(D(s));
}

function expandLines(lines: RoomLineInput[]): ExpandedRoom[] {
  const out: ExpandedRoom[] = [];
  for (const l of lines) {
    const qty = l.quantity ?? 1;
    if (qty < 1) throw new AppError("INVALID_INPUT", "Room quantity must be at least 1.");
    const nightlyPrice = parseNightlyPrice(l.nightlyPrice);
    for (let i = 0; i < qty; i++) {
      out.push({ roomTypeId: l.roomTypeId, ratePlanId: l.ratePlanId ?? null, adults: l.adults, children: l.children ?? 0, nightlyPrice });
    }
  }
  return out;
}

function evenSplit(total: string, nights: DateStr[]): { date: DateStr; price: string }[] {
  const per = round2(D(total).div(nights.length));
  let remaining = D(total);
  return nights.map((date, i) => {
    const price = i === nights.length - 1 ? remaining : per;
    remaining = remaining.minus(price);
    return { date, price: toDb(price) };
  });
}

function nightsRange(checkIn: DateStr, checkOut: DateStr): DateStr[] {
  return Array.from({ length: diffDays(checkIn, checkOut) }, (_, i) => addDays(checkIn, i));
}

function promotionForLine(promo: PromotionData | null, index: number): PromotionData | null {
  if (!promo) return null;
  // A fixed-amount code is a per-stay discount: apply it once, on the first room line.
  if (promo.discountType === "FIXED" && index > 0) return null;
  return promo;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createReservation(input: CreateReservationInput) {
  const now = input.now ?? new Date();
  const hotel = await getHotel();
  const [booking, pricing, tax] = await Promise.all([
    getSettings(hotel.id, "booking"),
    getSettings(hotel.id, "pricing"),
    getSettings(hotel.id, "tax"),
  ]);
  const today = todayIn(hotel.timezone, now);
  const isExternal = !!input.external;

  const nights = validateStayDates(input.checkIn, input.checkOut, {
    today,
    minStay: isExternal ? 1 : booking.minStay,
    maxStay: isExternal ? 365 : booking.maxStay,
    maxAdvanceDays: isExternal ? 1000 : booking.maxAdvanceDays,
    allowPast: input.allowPastDates || isExternal,
  });

  const rooms = expandLines(input.lines);
  if (rooms.length === 0) throw new AppError("INVALID_INPUT", "Select at least one room.");
  if (rooms.length > booking.maxRoomsPerBooking && !isExternal) {
    throw new AppError("INVALID_INPUT", `A maximum of ${booking.maxRoomsPerBooking} rooms can be booked at once.`, { field: "rooms" });
  }

  const requested = new Map<string, number>();
  for (const r of rooms) requested.set(r.roomTypeId, (requested.get(r.roomTypeId) ?? 0) + 1);

  // Occupancy rules (only for hotel-originated bookings; OTAs enforce their own).
  if (!isExternal) {
    const types = await db.roomType.findMany({ where: { id: { in: [...requested.keys()] }, deletedAt: null, isActive: true } });
    for (const r of rooms) {
      const t = types.find((x) => x.id === r.roomTypeId);
      if (!t) throw new AppError("NOT_FOUND", "Room type not found.");
      if (r.adults > t.maxAdults || r.children > t.maxChildren || r.adults + r.children > t.maxOccupancy) {
        throw new AppError("INVALID_INPUT", `The number of guests exceeds the capacity of ${t.nameEn}.`, { field: "adults" });
      }
    }
    if (!input.skipRestrictions) {
      for (const roomTypeId of requested.keys()) {
        const v = await findRestrictionViolation({
          roomTypeId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          channelId: input.channelId ?? null,
        });
        if (v) throw new AppError("ROOM_UNAVAILABLE", v);
      }
    }
  }

  const promoBase = input.promotionCode?.trim() ? await findPromotion(db, input.promotionCode) : null;
  if (input.promotionCode?.trim() && !promoBase) throw new AppError("INVALID_INPUT", "This promotion code is not valid.", { field: "promotionCode" });

  const collection: PaymentCollectionMethod = input.paymentCollection ?? "PAY_AT_HOTEL";
  const defaultStatus: ReservationStatus =
    input.status ?? (collection === "ONLINE_PAYMENT" ? "PENDING" : input.source === "DIRECT_WEBSITE" && !booking.autoConfirmDirect ? "PENDING" : "CONFIRMED");

  const result = await db.$transaction(async (tx) => {
    // 1. Lock + re-check inventory immediately before writing (double-booking protection).
    let overbooked = false;
    try {
      await assertInventory(tx, { requested, checkIn: input.checkIn, checkOut: input.checkOut });
    } catch (e) {
      if (input.allowOverbooking && e instanceof AppError && e.code === "ROOM_UNAVAILABLE") overbooked = true;
      else throw e;
    }

    const guest =
      "guestId" in input.guest
        ? await tx.guest.findUniqueOrThrow({ where: { id: input.guest.guestId } })
        : await findOrCreateGuest({ ...input.guest, preferredLocale: input.guest.preferredLocale ?? input.locale }, tx, { isDemo: input.isDemo });

    // 2. Price on the server.
    const quotes: QuoteBreakdown[] = [];
    const roomRows: { room: ExpandedRoom; nightly: { date: DateStr; price: string }[]; subtotal: string }[] = [];
    let currency = hotel.currency;
    let netRooms: ReturnType<typeof D>;
    let netDiscount: ReturnType<typeof D>;
    let taxLines: TaxLine[];
    let promotionId: string | null = null;

    if (input.external) {
      currency = input.external.currency;
      netRooms = D(input.external.netRoomCharge);
      netDiscount = D(input.external.netDiscount ?? 0);
      taxLines = input.external.taxLines ?? [];
      const perRoom = round2(netRooms.div(rooms.length));
      for (const r of rooms) {
        roomRows.push({ room: r, nightly: evenSplit(toDb(perRoom), nightsRange(input.checkIn, input.checkOut)), subtotal: toDb(perRoom) });
      }
    } else {
      // group identical lines so the promotion/discount is computed on the subtotal
      const grouped = new Map<string, { room: ExpandedRoom; count: number }>();
      for (const r of rooms) {
        const key = `${r.roomTypeId}|${r.ratePlanId ?? ""}|${r.nightlyPrice ?? ""}`;
        const g = grouped.get(key);
        if (g) g.count++;
        else grouped.set(key, { room: r, count: 1 });
      }
      let idx = 0;
      for (const g of grouped.values()) {
        const ctx = withPriceOverride(
          await loadPricingContext(tx, g.room.roomTypeId, g.room.ratePlanId, input.checkIn, addDays(input.checkOut, -1), pricing.weekendDays),
          g.room.nightlyPrice,
        );
        const quote = buildQuote({
          ctx,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          rooms: g.count,
          source: input.source,
          currency: hotel.currency,
          // A price typed by staff is the amount charged. VAT is not added on top of it.
          taxRules: g.room.nightlyPrice != null ? [] : tax.rules,
          pricesIncludeTax: tax.pricesIncludeTax,
          promotion: promotionForLine(promoBase, idx),
          today,
        });
        quotes.push(quote);
        if (quote.promotionId) promotionId = quote.promotionId;
        for (let i = 0; i < g.count; i++) roomRows.push({ room: g.room, nightly: quote.nightly, subtotal: quote.perRoomTotal });
        idx++;
      }
      const agg = aggregateQuotes(quotes);
      netRooms = agg.netRooms;
      netDiscount = agg.netDiscount;
      taxLines = agg.taxLines;
    }

    // 3. Promotion usage is incremented atomically and respects the usage limit.
    if (promotionId) {
      const updated = await tx.$executeRaw`
        UPDATE "Promotion" SET "usedCount" = "usedCount" + 1
        WHERE "id" = ${promotionId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
      if (updated === 0) throw new AppError("INVALID_INPUT", "This promotion code has reached its usage limit.");
    }

    // 4. Create reservation.
    const number = await nextReservationNumber(tx, Number(today.slice(0, 4)));
    const totalAdults = rooms.reduce((a, r) => a + r.adults, 0);
    const totalChildren = rooms.reduce((a, r) => a + r.children, 0);
    const holdExpiresAt =
      defaultStatus === "PENDING" && collection === "ONLINE_PAYMENT" ? new Date(now.getTime() + booking.holdMinutes * 60_000) : null;

    const reservation = await tx.reservation.create({
      data: {
        number,
        hotelId: hotel.id,
        guestId: guest.id,
        source: input.source,
        channelId: input.channelId ?? null,
        externalReservationId: input.externalReservationId ?? null,
        status: defaultStatus,
        paymentCollection: collection,
        paymentStatus: collection === "UNKNOWN" ? "INFORMATION_NOT_PROVIDED" : collection === "PAY_AT_HOTEL" ? "PAY_AT_HOTEL" : "UNPAID",
        ratePlanId: rooms[0].ratePlanId,
        promotionId,
        checkIn: toDate(input.checkIn),
        checkOut: toDate(input.checkOut),
        nights,
        adults: totalAdults,
        children: totalChildren,
        currency,
        specialRequests: input.specialRequests ?? "",
        internalNotes: input.internalNotes ?? "",
        locale: input.locale ?? "en",
        holdExpiresAt,
        isOverbooked: overbooked,
        createdById: input.actorId ?? null,
        rooms: {
          create: roomRows.map((r) => ({
            roomTypeId: r.room.roomTypeId,
            ratePlanId: r.room.ratePlanId,
            checkIn: toDate(input.checkIn),
            checkOut: toDate(input.checkOut),
            adults: r.room.adults,
            children: r.room.children,
            isBlocking: true,
            nightlyRates: r.nightly,
            subtotal: r.subtotal,
            priceOverride: r.room.nightlyPrice,
          })),
        },
      },
      include: { rooms: true },
    });

    // 5. Ledger.
    await postStayCharges(tx, {
      reservationId: reservation.id,
      source: input.source,
      currency,
      netRoomCharge: netRooms,
      netDiscount,
      taxLines,
      createdById: input.actorId,
    });
    await refreshReservationTotals(tx, reservation.id);

    await audit(
      {
        userId: input.actorId,
        action: overbooked ? "reservation.created.overbooked" : "reservation.created",
        entity: "Reservation",
        entityId: reservation.id,
        after: {
          number,
          source: input.source,
          status: defaultStatus,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          rooms: rooms.length,
          ...(rooms.some((r) => r.nightlyPrice) ? { manualNightlyPrices: rooms.map((r) => r.nightlyPrice) } : {}),
        },
        source: input.auditSource ?? (input.source === "DIRECT_WEBSITE" ? "WEBSITE" : "ADMIN"),
      },
      tx,
    );

    return { reservationId: reservation.id, number, roomTypeIds: [...requested.keys()], overbooked };
  }, TX_OPTIONS);

  await afterInventoryChange(result.roomTypeIds, input.checkIn, input.checkOut);
  void notifyReservationEvent(defaultStatus === "CONFIRMED" ? "reservation.confirmed" : "reservation.created", result.reservationId);
  return db.reservation.findUniqueOrThrow({
    where: { id: result.reservationId },
    include: { rooms: { include: { roomType: true } }, guest: true },
  });
}

/** Queue availability pushes to connected channels. Failures never affect the booking itself. */
async function afterInventoryChange(roomTypeIds: string[], from: DateStr, to: DateStr) {
  try {
    await enqueueInventorySync({ roomTypeIds, from, to, excludeChannelId: undefined });
  } catch (e) {
    console.error("[channel-sync] could not enqueue inventory sync", e);
  }
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export interface CancelInput {
  reservationId: string;
  reason: string;
  actorId?: string | null;
  /** Explicit fee. Never invented: callers pass what the policy / OTA data says. */
  cancellationFee?: string;
  newStatus?: "CANCELLED" | "NO_SHOW";
  auditSource?: "ADMIN" | "WEBSITE" | "SYSTEM" | "CHANNEL" | "API";
  /** Skip pushing to channels (the cancellation came from that channel). */
  channelOriginated?: boolean;
}

export async function cancelReservation(input: CancelInput) {
  const newStatus = input.newStatus ?? "CANCELLED";
  const out = await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUnique({ where: { id: input.reservationId }, include: { rooms: true } });
    if (!res || res.deletedAt) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (res.status === "CANCELLED" || res.status === "NO_SHOW") return { res, already: true };
    if (res.status === "CHECKED_IN" || res.status === "CHECKED_OUT") {
      throw new AppError("INVALID_STATE", "A checked-in or completed stay cannot be cancelled.");
    }
    await lockRoomTypes(tx, res.rooms.map((r) => r.roomTypeId));

    await tx.reservationRoom.updateMany({ where: { reservationId: res.id }, data: { isBlocking: false } });
    const assigned = res.rooms.map((r) => r.roomId).filter((x): x is string => !!x);
    if (assigned.length) {
      await tx.room.updateMany({ where: { id: { in: assigned }, status: "RESERVED" }, data: { status: "AVAILABLE" } });
    }
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: newStatus, cancelledAt: new Date(), cancelReason: input.reason, holdExpiresAt: null },
    });

    // Financial consequences: reverse accrued charges, then charge an explicit fee if one applies.
    const scopes = await tx.financialTransaction.findMany({
      where: { reservationId: res.id, category: { in: ["REVENUE", "TAX"] }, type: { not: "REVERSAL" } },
      distinct: ["scope"],
      select: { scope: true },
    });
    for (const s of scopes) {
      await reverseScope(tx, { reservationId: res.id, scope: s.scope, reason: `${newStatus.toLowerCase()}: ${input.reason}`, createdById: input.actorId });
    }
    if (input.cancellationFee && D(input.cancellationFee).greaterThan(0)) {
      await postLedger(tx, {
        reservationId: res.id,
        source: res.source,
        type: "ADJUSTMENT",
        category: "REVENUE",
        amount: input.cancellationFee,
        currency: res.currency,
        description: newStatus === "NO_SHOW" ? "No-show fee" : "Cancellation fee",
        scope: "CANCELLATION_FEE",
        createdById: input.actorId,
      });
    }
    if (res.promotionId) {
      await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "id" = ${res.promotionId}`;
    }
    await refreshReservationTotals(tx, res.id);
    await audit(
      {
        userId: input.actorId,
        action: newStatus === "NO_SHOW" ? "reservation.no_show" : "reservation.cancelled",
        entity: "Reservation",
        entityId: res.id,
        before: { status: res.status },
        after: { status: newStatus, reason: input.reason, fee: input.cancellationFee ?? null },
        source: input.auditSource ?? "ADMIN",
      },
      tx,
    );
    return { res, already: false };
  }, TX_OPTIONS);

  if (!out.already) {
    const roomTypeIds = out.res.rooms.map((r) => r.roomTypeId);
    await afterInventoryChange(roomTypeIds, out.res.checkIn.toISOString().slice(0, 10), out.res.checkOut.toISOString().slice(0, 10));
    void notifyReservationEvent("reservation.cancelled", out.res.id);
  }
  return db.reservation.findUniqueOrThrow({ where: { id: input.reservationId } });
}

/** Hide a reservation from every list. Inventory is released. Posted money stays in the ledger. */
export async function deleteReservation(reservationId: string, actorId?: string | null) {
  const out = await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUnique({ where: { id: reservationId }, include: { rooms: true } });
    if (!res || res.deletedAt) throw new AppError("NOT_FOUND", "Reservation not found.");
    await lockRoomTypes(tx, res.rooms.map((r) => r.roomTypeId));
    await tx.reservationRoom.updateMany({ where: { reservationId: res.id }, data: { isBlocking: false } });
    for (const line of res.rooms) {
      if (!line.roomId) continue;
      const room = await tx.room.findUnique({ where: { id: line.roomId }, select: { status: true } });
      if (room?.status === "RESERVED") {
        await setRoomStatus({ roomId: line.roomId, status: "AVAILABLE", userId: actorId, system: true, note: `Reservation ${res.number} deleted` }, tx);
      } else if (room?.status === "OCCUPIED" && res.status === "CHECKED_IN") {
        await setRoomStatus({ roomId: line.roomId, status: "DIRTY", userId: actorId, system: true, note: `Reservation ${res.number} deleted` }, tx);
        await createHousekeepingTask(line.roomId, "CHECKOUT_CLEAN", `Reservation ${res.number} deleted`, tx);
      }
    }
    if (res.promotionId && res.status !== "CANCELLED" && res.status !== "NO_SHOW") {
      await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "id" = ${res.promotionId}`;
    }
    await tx.reservation.update({
      where: { id: res.id },
      data: { deletedAt: new Date(), externalReservationId: null },
    });
    await audit(
      {
        userId: actorId,
        action: "reservation.deleted",
        entity: "Reservation",
        entityId: res.id,
        before: { number: res.number, status: res.status, externalReservationId: res.externalReservationId },
        after: { deletedAt: new Date().toISOString() },
      },
      tx,
    );
    return res;
  }, TX_OPTIONS);

  await afterInventoryChange(
    out.rooms.map((r) => r.roomTypeId),
    fromDate(out.checkIn),
    fromDate(out.checkOut),
  );
}

// ---------------------------------------------------------------------------
// Modify
// ---------------------------------------------------------------------------

export interface ModifyInput {
  reservationId: string;
  checkIn?: DateStr;
  checkOut?: DateStr;
  /** reservationRoomId -> new room type */
  roomTypeChanges?: Record<string, string>;
  adults?: number;
  children?: number;
  specialRequests?: string;
  internalNotes?: string;
  guestId?: string;
  actorId?: string | null;
  auditSource?: "ADMIN" | "WEBSITE" | "SYSTEM" | "CHANNEL" | "API";
  /** New OTA-supplied amounts; replaces the pricing engine. Existing history is kept via reversal + repost. */
  external?: ExternalPricing;
  allowOverbooking?: boolean;
  /** Back-office edits may touch stays that already started. */
  allowPastDates?: boolean;
}

export async function modifyReservation(input: ModifyInput) {
  const hotel = await getHotel();
  const [booking, pricing, tax] = await Promise.all([
    getSettings(hotel.id, "booking"),
    getSettings(hotel.id, "pricing"),
    getSettings(hotel.id, "tax"),
  ]);

  const affected = await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      include: { rooms: true, promotion: { include: { roomTypes: true } } },
    });
    if (!res || res.deletedAt) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(res.status)) {
      throw new AppError("INVALID_STATE", "This reservation can no longer be modified.");
    }

    const oldIn = res.checkIn.toISOString().slice(0, 10);
    const oldOut = res.checkOut.toISOString().slice(0, 10);
    const newIn = input.checkIn ?? oldIn;
    const newOut = input.checkOut ?? oldOut;
    if (res.status === "CHECKED_IN" && newIn !== oldIn) {
      throw new AppError("INVALID_STATE", "The check-in date of an in-house guest cannot be changed.");
    }
    const datesChanged = newIn !== oldIn || newOut !== oldOut;
    const typeChanged = !!input.roomTypeChanges && Object.keys(input.roomTypeChanges).length > 0;
    const external = input.external;
    const reprice = datesChanged || typeChanged || !!external;
    const today = todayIn(hotel.timezone);

    const nights = validateStayDates(newIn, newOut, {
      today,
      minStay: external ? 1 : booking.minStay,
      maxStay: external ? 365 : booking.maxStay,
      maxAdvanceDays: 1000,
      allowPast: !!external || !!input.allowPastDates || res.status === "CHECKED_IN" || newIn === oldIn,
    });

    const newRooms = res.rooms.map((r) => {
      const newRoomTypeId = input.roomTypeChanges?.[r.id] ?? r.roomTypeId;
      return { ...r, newRoomTypeId, priceOverride: newRoomTypeId === r.roomTypeId && r.priceOverride ? toDb(D(r.priceOverride)) : null };
    });
    const oldTypeIds = res.rooms.map((r) => r.roomTypeId);
    const newTypeIds = newRooms.map((r) => r.newRoomTypeId);
    await lockRoomTypes(tx, [...oldTypeIds, ...newTypeIds]);

    let overbooked = res.isOverbooked;
    if (reprice) {
      const requested = new Map<string, number>();
      for (const t of newTypeIds) requested.set(t, (requested.get(t) ?? 0) + 1);
      try {
        await assertInventory(tx, { requested, checkIn: newIn, checkOut: newOut, excludeReservationId: res.id });
        if (!external) overbooked = false;
      } catch (e) {
        if (input.allowOverbooking && e instanceof AppError && e.code === "ROOM_UNAVAILABLE") overbooked = true;
        else throw e;
      }
      if (!external) {
        for (const t of new Set(newTypeIds)) {
          const v = await findRestrictionViolation({ roomTypeId: t, checkIn: newIn, checkOut: newOut, channelId: res.channelId }, tx);
          if (v) throw new AppError("ROOM_UNAVAILABLE", v);
        }
      }
    }

    if (reprice) {
      let netRooms: ReturnType<typeof D>;
      let netDiscount: ReturnType<typeof D>;
      let taxLines: TaxLine[];
      const currency = external?.currency ?? res.currency;
      const rowUpdates: { id: string; nightly: { date: DateStr; price: string }[]; subtotal: string; roomTypeId: string }[] = [];

      if (external) {
        netRooms = D(external.netRoomCharge);
        netDiscount = D(external.netDiscount ?? 0);
        taxLines = external.taxLines ?? [];
        const per = round2(netRooms.div(newRooms.length));
        for (const r of newRooms) {
          rowUpdates.push({ id: r.id, nightly: evenSplit(toDb(per), nightsRange(newIn, newOut)), subtotal: toDb(per), roomTypeId: r.newRoomTypeId });
        }
      } else {
        const promoBase: PromotionData | null = res.promotion
          ? { ...res.promotion, usedCount: 0, usageLimit: null, roomTypeIds: res.promotion.roomTypes.map((x) => x.roomTypeId), startDate: new Date("2000-01-01"), endDate: new Date("2999-01-01") }
          : null;
        const quotes: QuoteBreakdown[] = [];
        const grouped = new Map<string, typeof newRooms>();
        for (const r of newRooms) {
          const key = `${r.newRoomTypeId}|${r.ratePlanId ?? ""}|${r.priceOverride ?? ""}`;
          grouped.set(key, [...(grouped.get(key) ?? []), r]);
        }
        let idx = 0;
        for (const group of grouped.values()) {
          const first = group[0];
          const ctx = withPriceOverride(
            await loadPricingContext(tx, first.newRoomTypeId, first.ratePlanId, newIn, addDays(newOut, -1), pricing.weekendDays),
            first.priceOverride,
          );
          const quote = buildQuote({
            ctx,
            checkIn: newIn,
            checkOut: newOut,
            rooms: group.length,
            source: res.source,
            currency: hotel.currency,
            taxRules: first.priceOverride != null ? [] : tax.rules,
            pricesIncludeTax: tax.pricesIncludeTax,
            promotion: promotionForLine(promoBase, idx),
            today: res.promotion ? today : today,
          });
          quotes.push(quote);
          for (const r of group) rowUpdates.push({ id: r.id, nightly: quote.nightly, subtotal: quote.perRoomTotal, roomTypeId: r.newRoomTypeId });
          idx++;
        }
        const agg = aggregateQuotes(quotes);
        netRooms = agg.netRooms;
        netDiscount = agg.netDiscount;
        taxLines = agg.taxLines;
      }

      for (const u of rowUpdates) {
        const row = newRooms.find((r) => r.id === u.id)!;
        let roomId = row.roomId;
        if (roomId && (datesChanged || u.roomTypeId !== row.roomTypeId)) {
          try {
            if (u.roomTypeId !== row.roomTypeId) throw new Error("type changed");
            await assertRoomFree(tx, roomId, newIn, newOut, row.id);
          } catch {
            roomId = null;
          }
        }
        await tx.reservationRoom.update({
          where: { id: u.id },
          data: { roomTypeId: u.roomTypeId, checkIn: toDate(newIn), checkOut: toDate(newOut), nightlyRates: u.nightly, subtotal: u.subtotal, roomId, priceOverride: row.priceOverride },
        });
      }

      await reverseScope(tx, { reservationId: res.id, scope: "STAY", reason: "reservation modified", createdById: input.actorId });
      await postStayCharges(tx, {
        reservationId: res.id,
        source: res.source,
        currency,
        netRoomCharge: netRooms,
        netDiscount,
        taxLines,
        createdById: input.actorId,
        description: "Room charge (revised)",
      });
    }

    await tx.reservation.update({
      where: { id: res.id },
      data: {
        checkIn: toDate(newIn),
        checkOut: toDate(newOut),
        nights,
        isOverbooked: overbooked,
        ...(input.external ? { currency: input.external.currency } : {}),
        ...(input.adults !== undefined ? { adults: input.adults } : {}),
        ...(input.children !== undefined ? { children: input.children } : {}),
        ...(input.specialRequests !== undefined ? { specialRequests: input.specialRequests } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(input.guestId ? { guestId: input.guestId } : {}),
      },
    });
    await refreshReservationTotals(tx, res.id);
    await audit(
      {
        userId: input.actorId,
        action: "reservation.modified",
        entity: "Reservation",
        entityId: res.id,
        before: { checkIn: oldIn, checkOut: oldOut, total: res.totalAmount, roomTypes: oldTypeIds },
        after: { checkIn: newIn, checkOut: newOut, roomTypes: newTypeIds, repriced: reprice },
        source: input.auditSource ?? "ADMIN",
      },
      tx,
    );
    return { roomTypeIds: [...new Set([...oldTypeIds, ...newTypeIds])], oldIn, oldOut, newIn, newOut, reprice };
  }, TX_OPTIONS);

  if (affected.reprice) {
    await afterInventoryChange(
      affected.roomTypeIds,
      affected.oldIn < affected.newIn ? affected.oldIn : affected.newIn,
      affected.oldOut > affected.newOut ? affected.oldOut : affected.newOut,
    );
  }
  void notifyReservationEvent("reservation.modified", input.reservationId);
  return db.reservation.findUniqueOrThrow({ where: { id: input.reservationId }, include: { rooms: true } });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export async function confirmReservation(reservationId: string, actorId?: string | null) {
  const res = await db.reservation.findUnique({ where: { id: reservationId } });
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  if (res.status !== "PENDING") throw new AppError("INVALID_STATE", "Only pending reservations can be confirmed.");
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.reservation.update({ where: { id: reservationId }, data: { status: "CONFIRMED", holdExpiresAt: null } });
    await audit({ userId: actorId, action: "reservation.confirmed", entity: "Reservation", entityId: reservationId, before: { status: "PENDING" }, after: { status: "CONFIRMED" } }, tx);
    return u;
  });
  void notifyReservationEvent("reservation.confirmed", reservationId);
  return updated;
}

/** Cancel online-payment reservations whose hold expired so their inventory is released. */
export async function expirePendingHolds(now = new Date()): Promise<number> {
  const stale = await db.reservation.findMany({
    where: { status: "PENDING", holdExpiresAt: { lt: now } },
    select: { id: true },
  });
  let n = 0;
  for (const s of stale) {
    try {
      await cancelReservation({ reservationId: s.id, reason: "Payment hold expired", auditSource: "SYSTEM" });
      n++;
    } catch (e) {
      console.error("[expire-holds]", s.id, e);
    }
  }
  return n;
}

export async function addReservationNote(reservationId: string, body: string, authorName: string, actorId?: string | null) {
  const note = await db.reservationNote.create({ data: { reservationId, body, authorName } });
  await audit({ userId: actorId, action: "reservation.note_added", entity: "Reservation", entityId: reservationId, after: { body } });
  return note;
}

export async function setPaymentCollection(reservationId: string, method: PaymentCollectionMethod, actorId?: string | null) {
  await db.$transaction(async (tx) => {
    await tx.reservation.update({ where: { id: reservationId }, data: { paymentCollection: method } });
    await refreshPaymentStatus(tx, reservationId);
    await audit({ userId: actorId, action: "reservation.payment_collection_changed", entity: "Reservation", entityId: reservationId, after: { method } }, tx);
  });
}
