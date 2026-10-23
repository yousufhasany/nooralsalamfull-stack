"use server";

import { redirect } from "next/navigation";
import { isLocale, localePath } from "@/i18n/config";
import { publicAction } from "@/server/auth/action";
import { clientIp } from "@/server/auth/session";
import { submitContactMessage } from "@/server/services/content.service";
import {
  cancelByGuest,
  createPublicBooking,
  getPublicReservation,
  requestModification,
  type PublicReservationView,
} from "@/server/services/public-booking.service";
import { startOnlinePayment } from "@/server/services/payment.service";
import { siteUrl } from "@/lib/seo";
import type { ActionResult } from "@/lib/errors";

export type FormState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };

function toFormState(r: ActionResult<unknown>, fd?: FormData): FormState {
  if (r.ok) return { status: "ok" };
  // React clears uncontrolled fields after a form action, so the submitted values are echoed back.
  const values: Record<string, string> = {};
  if (fd) for (const [k, v] of fd.entries()) if (typeof v === "string") values[k] = v;
  return { status: "error", message: r.message, fieldErrors: r.fieldErrors, values };
}

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function sendContactMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const result = await publicAction(async () =>
    submitContactMessage(
      { name: text(fd, "name"), email: text(fd, "email"), phone: text(fd, "phone"), subject: text(fd, "subject"), message: text(fd, "message"), website: text(fd, "website") },
      await clientIp(),
    ),
  );
  return toFormState(result, fd);
}

/** Prices, tax and availability are decided on the server; only the guest's choices are read from the form. */
export async function createBookingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const localeRaw = text(fd, "locale");
  const locale = isLocale(localeRaw) ? localeRaw : "en";
  const result = await publicAction(async () =>
    createPublicBooking(
      {
        roomTypeId: text(fd, "roomTypeId"),
        checkIn: text(fd, "checkIn"),
        checkOut: text(fd, "checkOut"),
        adults: text(fd, "adults"),
        children: text(fd, "children") || "0",
        rooms: text(fd, "rooms") || "1",
        promotionCode: text(fd, "promotionCode") || null,
        paymentMethod: text(fd, "paymentMethod") || "PAY_AT_HOTEL",
        specialRequests: text(fd, "specialRequests"),
        acceptTerms: fd.get("acceptTerms") === "on",
        locale,
        guest: {
          firstName: text(fd, "firstName"),
          lastName: text(fd, "lastName"),
          email: text(fd, "email"),
          phone: text(fd, "phone"),
          nationality: text(fd, "nationality") || undefined,
          preferredLocale: locale,
        },
      },
      await clientIp(),
    ),
  );
  if (!result.ok) return toFormState(result, fd);
  const confirmation = `${localePath(locale, "/booking/confirmation")}?n=${encodeURIComponent(result.data.number)}&t=${result.data.token}`;

  if (text(fd, "paymentMethod") === "ONLINE_PAYMENT") {
    const site = siteUrl();
    const session = await publicAction(() =>
      startOnlinePayment({ reservationId: result.data.id, returnUrl: `${site}${confirmation}`, callbackUrl: `${site}/api/payments/callback` }),
    );
    if (session.ok) redirect(session.data.redirectUrl);
    // The booking exists and is held; the confirmation page shows it as awaiting payment.
  }
  redirect(confirmation);
}

export async function lookupBookingAction(number: string, contact: string): Promise<ActionResult<PublicReservationView>> {
  return publicAction(async () => getPublicReservation(number, contact, await clientIp()));
}

export async function cancelBookingAction(number: string, contact: string): Promise<ActionResult<PublicReservationView>> {
  return publicAction(async () => {
    const ip = await clientIp();
    await cancelByGuest(number, contact, ip);
    return getPublicReservation(number, contact, ip);
  });
}

export async function requestChangeAction(
  number: string,
  contact: string,
  input: { message: string; requestedCheckIn?: string; requestedCheckOut?: string },
): Promise<ActionResult<PublicReservationView>> {
  return publicAction(async () => {
    const ip = await clientIp();
    await requestModification(number, contact, { message: input.message, requestedCheckIn: input.requestedCheckIn || null, requestedCheckOut: input.requestedCheckOut || null }, ip);
    return getPublicReservation(number, contact, ip);
  });
}
