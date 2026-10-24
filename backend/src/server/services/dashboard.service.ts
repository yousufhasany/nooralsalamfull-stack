import { db } from "@/server/db/client";
import { addDays, endOfMonthExclusive, startOfMonth, startOfZonedDay, todayIn, toDate, type DateStr } from "@/lib/dates";
import { D, toDb } from "@/lib/money";
import { findAssignableRooms, getAvailability } from "./availability.service";
import { getHotel } from "./settings.service";
import { revenueByChannel } from "./financial.service";

export interface AvailableRoomType {
  roomTypeId: string;
  name: { en: string; ar: string; bn: string };
  /** Rooms of this type that can still be sold tonight (inventory, after unassigned bookings). */
  sellable: number;
  /** Physical rooms with no booking assigned tonight and not out of service. */
  rooms: { id: string; number: string; floor: number; status: string }[];
}

export interface DashboardData {
  today: DateStr;
  tomorrow: DateStr;
  currency: string;
  availableTonight: { count: number; total: number; byType: AvailableRoomType[] };
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  occupancyTodayPct: number;
  roomsTotal: number;
  roomsBlocked: number;
  dirtyRooms: number;
  cleaningRooms: number;
  newReservations7d: number;
  bySource7d: { source: string; count: number }[];
  occupancySeries: { date: DateStr; booked: number; sellable: number; available: number; pct: number }[];
  revenueMtd: { source: string; gross: string; commission: string; net: string }[];
  paymentsReceivedToday: string;
  incomeMonth: string;
  incomeYear: string;
  outstandingInHouse: string;
  pendingPayouts: { count: number; net: string };
  needsAttention: {
    overbooked: number;
    channelsNeedingVerification: number;
    failedSyncJobs: number;
    failedInbound: number;
    unmatchedReconciliation: number;
    unreadMessages: number;
    openModificationRequests: number;
    unknownPayment: number;
  };
}

/** Succeeded payments received in a hotel-local window. Same basis as Payments received today. */
function receivedPayments(from: Date, to: Date) {
  return db.payment.aggregate({
    where: { status: "SUCCEEDED", receivedAt: { gte: from, lt: to } },
    _sum: { amount: true },
  });
}

export async function getDashboard(): Promise<DashboardData> {
  const hotel = await getHotel();
  const today = todayIn(hotel.timezone);
  const tomorrow = addDays(today, 1);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonthExclusive(today);
  const yearStart = `${today.slice(0, 4)}-01-01` as DateStr;
  const yearEnd = `${Number(today.slice(0, 4)) + 1}-01-01` as DateStr;
  const dayStart = startOfZonedDay(today, hotel.timezone);
  const dayEnd = startOfZonedDay(tomorrow, hotel.timezone);

  const [
    arrivalsToday,
    departuresToday,
    inHouse,
    dirtyRooms,
    cleaningRooms,
    newRes,
    bySource,
    availability,
    revenueMtd,
    paymentsToday,
    paymentsMonth,
    paymentsYear,
    inHouseRes,
    payoutAgg,
    overbooked,
    channelsNeedingVerification,
    failedSyncJobs,
    failedInbound,
    unmatched,
    unreadMessages,
    openMods,
    unknownPayment,
  ] = await Promise.all([
    db.reservation.count({ where: { status: "CONFIRMED", checkIn: toDate(today), deletedAt: null } }),
    db.reservation.count({ where: { status: "CHECKED_IN", checkOut: toDate(today), deletedAt: null } }),
    db.reservation.count({ where: { status: "CHECKED_IN", deletedAt: null } }),
    db.room.count({ where: { status: "DIRTY", isActive: true, deletedAt: null } }),
    db.room.count({ where: { status: "CLEANING", isActive: true, deletedAt: null } }),
    db.reservation.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
    db.reservation.groupBy({ by: ["source"], where: { createdAt: { gte: weekAgo }, deletedAt: null }, _count: { _all: true } }),
    getAvailability({ checkIn: today, checkOut: addDays(today, 14) }),
    revenueByChannel({ from: toDate(monthStart), to: toDate(monthEnd) }),
    receivedPayments(dayStart, dayEnd),
    receivedPayments(startOfZonedDay(monthStart, hotel.timezone), startOfZonedDay(monthEnd, hotel.timezone)),
    receivedPayments(startOfZonedDay(yearStart, hotel.timezone), startOfZonedDay(yearEnd, hotel.timezone)),
    db.reservation.findMany({ where: { status: "CHECKED_IN", deletedAt: null }, select: { totalAmount: true, paidAmount: true } }),
    db.oTAPayout.aggregate({ where: { status: { in: ["PENDING", "PROCESSING"] } }, _sum: { netAmount: true }, _count: { _all: true } }),
    db.reservation.count({ where: { isOverbooked: true, status: { in: ["CONFIRMED", "PENDING", "CHECKED_IN"] } } }),
    db.channelConnection.count({ where: { inventoryNeedsVerification: true } }),
    db.syncJob.count({ where: { status: "FAILED", finishedAt: { gte: weekAgo } } }),
    db.channelWebhookEvent.count({ where: { status: "FAILED" } }),
    db.reconciliationRecord.count({ where: { status: { in: ["UNMATCHED", "NEEDS_REVIEW"] } } }),
    db.contactMessage.count({ where: { isRead: false } }),
    db.modificationRequest.count({ where: { status: "OPEN" } }),
    db.reservation.count({ where: { paymentStatus: "INFORMATION_NOT_PROVIDED", status: { in: ["CONFIRMED", "CHECKED_IN"] } } }),
  ]);

  const perNight = new Map<DateStr, { booked: number; sellable: number }>();
  for (const rt of availability) {
    for (const n of rt.nights) {
      const cur = perNight.get(n.date) ?? { booked: 0, sellable: 0 };
      cur.booked += n.booked;
      cur.sellable += n.totalRooms - n.blockedRooms;
      perNight.set(n.date, cur);
    }
  }
  const occupancySeries = [...perNight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v, available: Math.max(0, v.sellable - v.booked), pct: v.sellable > 0 ? Math.round((v.booked / v.sellable) * 100) : 0 }));
  const tonight = perNight.get(today) ?? { booked: 0, sellable: 0 };
  const roomsTotal = availability.reduce((a, r) => a + r.totalRooms, 0);

  const roomTypes = await db.roomType.findMany({
    where: { id: { in: availability.map((a) => a.roomTypeId) } },
    select: { id: true, nameEn: true, nameAr: true, nameBn: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
  const byType: AvailableRoomType[] = await Promise.all(
    roomTypes.map(async (rt) => {
      const rooms = await findAssignableRooms(db, { roomTypeId: rt.id, checkIn: today, checkOut: tomorrow });
      const night = availability.find((a) => a.roomTypeId === rt.id)?.nights.find((n) => n.date === today);
      return {
        roomTypeId: rt.id,
        name: { en: rt.nameEn, ar: rt.nameAr, bn: rt.nameBn },
        sellable: night?.available ?? 0,
        rooms: rooms.map((r) => ({ id: r.id, number: r.number, floor: r.floor, status: r.status })),
      };
    }),
  );

  const outstanding = inHouseRes.reduce((acc, r) => acc.plus(D(r.totalAmount).minus(D(r.paidAmount)).clamp(0, Number.MAX_SAFE_INTEGER)), D(0));

  return {
    today,
    tomorrow,
    currency: hotel.currency,
    availableTonight: { count: byType.reduce((a, t) => a + t.sellable, 0), total: roomsTotal, byType },
    arrivalsToday,
    departuresToday,
    inHouse,
    occupancyTodayPct: tonight.sellable > 0 ? Math.round((tonight.booked / tonight.sellable) * 100) : 0,
    roomsTotal,
    roomsBlocked: roomsTotal - tonight.sellable,
    dirtyRooms,
    cleaningRooms,
    newReservations7d: newRes,
    bySource7d: bySource.map((g) => ({ source: g.source, count: g._count._all })),
    occupancySeries,
    revenueMtd,
    paymentsReceivedToday: toDb(D(paymentsToday._sum.amount)),
    incomeMonth: toDb(D(paymentsMonth._sum.amount)),
    incomeYear: toDb(D(paymentsYear._sum.amount)),
    outstandingInHouse: toDb(outstanding),
    pendingPayouts: { count: payoutAgg._count._all, net: toDb(D(payoutAgg._sum.netAmount)) },
    needsAttention: {
      overbooked,
      channelsNeedingVerification,
      failedSyncJobs,
      failedInbound,
      unmatchedReconciliation: unmatched,
      unreadMessages,
      openModificationRequests: openMods,
      unknownPayment,
    },
  };
}
