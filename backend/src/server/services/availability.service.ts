import { db, type DbOrTx, type Tx } from "@/server/db/client";
import type { ReservationSource } from "@/generated/prisma/enums";
import { AppError, roomUnavailable } from "@/lib/errors";
import { addDays, diffDays, eachNight, toDate, fromDate, type DateStr } from "@/lib/dates";
import { getHotel, getSettings } from "./settings.service";

/**
 * AVAILABLE INVENTORY (per room type, per night) =
 *     sellable physical rooms (active, not blocked by maintenance / out of order)
 *   - reservation-rooms that currently hold inventory on that night
 *
 * Holding statuses: PENDING (unexpired), CONFIRMED, CHECKED_IN. Cancelled / no-show / checked-out
 * reservations flip ReservationRoom.isBlocking to false and thereby release inventory.
 *
 * Stays are half-open ranges [checkIn, checkOut). When the hotel disables same-day turnover, the
 * check-out day is also treated as occupied.
 */

export interface NightAvailability {
  date: DateStr;
  totalRooms: number;
  blockedRooms: number;
  booked: number;
  available: number;
}

export interface RoomTypeAvailability {
  roomTypeId: string;
  totalRooms: number;
  nights: NightAvailability[];
  /** Number of rooms that can be sold for the entire stay. */
  available: number;
}

export interface AvailabilityQuery {
  roomTypeIds?: string[];
  checkIn: DateStr;
  checkOut: DateStr;
  /** Reservation to ignore (when modifying it). */
  excludeReservationId?: string;
  /** Count only these statuses as holding inventory. Defaults handled by isBlocking. */
  now?: Date;
}

export function validateStayDates(
  checkIn: DateStr,
  checkOut: DateStr,
  opts: { today: DateStr; minStay: number; maxStay: number; maxAdvanceDays: number; allowPast?: boolean },
): number {
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1) throw new AppError("INVALID_DATES", "Check-out must be after check-in.", { field: "checkOut" });
  if (!opts.allowPast && checkIn < opts.today) throw new AppError("INVALID_DATES", "Check-in date cannot be in the past.", { field: "checkIn" });
  if (nights < opts.minStay) throw new AppError("INVALID_DATES", `Minimum stay is ${opts.minStay} night(s).`, { field: "checkOut" });
  if (nights > opts.maxStay) throw new AppError("INVALID_DATES", `Maximum stay is ${opts.maxStay} nights.`, { field: "checkOut" });
  if (diffDays(opts.today, checkIn) > opts.maxAdvanceDays) throw new AppError("INVALID_DATES", "Check-in date is too far in the future.", { field: "checkIn" });
  return nights;
}

export async function getAvailability(q: AvailabilityQuery, client: DbOrTx = db): Promise<RoomTypeAvailability[]> {
  const hotel = await getHotel(client);
  const booking = await getSettings(hotel.id, "booking", client);
  const turnover = booking.sameDayTurnover;
  const nights = eachNight(q.checkIn, q.checkOut);
  if (nights.length === 0) throw new AppError("INVALID_DATES", "Check-out must be after check-in.");

  const roomTypes = await client.roomType.findMany({
    where: { hotelId: hotel.id, deletedAt: null, isActive: true, ...(q.roomTypeIds ? { id: { in: q.roomTypeIds } } : {}) },
    select: { id: true },
  });
  const ids = roomTypes.map((r) => r.id);
  if (ids.length === 0) return [];

  const rooms = await client.room.findMany({
    where: { roomTypeId: { in: ids }, isActive: true, deletedAt: null },
    select: { id: true, roomTypeId: true },
  });

  const rangeStart = toDate(q.checkIn);
  const rangeEnd = toDate(q.checkOut);
  const now = q.now ?? new Date();

  const [blocks, holds] = await Promise.all([
    client.roomBlock.findMany({
      where: {
        room: { roomTypeId: { in: ids }, isActive: true, deletedAt: null },
        startDate: { lt: rangeEnd },
        OR: [{ endDate: null }, { endDate: { gt: rangeStart } }],
      },
      select: { roomId: true, startDate: true, endDate: true, room: { select: { roomTypeId: true } } },
    }),
    client.reservationRoom.findMany({
      where: {
        roomTypeId: { in: ids },
        isBlocking: true,
        checkIn: { lt: rangeEnd },
        checkOut: { gt: turnover ? rangeStart : addDaysDate(rangeStart, -1) },
        ...(q.excludeReservationId ? { reservationId: { not: q.excludeReservationId } } : {}),
        reservation: {
          deletedAt: null,
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
            { status: "PENDING", OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] },
          ],
        },
      },
      select: { roomTypeId: true, checkIn: true, checkOut: true },
    }),
  ]);

  const totalByType = new Map<string, number>();
  for (const r of rooms) totalByType.set(r.roomTypeId, (totalByType.get(r.roomTypeId) ?? 0) + 1);

  return ids.map((roomTypeId) => {
    const total = totalByType.get(roomTypeId) ?? 0;
    const typeBlocks = blocks.filter((b) => b.room.roomTypeId === roomTypeId);
    const typeHolds = holds.filter((h) => h.roomTypeId === roomTypeId);
    const perNight: NightAvailability[] = nights.map((date) => {
      const t = toDate(date).getTime();
      const blockedRoomIds = new Set(
        typeBlocks
          .filter((b) => b.startDate.getTime() <= t && (b.endDate === null || b.endDate.getTime() > t))
          .map((b) => b.roomId),
      );
      const booked = typeHolds.filter((h) => {
        const end = turnover ? h.checkOut.getTime() : addDaysDate(h.checkOut, 1).getTime();
        return h.checkIn.getTime() <= t && t < end;
      }).length;
      const sellable = total - blockedRoomIds.size;
      return {
        date,
        totalRooms: total,
        blockedRooms: blockedRoomIds.size,
        booked,
        available: Math.max(0, sellable - booked),
      };
    });
    return {
      roomTypeId,
      totalRooms: total,
      nights: perNight,
      available: perNight.length ? Math.min(...perNight.map((n) => n.available)) : 0,
    };
  });
}

function addDaysDate(d: Date, n: number): Date {
  return toDate(addDays(fromDate(d), n));
}

// ---------------------------------------------------------------------------
// Restrictions (stop-sell, min/max stay, CTA/CTD)
// ---------------------------------------------------------------------------

export interface RestrictionQuery {
  roomTypeId: string;
  ratePlanId?: string | null;
  checkIn: DateStr;
  checkOut: DateStr;
  /** null = direct website. */
  channelId?: string | null;
}

export async function findRestrictionViolation(q: RestrictionQuery, client: DbOrTx = db): Promise<string | null> {
  const nights = diffDays(q.checkIn, q.checkOut);
  const rows = await client.channelRestriction.findMany({
    where: {
      isActive: true,
      startDate: { lte: toDate(addDays(q.checkOut, 0)) },
      endDate: { gte: toDate(q.checkIn) },
      AND: [
        { OR: [{ roomTypeId: null }, { roomTypeId: q.roomTypeId }] },
        { OR: [{ ratePlanId: null }, ...(q.ratePlanId ? [{ ratePlanId: q.ratePlanId }] : [])] },
        { OR: [{ channelId: null }, ...(q.channelId ? [{ channelId: q.channelId }] : [])] },
      ],
    },
  });
  const nightList = eachNight(q.checkIn, q.checkOut).map((d) => toDate(d).getTime());
  for (const r of rows) {
    const covers = (t: number) => t >= r.startDate.getTime() && t <= r.endDate.getTime();
    if (r.stopSell && nightList.some(covers)) return "These dates are not available for booking.";
    if (r.closedToArrival && covers(toDate(q.checkIn).getTime())) return "Arrival is not possible on the selected check-in date.";
    if (r.closedToDeparture && covers(toDate(q.checkOut).getTime())) return "Departure is not possible on the selected check-out date.";
    if (r.minStay && nightList.some(covers) && nights < r.minStay) return `Minimum stay for these dates is ${r.minStay} nights.`;
    if (r.maxStay && nightList.some(covers) && nights > r.maxStay) return `Maximum stay for these dates is ${r.maxStay} nights.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

/**
 * Serialise concurrent bookings per room type. Locks are taken in a stable order to avoid
 * deadlocks when a reservation spans several room types.
 */
export async function lockRoomTypes(tx: Tx, roomTypeIds: string[]): Promise<void> {
  const ids = [...new Set(roomTypeIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "RoomType" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
}

export async function lockRooms(tx: Tx, roomIds: string[]): Promise<void> {
  const ids = [...new Set(roomIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
}

/**
 * Inside a transaction: lock the requested room types, re-check inventory, and throw
 * "Room is no longer available." if the request cannot be satisfied.
 * `requested` maps roomTypeId -> number of rooms wanted for [checkIn, checkOut).
 */
export async function assertInventory(
  tx: Tx,
  args: { requested: Map<string, number>; checkIn: DateStr; checkOut: DateStr; excludeReservationId?: string },
): Promise<void> {
  await lockRoomTypes(tx, [...args.requested.keys()]);
  const availability = await getAvailability(
    {
      roomTypeIds: [...args.requested.keys()],
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      excludeReservationId: args.excludeReservationId,
    },
    tx,
  );
  for (const [roomTypeId, wanted] of args.requested) {
    const a = availability.find((x) => x.roomTypeId === roomTypeId);
    if (!a || a.available < wanted) {
      throw roomUnavailable({ roomTypeId, wanted, available: a?.available ?? 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// Physical room assignment
// ---------------------------------------------------------------------------

export const NON_ASSIGNABLE_STATUSES = ["MAINTENANCE", "OUT_OF_ORDER"] as const;

/**
 * Rooms of `roomTypeId` that can physically host [checkIn, checkOut): active, not blocked, not under
 * maintenance, and without an overlapping assigned reservation. `requireClean` additionally requires
 * the room to be ready right now (used at check-in).
 */
export async function findAssignableRooms(
  client: DbOrTx,
  args: { roomTypeId: string; checkIn: DateStr; checkOut: DateStr; excludeReservationRoomId?: string; requireReady?: boolean },
) {
  const hotel = await getHotel(client);
  const booking = await getSettings(hotel.id, "booking", client);
  const start = toDate(args.checkIn);
  const end = toDate(args.checkOut);
  const widenedStart = booking.sameDayTurnover ? start : addDaysDate(start, -1);

  const rooms = await client.room.findMany({
    where: {
      roomTypeId: args.roomTypeId,
      isActive: true,
      deletedAt: null,
      status: args.requireReady ? { in: ["AVAILABLE", "RESERVED"] } : { notIn: [...NON_ASSIGNABLE_STATUSES] },
      blocks: { none: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gt: start } }] } },
      reservationRooms: {
        none: {
          isBlocking: true,
          checkIn: { lt: end },
          checkOut: { gt: widenedStart },
          ...(args.excludeReservationRoomId ? { id: { not: args.excludeReservationRoomId } } : {}),
          reservation: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
        },
      },
    },
    orderBy: [{ floor: "asc" }, { number: "asc" }],
  });
  return rooms;
}

export async function assertRoomFree(tx: Tx, roomId: string, checkIn: DateStr, checkOut: DateStr, excludeReservationRoomId?: string) {
  await lockRooms(tx, [roomId]);
  const room = await tx.room.findUnique({ where: { id: roomId } });
  if (!room || !room.isActive || room.deletedAt) throw new AppError("NOT_FOUND", "Room not found.");
  const free = await findAssignableRooms(tx, {
    roomTypeId: room.roomTypeId,
    checkIn,
    checkOut,
    excludeReservationRoomId,
  });
  if (!free.some((r) => r.id === roomId)) {
    throw new AppError("ROOM_UNAVAILABLE", `Room ${room.number} is not available for these dates.`);
  }
  return room;
}

// ---------------------------------------------------------------------------
// Convenience for public search
// ---------------------------------------------------------------------------

export interface SearchRoomsArgs {
  checkIn: DateStr;
  checkOut: DateStr;
  adults: number;
  children: number;
  rooms: number;
  source?: ReservationSource;
}

export async function searchAvailableRoomTypes(args: SearchRoomsArgs, client: DbOrTx = db) {
  const hotel = await getHotel(client);
  const types = await client.roomType.findMany({
    where: { hotelId: hotel.id, deletedAt: null, isActive: true },
    include: { images: { orderBy: { sortOrder: "asc" } }, amenities: { include: { amenity: true } } },
    orderBy: [{ sortOrder: "asc" }, { basePrice: "asc" }],
  });
  const availability = await getAvailability({ roomTypeIds: types.map((t) => t.id), checkIn: args.checkIn, checkOut: args.checkOut }, client);
  const results = [];
  for (const t of types) {
    const a = availability.find((x) => x.roomTypeId === t.id);
    // Guests are spread over the requested rooms: each room must fit its share.
    const perRoomAdults = Math.ceil(args.adults / args.rooms);
    const perRoomChildren = Math.ceil(args.children / args.rooms);
    const fits =
      perRoomAdults <= t.maxAdults &&
      perRoomChildren <= t.maxChildren &&
      perRoomAdults + perRoomChildren <= t.maxOccupancy;
    const restriction = await findRestrictionViolation({ roomTypeId: t.id, checkIn: args.checkIn, checkOut: args.checkOut }, client);
    results.push({
      roomType: t,
      availableRooms: a?.available ?? 0,
      fitsGuests: fits,
      restriction,
      bookable: fits && !restriction && (a?.available ?? 0) >= args.rooms,
    });
  }
  return results;
}
