import type { Locale } from "@/i18n/config";

type L = Record<Locale, string>;

function pick(map: Record<string, L>, key: string, locale: Locale): string {
  const row = map[key];
  if (!row) return key.replaceAll("_", " ");
  return row[locale] || row.en;
}

export const SOURCE_LABELS: Record<string, L> = {
  DIRECT_WEBSITE: { en: "Direct website", ar: "الموقع المباشر", bn: "সরাসরি ওয়েবসাইট" },
  BOOKING_COM: { en: "Booking.com", ar: "Booking.com", bn: "Booking.com" },
  AGODA: { en: "Agoda", ar: "Agoda", bn: "Agoda" },
  TRIP_COM: { en: "Trip.com", ar: "Trip.com", bn: "Trip.com" },
  EXPEDIA: { en: "Expedia", ar: "Expedia", bn: "Expedia" },
  PHONE: { en: "Phone", ar: "هاتف", bn: "ফোন" },
  WALK_IN: { en: "Walk-in", ar: "حضور مباشر", bn: "ওয়াক-ইন" },
  OTHER: { en: "Other", ar: "أخرى", bn: "অন্যান্য" },
};

export const RESERVATION_STATUS_LABELS: Record<string, L> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", bn: "অপেক্ষমাণ" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد", bn: "নিশ্চিত" },
  CHECKED_IN: { en: "Checked in", ar: "تم تسجيل الدخول", bn: "চেক-ইন" },
  CHECKED_OUT: { en: "Checked out", ar: "تم تسجيل الخروج", bn: "চেক-আউট" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", bn: "বাতিল" },
  NO_SHOW: { en: "No-show", ar: "لم يحضر", bn: "নো-শো" },
};

export const PAYMENT_STATUS_LABELS: Record<string, L> = {
  UNPAID: { en: "Unpaid", ar: "غير مدفوع", bn: "অপরিশোধিত" },
  PENDING: { en: "Pending", ar: "قيد الانتظار", bn: "অপেক্ষমাণ" },
  PARTIALLY_PAID: { en: "Partially paid", ar: "مدفوع جزئياً", bn: "আংশিক পরিশোধ" },
  PAID: { en: "Paid", ar: "مدفوع", bn: "পরিশোধিত" },
  PAY_AT_HOTEL: { en: "Pay at hotel", ar: "الدفع في الفندق", bn: "হোটেলে পরিশোধ" },
  PAID_BY_OTA: { en: "Paid by OTA", ar: "مدفوع عبر القناة", bn: "OTA পরিশোধিত" },
  PARTIALLY_REFUNDED: { en: "Partially refunded", ar: "مسترد جزئياً", bn: "আংশিক ফেরত" },
  REFUNDED: { en: "Refunded", ar: "مسترد", bn: "ফেরত" },
  FAILED: { en: "Failed", ar: "فشل", bn: "ব্যর্থ" },
  INFORMATION_NOT_PROVIDED: { en: "Payment info not provided", ar: "لم تُوفر بيانات الدفع", bn: "পেমেন্ট তথ্য নেই" },
};

export const COLLECTION_LABELS: Record<string, L> = {
  PAY_AT_HOTEL: { en: "Pay at hotel", ar: "الدفع في الفندق", bn: "হোটেলে পরিশোধ" },
  OTA_COLLECTED: { en: "OTA collected", ar: "حصّلتها القناة", bn: "OTA সংগ্রহ করেছে" },
  HOTEL_COLLECTED: { en: "Hotel collected", ar: "حصّله الفندق", bn: "হোটেল সংগ্রহ করেছে" },
  ONLINE_PAYMENT: { en: "Online payment", ar: "دفع إلكتروني", bn: "অনলাইন পেমেন্ট" },
  BANK_TRANSFER: { en: "Bank transfer", ar: "تحويل بنكي", bn: "ব্যাংক ট্রান্সফার" },
  UNKNOWN: { en: "Unknown", ar: "غير معروف", bn: "অজানা" },
};

export const PAYMENT_SOURCE_LABELS: Record<string, L> = {
  DIRECT_WEBSITE: { en: "Direct website", ar: "الموقع المباشر", bn: "সরাসরি ওয়েবসাইট" },
  BOOKING_COM: { en: "Booking.com", ar: "Booking.com", bn: "Booking.com" },
  AGODA: { en: "Agoda", ar: "Agoda", bn: "Agoda" },
  TRIP_COM: { en: "Trip.com", ar: "Trip.com", bn: "Trip.com" },
  EXPEDIA: { en: "Expedia", ar: "Expedia", bn: "Expedia" },
  HOTEL_CASH: { en: "Cash", ar: "نقد", bn: "নগদ" },
  HOTEL_CARD: { en: "Card", ar: "بطاقة", bn: "কার্ড" },
  BANK_TRANSFER: { en: "Bank", ar: "بنك", bn: "ব্যাংক" },
  OTHER: { en: "Other", ar: "أخرى", bn: "অন্যান্য" },
};

export const ROOM_STATUS_LABELS: Record<string, L> = {
  AVAILABLE: { en: "Available", ar: "متاحة", bn: "উপলব্ধ" },
  OCCUPIED: { en: "Occupied", ar: "مشغولة", bn: "দখলকৃত" },
  RESERVED: { en: "Reserved", ar: "محجوزة", bn: "রিজার্ভড" },
  DIRTY: { en: "Dirty", ar: "غير نظيفة", bn: "অপরিষ্কার" },
  CLEANING: { en: "Cleaning", ar: "قيد التنظيف", bn: "পরিষ্কার হচ্ছে" },
  MAINTENANCE: { en: "Maintenance", ar: "صيانة", bn: "রক্ষণাবেক্ষণ" },
  OUT_OF_ORDER: { en: "Out of order", ar: "خارج الخدمة", bn: "অচল" },
};

export const CONNECTION_LABELS: Record<string, L> = {
  NOT_CONNECTED: { en: "Not connected", ar: "غير متصل", bn: "সংযুক্ত নয়" },
  CONNECTED: { en: "Connected", ar: "متصل", bn: "সংযুক্ত" },
  ERROR: { en: "Error", ar: "خطأ", bn: "ত্রুটি" },
  DISCONNECTED: { en: "Disconnected", ar: "تم قطع الاتصال", bn: "সংযোগ বিচ্ছিন্ন" },
};

export const RECONCILIATION_LABELS: Record<string, L> = {
  MATCHED: { en: "Matched", ar: "متطابق", bn: "মিলছে" },
  PARTIALLY_MATCHED: { en: "Partially matched", ar: "متطابق جزئياً", bn: "আংশিক মিল" },
  UNMATCHED: { en: "Unmatched", ar: "غير متطابق", bn: "মিলছে না" },
  NEEDS_REVIEW: { en: "Needs review", ar: "يحتاج مراجعة", bn: "পর্যালোচনা প্রয়োজন" },
};

export const PAYOUT_LABELS: Record<string, L> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", bn: "অপেক্ষমাণ" },
  PROCESSING: { en: "Processing", ar: "قيد المعالجة", bn: "প্রক্রিয়াধীন" },
  PAID: { en: "Paid", ar: "مدفوع", bn: "পরিশোধিত" },
  FAILED: { en: "Failed", ar: "فشل", bn: "ব্যর্থ" },
  DISPUTED: { en: "Disputed", ar: "متنازع عليه", bn: "বিরোধপূর্ণ" },
  REFUNDED: { en: "Refunded", ar: "مسترد", bn: "ফেরত" },
  UNKNOWN: { en: "Unknown", ar: "غير معروف", bn: "অজানা" },
};

export const label = {
  source: (k: string, locale: Locale) => pick(SOURCE_LABELS, k, locale),
  reservationStatus: (k: string, locale: Locale) => pick(RESERVATION_STATUS_LABELS, k, locale),
  paymentStatus: (k: string, locale: Locale) => pick(PAYMENT_STATUS_LABELS, k, locale),
  collection: (k: string, locale: Locale) => pick(COLLECTION_LABELS, k, locale),
  paymentSource: (k: string, locale: Locale) => pick(PAYMENT_SOURCE_LABELS, k, locale),
  roomStatus: (k: string, locale: Locale) => pick(ROOM_STATUS_LABELS, k, locale),
  connection: (k: string, locale: Locale) => pick(CONNECTION_LABELS, k, locale),
  reconciliation: (k: string, locale: Locale) => pick(RECONCILIATION_LABELS, k, locale),
  payout: (k: string, locale: Locale) => pick(PAYOUT_LABELS, k, locale),
};
