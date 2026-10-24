import { db } from "@/server/db/client";
import { addDays, diffDays, fromDate, toDate, type DateStr } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { D, toDb } from "@/lib/money";
import { label } from "@/lib/labels";
import { getAvailability } from "./availability.service";
import { revenueByChannel } from "./financial.service";

export const REPORT_KINDS = [
  { key: "reservations", label: "Reservations (by check-in date)" },
  { key: "revenue-by-channel", label: "Revenue by channel (ledger)" },
  { key: "occupancy", label: "Occupancy by night" },
  { key: "payments", label: "Payments received" },
  { key: "ota-commissions", label: "OTA commissions and payouts" },
  { key: "tax", label: "Tax report (ledger)" },
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number]["key"];

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}
export interface Report {
  kind: ReportKind;
  title: string;
  from: DateStr;
  to: DateStr;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string>;
}

export function isReportKind(v: string): v is ReportKind {
  return REPORT_KINDS.some((k) => k.key === v);
}

export async function runReport(kind: ReportKind, from: DateStr, to: DateStr): Promise<Report> {
  if (diffDays(from, to) < 0) throw new AppError("INVALID_DATES", "The end date must not be before the start date.");
  if (diffDays(from, to) > 366) throw new AppError("INVALID_DATES", "Choose a period of at most one year.");
  const start = toDate(from);
  const endExclusive = toDate(addDays(to, 1));
  const title = REPORT_KINDS.find((k) => k.key === kind)!.label;
  const base = { kind, title, from, to };

  switch (kind) {
    case "reservations": {
      const rows = await db.reservation.findMany({
        where: { deletedAt: null, checkIn: { gte: start, lt: endExclusive } },
        include: { guest: true, rooms: { include: { roomType: true } } },
        orderBy: { checkIn: "asc" },
      });
      return {
        ...base,
        columns: [
          { key: "number", label: "Reservation" },
          { key: "source", label: "Source" },
          { key: "status", label: "Status" },
          { key: "guest", label: "Guest" },
          { key: "checkIn", label: "Check-in" },
          { key: "checkOut", label: "Check-out" },
          { key: "nights", label: "Nights", numeric: true },
          { key: "rooms", label: "Rooms" },
          { key: "total", label: "Total", numeric: true },
          { key: "paid", label: "Paid", numeric: true },
          { key: "paymentStatus", label: "Payment status" },
          { key: "currency", label: "Currency" },
        ],
        rows: rows.map((r) => ({
          number: r.number,
          source: r.source,
          status: r.status,
          guest: `${r.guest.firstName} ${r.guest.lastName}`,
          checkIn: fromDate(r.checkIn),
          checkOut: fromDate(r.checkOut),
          nights: r.nights,
          rooms: r.rooms.map((x) => x.roomType.nameEn).join(" + "),
          total: r.totalAmount.toFixed(2),
          paid: r.paidAmount.toFixed(2),
          paymentStatus: r.paymentStatus,
          currency: r.currency,
        })),
      };
    }
    case "revenue-by-channel": {
      const rows = await revenueByChannel({ from: start, to: endExclusive });
      const gross = rows.reduce((a, r) => a.plus(r.gross), D(0));
      const commission = rows.reduce((a, r) => a.plus(r.commission), D(0));
      return {
        ...base,
        columns: [
          { key: "source", label: "Channel" },
          { key: "gross", label: "Revenue (net of tax & discounts)", numeric: true },
          { key: "commission", label: "OTA commission", numeric: true },
          { key: "net", label: "Net after commission", numeric: true },
        ],
        rows: rows.map((r) => ({ ...r })),
        totals: { gross: toDb(gross), commission: toDb(commission), net: toDb(gross.minus(commission)) },
      };
    }
    case "occupancy": {
      const days = diffDays(from, to) + 1;
      const availability = await getAvailability({ checkIn: from, checkOut: addDays(to, 1) });
      const perDay = new Map<string, { booked: number; sellable: number }>();
      for (const rt of availability) {
        for (const n of rt.nights) {
          const c = perDay.get(n.date) ?? { booked: 0, sellable: 0 };
          c.booked += n.booked;
          c.sellable += n.totalRooms - n.blockedRooms;
          perDay.set(n.date, c);
        }
      }
      const rows = [...perDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          sellable: v.sellable,
          booked: v.booked,
          occupancy: v.sellable ? `${((v.booked / v.sellable) * 100).toFixed(1)}%` : "0.0%",
        }));
      const totalBooked = rows.reduce((a, r) => a + r.booked, 0);
      const totalSellable = rows.reduce((a, r) => a + r.sellable, 0);
      return {
        ...base,
        columns: [
          { key: "date", label: "Night" },
          { key: "sellable", label: "Sellable rooms", numeric: true },
          { key: "booked", label: "Rooms booked", numeric: true },
          { key: "occupancy", label: "Occupancy", numeric: true },
        ],
        rows,
        totals: { occupancy: totalSellable ? `${((totalBooked / totalSellable) * 100).toFixed(1)}% over ${days} nights` : "n/a" },
      };
    }
    case "payments": {
      const rows = await db.payment.findMany({
        where: { receivedAt: { gte: start, lt: endExclusive }, status: "SUCCEEDED" },
        include: { reservation: { select: { number: true } }, refunds: true },
        orderBy: { receivedAt: "asc" },
      });
      const total = rows.reduce((a, r) => a.plus(r.amount.toString()), D(0));
      return {
        ...base,
        columns: [
          { key: "receivedAt", label: "Received" },
          { key: "reservation", label: "Reservation" },
          { key: "method", label: "Method" },
          { key: "collectedBy", label: "Collected by" },
          { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount", numeric: true },
          { key: "refunded", label: "Refunded", numeric: true },
          { key: "currency", label: "Currency" },
        ],
        rows: rows.map((p) => ({
          receivedAt: p.receivedAt.toISOString().slice(0, 16).replace("T", " "),
          reservation: p.reservation.number,
          method: label.paymentSource(p.source, "en"),
          collectedBy: label.collection(p.collectionMethod, "en"),
          reference: p.reference ?? "",
          amount: p.amount.toFixed(2),
          refunded: p.refunds.filter((x) => x.status === "COMPLETED").reduce((a, x) => a.plus(x.amount.toString()), D(0)).toFixed(2),
          currency: p.currency,
        })),
        totals: { amount: toDb(total) },
      };
    }
    case "ota-commissions": {
      const rows = await db.oTACommission.findMany({
        where: { createdAt: { gte: start, lt: endExclusive } },
        include: { channel: true, reservation: { select: { number: true, externalReservationId: true } } },
        orderBy: { createdAt: "asc" },
      });
      const payouts = await db.oTAPayout.findMany({ where: { reservationId: { in: rows.map((r) => r.reservationId) } } });
      const payoutByRes = new Map(payouts.map((p) => [p.reservationId, p]));
      return {
        ...base,
        columns: [
          { key: "channel", label: "Channel" },
          { key: "reservation", label: "Reservation" },
          { key: "external", label: "OTA reference" },
          { key: "gross", label: "Gross", numeric: true },
          { key: "commission", label: "Commission", numeric: true },
          { key: "net", label: "Expected net", numeric: true },
          { key: "commissionStatus", label: "Commission status" },
          { key: "payoutStatus", label: "Payout status" },
        ],
        rows: rows.map((c) => ({
          channel: c.channel.name,
          reservation: c.reservation.number,
          external: c.reservation.externalReservationId ?? "",
          gross: c.grossAmount.toFixed(2),
          commission: c.commissionAmount.toFixed(2),
          net: c.netHotelAmount.toFixed(2),
          commissionStatus: c.status,
          payoutStatus: payoutByRes.get(c.reservationId)?.status ?? "NO_PAYOUT_RECORD",
        })),
        totals: {
          gross: toDb(rows.reduce((a, r) => a.plus(r.grossAmount.toString()), D(0))),
          commission: toDb(rows.reduce((a, r) => a.plus(r.commissionAmount.toString()), D(0))),
        },
      };
    }
    case "tax": {
      const rows = await db.taxTransaction.groupBy({
        by: ["taxCode", "taxName", "rate"],
        where: { postedAt: { gte: start, lt: endExclusive } },
        _sum: { taxableAmount: true, taxAmount: true },
      });
      return {
        ...base,
        columns: [
          { key: "code", label: "Tax" },
          { key: "name", label: "Name" },
          { key: "rate", label: "Rate %", numeric: true },
          { key: "taxable", label: "Taxable amount", numeric: true },
          { key: "tax", label: "Tax amount", numeric: true },
        ],
        rows: rows.map((r) => ({
          code: r.taxCode,
          name: r.taxName,
          rate: r.rate.toString(),
          taxable: toDb(D(r._sum.taxableAmount)),
          tax: toDb(D(r._sum.taxAmount)),
        })),
        totals: { tax: toDb(rows.reduce((a, r) => a.plus(D(r._sum.taxAmount)), D(0))) },
      };
    }
  }
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed with an apostrophe). */
export function reportToCsv(report: Report): string {
  const esc = (v: string | number) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = report.columns.map((c) => esc(c.label)).join(",");
  const lines = report.rows.map((r) => report.columns.map((c) => esc(r[c.key] ?? "")).join(","));
  // UTF-8 BOM so Excel opens Arabic / Bangla text correctly.
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}
