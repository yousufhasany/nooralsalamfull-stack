/**
 * Development / first-install seed.
 * Production-safe core (roles, empty hotel, unconnected channels) always runs.
 * Demo staff, rooms, guests and reservations run only when NODE_ENV !== "production"
 * (or SEED_DEMO=1). All demo people are fictional.
 */
import "dotenv/config";
import { db } from "../src/server/db/client";
import { seedCore } from "../src/server/seed/core";
import { hashPassword } from "../src/server/auth/auth.service";
import { saveSettings } from "../src/server/services/settings.service";
import { createReservation } from "../src/server/services/reservation.service";
import { addDays, todayIn } from "../src/lib/dates";
import type { ReservationSource, RoleKey } from "../src/generated/prisma/enums";

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "ChangeMe-Demo-123";

async function seedStaff() {
  const roles = await db.role.findMany();
  const byKey = new Map(roles.map((r) => [r.key, r.id]));
  const hash = await hashPassword(DEMO_PASSWORD);
  const staff: { email: string; name: string; role: RoleKey }[] = [
    { email: "admin@nooralsalam.local", name: "Demo Super Admin", role: "SUPER_ADMIN" },
    { email: "manager@nooralsalam.local", name: "Demo Hotel Manager", role: "HOTEL_MANAGER" },
    { email: "reception@nooralsalam.local", name: "Demo Receptionist", role: "RECEPTIONIST" },
    { email: "reservations@nooralsalam.local", name: "Demo Reservation Manager", role: "RESERVATION_MANAGER" },
    { email: "housekeeping@nooralsalam.local", name: "Demo Housekeeping", role: "HOUSEKEEPING" },
    { email: "accounts@nooralsalam.local", name: "Demo Accountant", role: "ACCOUNTANT" },
  ];
  for (const s of staff) {
    await db.user.upsert({
      where: { email: s.email },
      create: { email: s.email, name: s.name, passwordHash: hash, roleId: byKey.get(s.role)!, isDemo: true },
      update: { name: s.name, roleId: byKey.get(s.role)!, isDemo: true },
    });
  }
  console.log(`Demo staff password: ${DEMO_PASSWORD}`);
  console.log("  admin@nooralsalam.local (and manager / reception / reservations / housekeeping / accounts)");
}

async function seedCatalog(hotelId: string) {
  const amenityDefs = [
    { key: "wifi", nameEn: "Wi-Fi", nameAr: "واي فاي", nameBn: "ওয়াই-ফাই" },
    { key: "ac", nameEn: "Air conditioning", nameAr: "تكييف", nameBn: "এয়ার কন্ডিশনিং" },
    { key: "tv", nameEn: "Television", nameAr: "تلفاز", nameBn: "টেলিভিশন" },
    { key: "ensuite", nameEn: "Private bathroom", nameAr: "حمام خاص", nameBn: "ব্যক্তিগত বাথরুম" },
  ];
  const amenityIds: string[] = [];
  for (const [i, a] of amenityDefs.entries()) {
    const row = await db.amenity.upsert({
      where: { key: a.key },
      create: { ...a, sortOrder: i },
      update: a,
    });
    amenityIds.push(row.id);
  }

  const types = [
    { slug: "standard-room", nameEn: "Standard Room", nameAr: "غرفة قياسية", nameBn: "স্ট্যান্ডার্ড রুম", bedType: "Queen", bedTypeAr: "سرير كوين", bedTypeBn: "কুইন বেড", sizeSqm: 22, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, basePrice: "280.00", weekendPrice: "320.00", count: 8, start: 101 },
    { slug: "deluxe-room", nameEn: "Deluxe Room", nameAr: "غرفة ديلوكس", nameBn: "ডিলাক্স রুম", bedType: "King", bedTypeAr: "سرير كينغ", bedTypeBn: "কিং বেড", sizeSqm: 28, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, basePrice: "360.00", weekendPrice: "410.00", count: 6, start: 201 },
    { slug: "executive-room", nameEn: "Executive Room", nameAr: "غرفة تنفيذية", nameBn: "এক্সিকিউটিভ রুম", bedType: "King", bedTypeAr: "سرير كينغ", bedTypeBn: "কিং বেড", sizeSqm: 32, maxAdults: 2, maxChildren: 1, maxOccupancy: 3, basePrice: "420.00", weekendPrice: "480.00", count: 4, start: 301 },
    { slug: "family-room", nameEn: "Family Room", nameAr: "غرفة عائلية", nameBn: "ফ্যামিলি রুম", bedType: "Two queens", bedTypeAr: "سريران كوين", bedTypeBn: "দুটি কুইন বেড", sizeSqm: 36, maxAdults: 3, maxChildren: 2, maxOccupancy: 5, basePrice: "480.00", weekendPrice: "540.00", count: 4, start: 401 },
    { slug: "junior-suite", nameEn: "Junior Suite", nameAr: "جناح صغير", nameBn: "জুনিয়র স্যুট", bedType: "King", bedTypeAr: "سرير كينغ", bedTypeBn: "কিং বেড", sizeSqm: 42, maxAdults: 2, maxChildren: 2, maxOccupancy: 4, basePrice: "620.00", weekendPrice: "700.00", count: 2, start: 501 },
    { slug: "executive-suite", nameEn: "Executive Suite", nameAr: "جناح تنفيذي", nameBn: "এক্সিকিউটিভ স্যুট", bedType: "King", bedTypeAr: "سرير كينغ", bedTypeBn: "কিং বেড", sizeSqm: 55, maxAdults: 2, maxChildren: 2, maxOccupancy: 4, basePrice: "850.00", weekendPrice: "950.00", count: 2, start: 601 },
  ];

  const typeIds: Record<string, string> = {};
  for (const [i, t] of types.entries()) {
    const existing = await db.roomType.findFirst({ where: { hotelId, slug: t.slug } });
    const { count, start, ...data } = t;
    const rt =
      existing ??
      (await db.roomType.create({
        data: {
          ...data,
          hotelId,
          sortOrder: i,
          descriptionEn: "Example room type for development. Replace this text in admin.",
          descriptionAr: "نوع غرفة تجريبي للتطوير. استبدل هذا النص من لوحة التحكم.",
          descriptionBn: "ডেভেলপমেন্টের জন্য উদাহরণ রুম। অ্যাডমিন থেকে পরিবর্তন করুন।",
        },
      }));
    typeIds[t.slug] = rt.id;
    await db.roomAmenity.deleteMany({ where: { roomTypeId: rt.id } });
    await db.roomAmenity.createMany({ data: amenityIds.map((amenityId) => ({ roomTypeId: rt.id, amenityId })) });
    for (let n = 0; n < count; n++) {
      const number = String(start + n);
      const found = await db.room.findFirst({ where: { hotelId, number } });
      if (!found) await db.room.create({ data: { hotelId, roomTypeId: rt.id, number, floor: Math.floor(start / 100) } });
    }
  }

  const facilities = [
    { slug: "wifi", nameEn: "Wi-Fi", nameAr: "واي فاي", nameBn: "ওয়াই-ফাই", icon: "wifi" },
    { slug: "reception", nameEn: "24-hour reception", nameAr: "استقبال على مدار الساعة", nameBn: "২৪ ঘণ্টা রিসেপশন", icon: "clock" },
    { slug: "parking", nameEn: "Parking", nameAr: "موقف سيارات", nameBn: "পার্কিং", icon: "car" },
    { slug: "prayer", nameEn: "Prayer facilities", nameAr: "أماكن للصلاة", nameBn: "নামাজের ব্যবস্থা", icon: "moon" },
  ];
  for (const [i, f] of facilities.entries()) {
    const found = await db.facility.findFirst({ where: { hotelId, slug: f.slug } });
    const descriptions = {
      descriptionEn: "Example facility. Confirm and edit in admin before publishing as a hotel fact.",
      descriptionAr: "مثال على مرفق. أكّده وعدّله من لوحة التحكم قبل نشره كمعلومة عن الفندق.",
      descriptionBn: "উদাহরণ সুবিধা। হোটেলের তথ্য হিসেবে প্রকাশের আগে অ্যাডমিন থেকে নিশ্চিত করে সম্পাদনা করুন।",
    };
    if (!found) await db.facility.create({ data: { ...f, ...descriptions, hotelId, sortOrder: i } });
    else if (!found.descriptionAr || !found.descriptionBn) await db.facility.update({ where: { id: found.id }, data: descriptions });
  }

  return typeIds;
}

async function seedDemoBookings(typeIds: Record<string, string>) {
  if (await db.reservation.count() > 0) {
    console.log("Reservations already exist — skipping demo bookings.");
    return;
  }
  const deluxe = typeIds["deluxe-room"];
  const standard = typeIds["standard-room"];
  const today = todayIn("Asia/Riyadh");
  const stay = (offset: number, nights = 2) => ({ checkIn: addDays(today, offset), checkOut: addDays(today, offset + nights) });

  const samples: { source: ReservationSource; guest: string; type: string; offset: number; collection?: "PAY_AT_HOTEL" | "OTA_COLLECTED" }[] = [
    { source: "DIRECT_WEBSITE", guest: "Amina", type: deluxe, offset: 3 },
    { source: "DIRECT_WEBSITE", guest: "Yusuf", type: standard, offset: 5 },
    { source: "WALK_IN", guest: "Hassan", type: standard, offset: 0 },
    { source: "PHONE", guest: "Layla", type: deluxe, offset: 8 },
    { source: "BOOKING_COM", guest: "Omar", type: deluxe, offset: 4, collection: "OTA_COLLECTED" },
    { source: "AGODA", guest: "Sara", type: standard, offset: 6, collection: "OTA_COLLECTED" },
    { source: "TRIP_COM", guest: "Nabil", type: deluxe, offset: 10, collection: "OTA_COLLECTED" },
    { source: "EXPEDIA", guest: "Huda", type: standard, offset: 12, collection: "PAY_AT_HOTEL" },
  ];

  const channels = Object.fromEntries((await db.channel.findMany()).map((c) => [c.source, c.id]));

  for (const [i, s] of samples.entries()) {
    const dates = stay(s.offset);
    await createReservation({
      source: s.source,
      channelId: s.source === "DIRECT_WEBSITE" || s.source === "WALK_IN" || s.source === "PHONE" ? null : channels[s.source],
      externalReservationId: s.source === "DIRECT_WEBSITE" || s.source === "WALK_IN" || s.source === "PHONE" ? null : `DEMO-${s.source}-${i + 1}`,
      guest: {
        firstName: s.guest,
        lastName: "Demo",
        email: `${s.guest.toLowerCase()}.demo@example.test`,
        phone: `+9665000000${String(10 + i)}`,
        nationality: "SA",
      },
      lines: [{ roomTypeId: s.type, adults: 2, children: 0, quantity: 1 }],
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      paymentCollection: s.collection ?? "PAY_AT_HOTEL",
      status: "CONFIRMED",
      allowPastDates: true,
      isDemo: true,
      auditSource: "SYSTEM",
      internalNotes: "DEMO reservation — fictional guest.",
    });
  }
  console.log("Created fictional demo reservations (labeled DEMO).");
}

async function main() {
  const includeDemo = process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1";
  const hotel = await seedCore(db, { includeMock: includeDemo });
  await saveSettings(hotel.id, "tax", {
    rules: [{ code: "VAT", nameEn: "VAT", nameAr: "ضريبة القيمة المضافة", nameBn: "ভ্যাট", rate: "15", enabled: true }],
    pricesIncludeTax: false,
  });
  if (!includeDemo) {
    console.log("Production seed complete (roles, hotel, unconnected channels). No demo people or bookings.");
    return;
  }
  await seedStaff();
  const types = await seedCatalog(hotel.id);
  await seedDemoBookings(types);
  console.log("Development seed complete. Review and replace example room/facility copy before going live.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
