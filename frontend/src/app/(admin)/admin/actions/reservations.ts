"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAction } from "@/server/auth/action";
import { db } from "@/server/db/client";
import { AppError, fieldError } from "@/lib/errors";
import {
  addReservationNote,
  cancelReservation,
  deleteReservation,
  confirmReservation,
  createReservation,
  modifyReservation,
  setPaymentCollection,
} from "@/server/services/reservation.service";
import { checkIn, checkOut, changeAssignedRoom } from "@/server/services/frontdesk.service";
import { addAdditionalCharge, recordPayment, recordRefund, voidAdditionalCharge } from "@/server/services/financial.service";
import { generateInvoice } from "@/server/services/invoice.service";
import { updateGuest } from "@/server/services/guest.service";
import type { PaymentCollectionMethod, PaymentSource, ReservationSource } from "@/generated/prisma/enums";
import { amount, bool, num, opt, optAmount, str } from "./form";
import { flash } from "./flash";

function refresh(id?: string) {
  revalidatePath("/admin/reservations");
  revalidatePath("/admin");
  revalidatePath("/admin/history");
  if (id) revalidatePath(`/admin/reservations/${id}`);
}

function wholeNumber(fd: FormData, key: string, fallback: number, min: number, label: string): number {
  const n = num(fd, key, fallback);
  if (!Number.isInteger(n)) throw fieldError(key, `${label} must be a whole number.`);
  if (n < min) throw fieldError(key, `${label} must be at least ${min}.`);
  return n;
}

export async function createWalkInAction(formData: FormData) {
  const result = await adminAction("reservations.create", async (user) => {
    const roomTypeId = str(formData, "roomTypeId");
    const checkInDate = str(formData, "checkIn");
    const checkOutDate = str(formData, "checkOut");
    if (!str(formData, "firstName")) throw fieldError("firstName", "First name is required.");
    if (!str(formData, "lastName")) throw fieldError("lastName", "Last name is required.");
    if (!roomTypeId) throw fieldError("roomTypeId", "Choose a room type.");
    if (!checkInDate) throw fieldError("checkIn", "Choose the check-in date.");
    if (!checkOutDate) throw fieldError("checkOut", "Choose the check-out date.");
    if (checkOutDate <= checkInDate) throw fieldError("checkOut", "Check-out must be after check-in.");
    const adults = wholeNumber(formData, "adults", 1, 1, "Adults");
    const children = wholeNumber(formData, "children", 0, 0, "Children");
    const quantity = wholeNumber(formData, "rooms", 1, 1, "Rooms");
    const roomId = opt(formData, "roomId");

    let res: Awaited<ReturnType<typeof createReservation>>;
    try {
      res = await createReservation({
        source: (str(formData, "source") || "WALK_IN") as ReservationSource,
        guest: {
          firstName: str(formData, "firstName"),
          lastName: str(formData, "lastName"),
          email: opt(formData, "email") ?? "",
          phone: opt(formData, "phone") ?? "",
          nationality: opt(formData, "nationality") ?? "",
        },
        lines: [{ roomTypeId, ratePlanId: opt(formData, "ratePlanId"), adults, children, quantity, nightlyPrice: opt(formData, "nightlyPrice") }],
        checkIn: checkInDate,
        checkOut: checkOutDate,
        promotionCode: opt(formData, "promotionCode"),
        paymentCollection: (opt(formData, "paymentCollection") as PaymentCollectionMethod | undefined) ?? "PAY_AT_HOTEL",
        specialRequests: opt(formData, "specialRequests") ?? "",
        internalNotes: opt(formData, "internalNotes") ?? "",
        actorId: user.id,
        allowPastDates: true,
        status: "CONFIRMED",
      });
    } catch (e) {
      if (e instanceof AppError && e.code === "ROOM_UNAVAILABLE" && !e.details?.field) throw fieldError("roomTypeId", e.message, "ROOM_UNAVAILABLE");
      throw e;
    }

    let roomNote = "";
    if (roomId) {
      const line = await db.reservationRoom.findFirst({ where: { reservationId: res.id, roomTypeId, roomId: null }, orderBy: { id: "asc" } });
      if (line) {
        try {
          await changeAssignedRoom({ reservationRoomId: line.id, roomId, userId: user.id });
        } catch (e) {
          roomNote = ` The selected room could not be assigned: ${e instanceof AppError ? e.message : "please assign it on the reservation."}`;
        }
      }
    }
    refresh(res.id);
    return { id: res.id, number: res.number, roomNote };
  });
  if (result.ok) {
    await flash(`Reservation ${result.data.number} created.${result.data.roomNote}`);
    redirect(`/admin/reservations/${result.data.id}`);
  }
  return result;
}

export async function deleteReservationAction(formData: FormData) {
  const result = await adminAction("reservations.delete", async (user) => {
    const id = str(formData, "reservationId");
    await deleteReservation(id, user.id);
    refresh(id);
  });
  if (result.ok) {
    await flash("Reservation deleted.");
    redirect("/admin/reservations");
  }
  return result;
}

export async function confirmReservationAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    await confirmReservation(id, user.id);
    refresh(id);
  });
}

export async function cancelReservationAction(formData: FormData) {
  return adminAction("reservations.cancel", async (user) => {
    const id = str(formData, "reservationId");
    await cancelReservation({
      reservationId: id,
      reason: str(formData, "reason"),
      cancellationFee: optAmount(formData, "cancellationFee"),
      newStatus: str(formData, "newStatus") === "NO_SHOW" ? "NO_SHOW" : "CANCELLED",
      actorId: user.id,
    });
    refresh(id);
  });
}

export async function modifyReservationAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    const roomTypeId = opt(formData, "roomTypeId");
    const reservationRoomId = opt(formData, "reservationRoomId");
    await modifyReservation({
      reservationId: id,
      checkIn: opt(formData, "checkIn"),
      checkOut: opt(formData, "checkOut"),
      adults: opt(formData, "adults") ? wholeNumber(formData, "adults", 1, 1, "Adults") : undefined,
      children: opt(formData, "children") ? wholeNumber(formData, "children", 0, 0, "Children") : undefined,
      specialRequests: opt(formData, "specialRequests"),
      internalNotes: opt(formData, "internalNotes"),
      roomTypeChanges: roomTypeId && reservationRoomId ? { [reservationRoomId]: roomTypeId } : undefined,
      actorId: user.id,
      allowPastDates: true,
    });
    refresh(id);
  });
}

export async function addNoteAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    await addReservationNote(id, str(formData, "body"), user.name, user.id);
    refresh(id);
  });
}

export async function setCollectionAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    await setPaymentCollection(id, str(formData, "paymentCollection") as PaymentCollectionMethod, user.id);
    refresh(id);
  });
}

export async function checkInAction(formData: FormData) {
  return adminAction("reservations.checkin", async (user) => {
    const id = str(formData, "reservationId");
    const assignments: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("assign:") && typeof v === "string" && v) assignments[k.slice(7)] = v;
    }
    const depositAmt = optAmount(formData, "depositAmount");
    await checkIn({
      reservationId: id,
      guestVerified: bool(formData, "guestVerified"),
      assignments,
      allowEarly: bool(formData, "allowEarly"),
      userId: user.id,
      deposit:
        depositAmt && Number(depositAmt) > 0
          ? {
              amount: depositAmt,
              source: (opt(formData, "depositSource") as PaymentSource | undefined) ?? "HOTEL_CASH",
              collectionMethod: "HOTEL_COLLECTED",
              reference: opt(formData, "depositReference"),
            }
          : undefined,
    });
    refresh(id);
  });
}

export async function checkOutAction(formData: FormData) {
  const id = str(formData, "reservationId");
  const result = await adminAction("reservations.checkout", async (user) => {
    const amt = optAmount(formData, "paymentAmount");
    return checkOut({
      reservationId: id,
      userId: user.id,
      payment:
        amt && Number(amt) > 0
          ? {
              amount: amt,
              source: (opt(formData, "paymentSource") as PaymentSource | undefined) ?? "HOTEL_CASH",
              collectionMethod: "HOTEL_COLLECTED",
              reference: opt(formData, "paymentReference"),
            }
          : undefined,
    });
  });
  if (result.ok) {
    refresh(id);
    await flash(`Invoice ${result.data.number} issued. Print or download it below.`);
    redirect(`/admin/reservations/${id}/invoice/${result.data.id}`);
  }
  return result;
}

export async function assignRoomAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const reservationId = str(formData, "reservationId");
    await changeAssignedRoom({
      reservationRoomId: str(formData, "reservationRoomId"),
      roomId: str(formData, "roomId"),
      userId: user.id,
    });
    refresh(reservationId);
  });
}

export async function recordPaymentAction(formData: FormData) {
  return adminAction("payments.record", async (user) => {
    const id = str(formData, "reservationId");
    await db.$transaction((tx) =>
      recordPayment(tx, {
        reservationId: id,
        amount: amount(formData, "amount"),
        source: str(formData, "source") as PaymentSource,
        collectionMethod: str(formData, "collectionMethod") as PaymentCollectionMethod,
        reference: opt(formData, "reference"),
        note: opt(formData, "note") ?? "",
        userId: user.id,
      }),
    );
    refresh(id);
  });
}

export async function refundPaymentAction(formData: FormData) {
  return adminAction("payments.refund", async (user) => {
    const id = str(formData, "reservationId");
    await db.$transaction((tx) =>
      recordRefund(tx, {
        paymentId: str(formData, "paymentId"),
        amount: amount(formData, "amount"),
        reason: str(formData, "reason"),
        userId: user.id,
      }),
    );
    refresh(id);
  });
}

export async function addChargeAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    await db.$transaction((tx) =>
      addAdditionalCharge(tx, {
        reservationId: id,
        description: str(formData, "description"),
        category: opt(formData, "category") ?? "OTHER",
        quantity: wholeNumber(formData, "quantity", 1, 1, "Quantity"),
        unitPrice: amount(formData, "unitPrice"),
        isTaxable: bool(formData, "isTaxable") || formData.get("isTaxable") === "on",
        userId: user.id,
      }),
    );
    refresh(id);
  });
}

export async function voidChargeAction(formData: FormData) {
  return adminAction("reservations.edit", async (user) => {
    const id = str(formData, "reservationId");
    await db.$transaction((tx) => voidAdditionalCharge(tx, str(formData, "chargeId"), str(formData, "reason"), user.id));
    refresh(id);
  });
}

export async function issueInvoiceAction(formData: FormData) {
  const id = str(formData, "reservationId");
  const result = await adminAction("invoices.view", async (user) => generateInvoice(id, user.id));
  if (result.ok) {
    refresh(id);
    await flash(`Invoice ${result.data.number} issued. Print or download it below.`);
    redirect(`/admin/reservations/${id}/invoice/${result.data.id}`);
  }
  return result;
}

export async function updateReservationGuestAction(formData: FormData) {
  return adminAction("guests.edit", async () => {
    const id = str(formData, "reservationId");
    await updateGuest(str(formData, "guestId"), {
      firstName: str(formData, "firstName"),
      lastName: str(formData, "lastName"),
      email: opt(formData, "email") ?? "",
      phone: opt(formData, "phone") ?? "",
      nationality: opt(formData, "nationality") ?? "",
      notes: opt(formData, "notes") ?? "",
    });
    refresh(id);
  });
}

export async function resolveModificationAction(formData: FormData) {
  return adminAction("reservations.edit", async () => {
    const id = str(formData, "reservationId");
    const status = str(formData, "status") === "APPROVED" ? "APPROVED" : "REJECTED";
    await db.modificationRequest.update({
      where: { id: str(formData, "requestId") },
      data: { status, resolvedAt: new Date(), resolvedNote: opt(formData, "resolvedNote") ?? "" },
    });
    refresh(id);
  });
}
