import { db } from "@/server/db/client";
import type { NotificationChannelKind, NotificationEvent } from "@/integrations/notifications/types";
import { resolveNotificationProvider } from "@/integrations/notifications/providers";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getHotel, getSettings } from "./settings.service";

type Locale = "en" | "ar" | "bn";

const EVENT_TITLES: Record<NotificationEvent, Record<Locale, string>> = {
  "reservation.created": { en: "Reservation received", ar: "تم استلام الحجز", bn: "রিজার্ভেশন গৃহীত হয়েছে" },
  "reservation.confirmed": { en: "Reservation confirmed", ar: "تم تأكيد الحجز", bn: "রিজার্ভেশন নিশ্চিত হয়েছে" },
  "reservation.modified": { en: "Reservation updated", ar: "تم تعديل الحجز", bn: "রিজার্ভেশন পরিবর্তিত হয়েছে" },
  "reservation.cancelled": { en: "Reservation cancelled", ar: "تم إلغاء الحجز", bn: "রিজার্ভেশন বাতিল হয়েছে" },
  "guest.checked_in": { en: "Welcome - you are checked in", ar: "أهلاً بك - تم تسجيل وصولك", bn: "স্বাগতম - চেক-ইন সম্পন্ন" },
  "guest.checked_out": { en: "Thank you for your stay", ar: "شكراً لإقامتك", bn: "আপনার থাকার জন্য ধন্যবাদ" },
  "payment.received": { en: "Payment received", ar: "تم استلام الدفعة", bn: "পেমেন্ট গ্রহণ করা হয়েছে" },
};

const LABELS: Record<Locale, Record<string, string>> = {
  en: { number: "Reservation", checkIn: "Check-in", checkOut: "Check-out", total: "Total", dear: "Dear" },
  ar: { number: "رقم الحجز", checkIn: "الوصول", checkOut: "المغادرة", total: "الإجمالي", dear: "عزيزي" },
  bn: { number: "রিজার্ভেশন", checkIn: "চেক-ইন", checkOut: "চেক-আউট", total: "মোট", dear: "প্রিয়" },
};

/**
 * Compose and dispatch notifications for a reservation event. Always records a NotificationLog row;
 * marks it SENT only when a real provider confirmed delivery, otherwise SKIPPED. Never throws:
 * a notification problem must not roll back or fail a booking.
 */
export async function notifyReservationEvent(event: NotificationEvent, reservationId: string): Promise<void> {
  try {
    const res = await db.reservation.findUnique({
      where: { id: reservationId },
      include: { guest: true, hotel: true },
    });
    if (!res) return;
    const settings = await getSettings(res.hotelId, "notifications");
    const locale = (["en", "ar", "bn"].includes(res.locale) ? res.locale : "en") as Locale;
    const l = LABELS[locale];
    const hotelName = locale === "ar" ? res.hotel.nameAr : locale === "bn" ? res.hotel.nameBn : res.hotel.nameEn;
    const subject = `${EVENT_TITLES[event][locale]} - ${res.number}`;
    const body = [
      `${l.dear} ${res.guest.firstName} ${res.guest.lastName},`,
      "",
      `${EVENT_TITLES[event][locale]}`,
      `${l.number}: ${res.number}`,
      `${l.checkIn}: ${formatDate(res.checkIn, locale)}`,
      `${l.checkOut}: ${formatDate(res.checkOut, locale)}`,
      `${l.total}: ${formatMoney(res.totalAmount, res.currency, locale)}`,
      "",
      hotelName,
    ].join("\n");

    const targets: { channel: NotificationChannelKind; to: string | null; enabled: boolean }[] = [
      { channel: "EMAIL", to: res.guest.email, enabled: settings.emailEnabled },
      { channel: "SMS", to: res.guest.phone, enabled: settings.smsEnabled },
      { channel: "WHATSAPP", to: res.guest.phone, enabled: settings.whatsappEnabled },
    ];
    for (const t of targets) {
      if (!t.enabled || !t.to) continue;
      const provider = resolveNotificationProvider(t.channel);
      const log = await db.notificationLog.create({
        data: { event, channel: t.channel, recipient: t.to, subject, body, referenceId: res.id, provider: provider?.key ?? null, status: "QUEUED" },
      });
      if (!provider) {
        await db.notificationLog.update({
          where: { id: log.id },
          data: { status: "SKIPPED", error: `No ${t.channel} delivery provider configured` },
        });
        continue;
      }
      const result = await provider.send({ channel: t.channel, to: t.to, subject, body });
      await db.notificationLog.update({
        where: { id: log.id },
        data: result.ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: result.error },
      });
    }
  } catch (e) {
    console.error("[notification] failed", event, reservationId, e);
  }
}

export async function hotelContactSummary() {
  const hotel = await getHotel();
  return { phone: hotel.phone, email: hotel.email, whatsapp: hotel.whatsapp };
}
