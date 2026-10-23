import { db } from "@/server/db/client";
import { addDays, endOfMonthExclusive, startOfMonth, todayIn, toDate, type DateStr } from "@/lib/dates";
import { D, toDb } from "@/lib/money";
import { getAvailability } from "./availability.service";
import { getHotel } from "./settings.service";
import { revenueByChannel } from "./financial.service";

export interface DashboardData {
  today: DateStr;
  currency: string;
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
  occupancySeries: { date: DateStr; booked: number; sellable: number; pct: number }[];
  revenueMtd: { source: string; gross: string; commission: string; net: string }[];
  paymentsReceivedToday: string;
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

export async function getDashboard(): Promise<DashboardData> {
  const hotel = await getHotel();
  const today = todayIn(hotel.timezone);
  const tomorrow = addDays(today, 1);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonthExclusive(today);

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
    db.payment.aggregate({ where: { status: "SUCCEEDED", receivedAt: { gte: toDate(today), lt: toDate(tomorrow) } }, _sum: { amount: true } }),
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
    .map(([date, v]) => ({ date, ...v, pct: v.sellable > 0 ? Math.round((v.booked / v.sellable) * 100) : 0 }));
  const tonight = perNight.get(today) ?? { booked: 0, sellable: 0 };
  const roomsTotal = availability.reduce((a, r) => a + r.totalRooms, 0);

  const outstanding = inHouseRes.reduce((acc, r) => acc.plus(D(r.totalAmount).minus(D(r.paidAmount)).clamp(0, Number.MAX_SAFE_INTEGER)), D(0));

  return {
    today,
    currency: hotel.currency,
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
