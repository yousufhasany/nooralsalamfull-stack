import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import type { PaymentStatus, ReservationSource, ReservationStatus } from "@/generated/prisma/enums";
import { toDate, type DateStr } from "@/lib/dates";
import { AppError } from "@/lib/errors";

export interface ReservationFilter {
  q?: string;
  status?: ReservationStatus;
  source?: ReservationSource;
  paymentStatus?: PaymentStatus;
  /** Filter on check-in date (inclusive). */
  from?: DateStr;
  to?: DateStr;
  page?: number;
  pageSize?: number;
  sort?: "createdAt" | "checkIn" | "checkOut" | "totalAmount";
  dir?: "asc" | "desc";
  channelId?: string;
}

export async function listReservations(f: ReservationFilter) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, f.pageSize ?? 25));
  const where: Prisma.ReservationWhereInput = { deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.source) where.source = f.source;
  if (f.paymentStatus) where.paymentStatus = f.paymentStatus;
  if (f.channelId) where.channelId = f.channelId;
  if (f.from || f.to) {
    where.checkIn = { ...(f.from ? { gte: toDate(f.from) } : {}), ...(f.to ? { lte: toDate(f.to) } : {}) };
  }
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { externalReservationId: { contains: q, mode: "insensitive" } },
      { guest: { firstName: { contains: q, mode: "insensitive" } } },
      { guest: { lastName: { contains: q, mode: "insensitive" } } },
      { guest: { email: { contains: q, mode: "insensitive" } } },
      { guest: { phone: { contains: q.replace(/[\s\-()]/g, "") } } },
    ];
  }
  const sort = f.sort ?? "createdAt";
  const [rows, total] = await Promise.all([
    db.reservation.findMany({
      where,
      include: { guest: true, rooms: { include: { roomType: true, room: true } }, channel: true },
      orderBy: { [sort]: f.dir ?? "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.reservation.count({ where }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getReservationDetail(id: string) {
  const res = await db.reservation.findFirst({
    where: { id, deletedAt: null },
    include: {
      guest: true,
      channel: true,
      ratePlan: true,
      promotion: true,
      rooms: { include: { roomType: true, room: true }, orderBy: { createdAt: "asc" } },
      payments: { include: { refunds: true, recordedBy: { select: { name: true } } }, orderBy: { receivedAt: "asc" } },
      invoices: { orderBy: { issuedAt: "desc" } },
      additionalCharges: { orderBy: { postedAt: "asc" } },
      transactions: { orderBy: { postedAt: "asc" } },
      otaCommissions: true,
      otaPayouts: true,
      notes: { orderBy: { createdAt: "desc" } },
      modificationRequests: { orderBy: { createdAt: "desc" } },
      channelReservation: true,
    },
  });
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  const audit = await db.auditLog.findMany({
    where: { entity: "Reservation", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true } } },
  });
  return { ...res, audit };
}

export async function listGuests(args: { q?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, args.pageSize ?? 25);
  const q = args.q?.trim();
  const where: Prisma.GuestWhereInput = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/[\s\-()]/g, "") } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.guest.findMany({
      where,
      include: { _count: { select: { reservations: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.guest.count({ where }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getGuestDetail(id: string) {
  const guest = await db.guest.findFirst({
    where: { id, deletedAt: null },
    include: { reservations: { orderBy: { checkIn: "desc" }, include: { rooms: { include: { roomType: true } } } } },
  });
  if (!guest) throw new AppError("NOT_FOUND", "Guest not found.");
  return guest;
}
