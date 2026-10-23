import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { getActivePaymentProvider } from "@/integrations/payments/registry";
import type { VerifiedPayment } from "@/integrations/payments/types";
import { D, eq } from "@/lib/money";
import { recordPayment } from "./financial.service";
import { confirmReservation } from "./reservation.service";
import { audit } from "./audit.service";

/**
 * Online payment orchestration. Success is declared ONLY after the active provider adapter returns a
 * verified SUCCEEDED payment whose amount and currency match the reservation. Without a configured
 * provider this module refuses to create sessions - there is no simulated success path.
 */

export function paymentMethodsAvailable(payAtHotelEnabled: boolean) {
  return {
    payAtHotel: payAtHotelEnabled,
    online: getActivePaymentProvider() !== null,
  };
}

export async function startOnlinePayment(args: { reservationId: string; returnUrl: string; callbackUrl: string }) {
  const provider = getActivePaymentProvider();
  if (!provider) throw new AppError("NOT_CONFIGURED", "Online payment is not available. Please choose Pay at Hotel.");
  const res = await db.reservation.findUnique({ where: { id: args.reservationId }, include: { guest: true } });
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  if (res.status !== "PENDING") throw new AppError("INVALID_STATE", "This reservation is not awaiting payment.");
  if (res.holdExpiresAt && res.holdExpiresAt < new Date()) throw new AppError("RESERVATION_EXPIRED", "This reservation has expired. Please search again.");
  const amount = D(res.totalAmount).minus(D(res.paidAmount));
  if (!amount.greaterThan(0)) throw new AppError("INVALID_STATE", "Nothing is due on this reservation.");
  try {
    return await provider.createSession({
      reservationNumber: res.number,
      amount: amount.toFixed(2),
      currency: res.currency,
      customer: { name: `${res.guest.firstName} ${res.guest.lastName}`, email: res.guest.email, phone: res.guest.phone },
      returnUrl: args.returnUrl,
      callbackUrl: args.callbackUrl,
      locale: (res.locale as "en" | "ar" | "bn") ?? "en",
    });
  } catch (e) {
    console.error("[payment] session failed", e);
    throw new AppError("PAYMENT_FAILED", "We could not start the payment. Please try again or choose Pay at Hotel.");
  }
}

/** Apply a payment that the provider adapter has already verified (callback or return-URL re-check). */
export async function applyVerifiedPayment(reservationId: string, verified: VerifiedPayment) {
  const provider = getActivePaymentProvider();
  if (!provider) throw new AppError("NOT_CONFIGURED", "No payment provider configured.");
  if (verified.status !== "SUCCEEDED") {
    await audit({ action: "payment.not_successful", entity: "Reservation", entityId: reservationId, after: { status: verified.status, ref: verified.providerReference }, source: "SYSTEM" });
    return { applied: false as const, status: verified.status };
  }
  const res = await db.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  if (verified.currency !== res.currency) throw new AppError("PAYMENT_FAILED", "Payment currency mismatch.");
  const dup = await db.payment.findUnique({ where: { provider_providerReference: { provider: provider.key, providerReference: verified.providerReference } } });
  if (dup) return { applied: false as const, status: "SUCCEEDED" as const, duplicate: true };
  if (!eq(verified.amount, D(res.totalAmount).minus(D(res.paidAmount)))) {
    throw new AppError("PAYMENT_FAILED", "Payment amount does not match the amount due.");
  }
  await db.$transaction(async (tx) => {
    await recordPayment(tx, {
      reservationId,
      amount: verified.amount,
      source: "DIRECT_WEBSITE",
      collectionMethod: "ONLINE_PAYMENT",
      provider: provider.key,
      providerReference: verified.providerReference,
      reference: verified.providerReference,
      confirmed: true,
    });
  });
  const fresh = await db.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  if (fresh.status === "PENDING") await confirmReservation(reservationId);
  return { applied: true as const, status: "SUCCEEDED" as const };
}
