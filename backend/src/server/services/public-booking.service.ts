import { z } from "zod";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { addDays, fromDate, todayIn } from "@/lib/dates";
import { hmacSha256Hex, safeEqual } from "@/server/security/crypto";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { onlinePaymentsAvailable } from "@/integrations/payments/registry";
import { cancelReservation, createReservation, publicBookingSchema } from "./reservation.service";
import { guestInputSchema, normalizePhone } from "./guest.service";
import { getHotel, getSettings } from "./settings.service";
import { audit } from "./audit.service";

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required");
  return s ?? "development-only-secret";
}

/** Unguessable proof that the caller just made this booking (used on the confirmation URL). */
export function confirmationToken(number: string): string {
  return hmacSha256Hex(authSecret(), `confirmation:${number}`).slice(0, 32);
}

export function isValidConfirmationToken(number: string, token: string): boolean {
  return safeEqual(confirmationToken(number), token);
}

export const publicBookingRequestSchema = publicBookingSchema.extend({
  guest: guestInputSchema.extend({
    phone: z.string().trim().min(1, "Phone number is required"),
    email: z.string().trim().min(1, "Email is required").toLowerCase().email("Enter a valid email address"),
  }),
  locale: z.enum(["en", "ar", "bn"]).default("en"),
  acceptTerms: z.literal(true, { error: "Please accept the booking conditions." }),
});
export type PublicBookingRequest = z.input<typeof publicBookingRequestSchema>;

/**
 * Create a booking from the public website. Price, tax, discount and availability are all decided
 * on the server; nothing price-related is read from the request.
 */
export async function createPublicBooking(raw: unknown, ip: string | null) {
  const input = publicBookingRequestSchema.parse(raw);
  await enforceRateLimit(`booking:ip:${ip ?? "unknown"}`, 12, 60 * 60);
  await enforceRateLimit(`booking:email:${input.guest.email}`, 8, 60 * 60);

  const hotel = await getHotel();
  const booking = await getSettings(hotel.id, "booking");
  if (input.paymentMethod === "PAY_AT_HOTEL" && !booking.payAtHotelEnabled) {
    throw new AppError("INVALID_INPUT", "Pay at hotel is not available. Please choose another payment method.");
  }
  if (input.paymentMethod === "ONLINE_PAYMENT" && !onlinePaymentsAvailable()) {
    throw new AppError("NOT_CONFIGURED", "Online payment is not available at the moment.");
  }

  if (input.adults < input.rooms) {
    throw new AppError("INVALID_INPUT", "Each room needs at least one adult. Please reduce the number of rooms or add adults.");
  }
  // The form collects total guests; spread them over the rooms (every room gets at least one adult).
  const lines = Array.from({ length: input.rooms }, (_, i) => ({
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId ?? null,
    adults: Math.floor(input.adults / input.rooms) + (i < input.adults % input.rooms ? 1 : 0),
    children: Math.floor(input.children / input.rooms) + (i < input.children % input.rooms ? 1 : 0),
    quantity: 1,
  }));

  const reservation = await createReservation({
    source: "DIRECT_WEBSITE",
    guest: input.guest,
    lines,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    promotionCode: input.promotionCode || null,
    paymentCollection: input.paymentMethod === "ONLINE_PAYMENT" ? "ONLINE_PAYMENT" : "PAY_AT_HOTEL",
    specialRequests: input.specialRequests,
    locale: input.locale,
    auditSource: "WEBSITE",
  });
  return { number: reservation.number, id: reservation.id, token: confirmationToken(reservation.number) };
}

// ---------------------------------------------------------------------------
// Guest self-service (manage booking)
// ---------------------------------------------------------------------------

const NOT_FOUND = "We could not find a booking with these details. Please check them and try again.";

export interface PublicReservationView {
  number: string;
  status: string;
  paymentStatus: string;
  paymentCollection: string;
  source: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  roomsSubtotal: string;
  discountTotal: string;
  additionalChargesTotal: string;
  taxTotal: string;
  totalAmount: string;
  paidAmount: string;
  guestName: string;
  rooms: { roomTypeId: string; roomTypeSlug: string; nameEn: string; nameAr: string; nameBn: string; adults: number; children: number }[];
  specialRequests: string;
  holdExpiresAt: string | null;
  canSelfCancel: boolean;
  selfCancelBlockedReason: string | null;
  canRequestModification: boolean;
  openModificationRequests: number;
}

export async function findVerifiedReservation(number: string, contact: string, ip: string | null) {
  const n = number.trim().toUpperCase();
  const c = contact.trim();
  if (!n || !c) throw new AppError("INVALID_INPUT", "Enter your booking number and the email or phone used for the booking.");
  await enforceRateLimit(`lookup:ip:${ip ?? "unknown"}`, 15, 15 * 60);
  await enforceRateLimit(`lookup:number:${n}`, 8, 15 * 60);

  const res = await db.reservation.findFirst({
    where: { number: n, deletedAt: null },
    include: { guest: true, rooms: { include: { roomType: true } }, modificationRequests: { where: { status: "OPEN" } } },
  });
  if (!res) throw new AppError("NOT_FOUND", NOT_FOUND);
  const emailMatch = !!res.guest.email && res.guest.email.toLowerCase() === c.toLowerCase();
  const phoneMatch = !!res.guest.phone && normalizePhone(res.guest.phone) !== "" && normalizePhone(res.guest.phone) === normalizePhone(c);
  if (!emailMatch && !phoneMatch) throw new AppError("NOT_FOUND", NOT_FOUND);
  return res;
}

export async function getPublicReservation(number: string, contact: string, ip: string | null): Promise<PublicReservationView> {
  const res = await findVerifiedReservation(number, contact, ip);
  return toPublicView(res);
}

/** The confirmation page is reachable only with the unguessable token issued at booking time. */
export async function getConfirmedReservationView(number: string, token: string): Promise<PublicReservationView | null> {
  if (!number || !token || !isValidConfirmationToken(number, token)) return null;
  const res = await db.reservation.findFirst({
    where: { number, deletedAt: null },
    include: { guest: true, rooms: { include: { roomType: true } }, modificationRequests: { where: { status: "OPEN" } } },
  });
  return res ? toPublicView(res) : null;
}

type VerifiedReservation = Awaited<ReturnType<typeof findVerifiedReservation>>;

export async function toPublicView(res: VerifiedReservation): Promise<PublicReservationView> {
  const hotel = await getHotel();
  const booking = await getSettings(hotel.id, "booking");
  const eligibility = selfCancelEligibility(res, booking, todayIn(hotel.timezone));
  return {
    number: res.number,
    status: res.status,
    paymentStatus: res.paymentStatus,
    paymentCollection: res.paymentCollection,
    source: res.source,
    checkIn: fromDate(res.checkIn),
    checkOut: fromDate(res.checkOut),
    nights: res.nights,
    adults: res.adults,
    children: res.children,
    currency: res.currency,
    roomsSubtotal: res.roomsSubtotal.toFixed(2),
    discountTotal: res.discountTotal.toFixed(2),
    additionalChargesTotal: res.additionalChargesTotal.toFixed(2),
    taxTotal: res.taxTotal.toFixed(2),
    totalAmount: res.totalAmount.toFixed(2),
    paidAmount: res.paidAmount.toFixed(2),
    guestName: `${res.guest.firstName} ${res.guest.lastName}`,
    rooms: res.rooms.map((r) => ({
      roomTypeId: r.roomTypeId,
      roomTypeSlug: r.roomType.slug,
      nameEn: r.roomType.nameEn,
      nameAr: r.roomType.nameAr,
      nameBn: r.roomType.nameBn,
      adults: r.adults,
      children: r.children,
    })),
    specialRequests: res.specialRequests,
    holdExpiresAt: res.holdExpiresAt?.toISOString() ?? null,
    canSelfCancel: eligibility.ok,
    selfCancelBlockedReason: eligibility.ok ? null : eligibility.reason,
    canRequestModification:
      booking.guestModificationRequestEnabled && ["PENDING", "CONFIRMED"].includes(res.status) && res.source === "DIRECT_WEBSITE",
    openModificationRequests: res.modificationRequests.length,
  };
}

function selfCancelEligibility(
  res: { status: string; source: string; checkIn: Date },
  booking: { guestSelfCancelEnabled: boolean; cancellationFreeDays: number },
  today: string,
): { ok: true } | { ok: false; reason: string } {
  if (!["PENDING", "CONFIRMED"].includes(res.status)) return { ok: false, reason: "This booking can no longer be cancelled online." };
  if (res.source !== "DIRECT_WEBSITE") return { ok: false, reason: "This booking was made through another website. Please manage it there, or contact the hotel." };
  if (!booking.guestSelfCancelEnabled) return { ok: false, reason: "Online cancellation is not available. Please contact the hotel." };
  const lastFreeDay = addDays(fromDate(res.checkIn), -booking.cancellationFreeDays);
  if (today > lastFreeDay) return { ok: false, reason: "The free-cancellation period has ended. Please contact the hotel." };
  return { ok: true };
}

export async function cancelByGuest(number: string, contact: string, ip: string | null) {
  const res = await findVerifiedReservation(number, contact, ip);
  const hotel = await getHotel();
  const booking = await getSettings(hotel.id, "booking");
  const e = selfCancelEligibility(res, booking, todayIn(hotel.timezone));
  if (!e.ok) throw new AppError("INVALID_STATE", e.reason);
  await cancelReservation({ reservationId: res.id, reason: "Cancelled by guest (website)", auditSource: "WEBSITE" });
  return { number: res.number };
}

export const modificationRequestSchema = z.object({
  message: z.string().trim().min(5, "Please describe the change you need").max(1000),
  requestedCheckIn: z.string().optional().nullable(),
  requestedCheckOut: z.string().optional().nullable(),
});

export async function requestModification(number: string, contact: string, raw: unknown, ip: string | null) {
  const data = modificationRequestSchema.parse(raw);
  const res = await findVerifiedReservation(number, contact, ip);
  const hotel = await getHotel();
  const booking = await getSettings(hotel.id, "booking");
  if (!booking.guestModificationRequestEnabled || !["PENDING", "CONFIRMED"].includes(res.status)) {
    throw new AppError("INVALID_STATE", "Changes to this booking cannot be requested online. Please contact the hotel.");
  }
  const req = await db.modificationRequest.create({
    data: {
      reservationId: res.id,
      message: data.message,
      requestedCheckIn: data.requestedCheckIn ? new Date(`${data.requestedCheckIn}T00:00:00Z`) : null,
      requestedCheckOut: data.requestedCheckOut ? new Date(`${data.requestedCheckOut}T00:00:00Z`) : null,
    },
  });
  await audit({ action: "reservation.modification_requested", entity: "Reservation", entityId: res.id, after: { requestId: req.id }, source: "WEBSITE", ip });
  return { id: req.id };
}
