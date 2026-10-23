import { db } from "@/server/db/client";
import { seedCore } from "@/server/seed/core";
import { saveSettings } from "@/server/services/settings.service";
import { addDays, todayIn, type DateStr } from "@/lib/dates";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface World {
  hotelId: string;
  roomType: { id: string; slug: string };
  roomIds: string[];
  channels: Record<string, string>;
}

export interface WorldOptions {
  rooms?: number;
  basePrice?: string;
  weekendPrice?: string | null;
  taxRate?: string | null;
  pricesIncludeTax?: boolean;
  sameDayTurnover?: boolean;
  mock?: boolean;
  maxRoomsPerBooking?: number;
}

/** Fresh database with one hotel, N rooms of one type, and the standard channel list. */
export async function createWorld(opts: WorldOptions = {}): Promise<World> {
  await resetDb();
  const hotel = await seedCore(db, { includeMock: opts.mock });
  await saveSettings(hotel.id, "booking", {
    sameDayTurnover: opts.sameDayTurnover ?? true,
    maxRoomsPerBooking: opts.maxRoomsPerBooking ?? 30,
  });
  if (opts.taxRate) {
    await saveSettings(hotel.id, "tax", {
      rules: [{ code: "VAT", nameEn: "Test tax", rate: opts.taxRate, enabled: true }],
      pricesIncludeTax: opts.pricesIncludeTax ?? false,
    });
  }
  const roomType = await db.roomType.create({
    data: {
      hotelId: hotel.id,
      slug: "test-room",
      nameEn: "Test Room",
      nameAr: "غرفة اختبار",
      nameBn: "টেস্ট রুম",
      basePrice: opts.basePrice ?? "300.00",
      weekendPrice: opts.weekendPrice ?? null,
      maxAdults: 3,
      maxChildren: 2,
      maxOccupancy: 4,
    },
  });
  const count = opts.rooms ?? 20;
  const roomIds: string[] = [];
  for (let i = 1; i <= count; i++) {
    const r = await db.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, number: String(100 + i), floor: 1 } });
    roomIds.push(r.id);
  }
  const channels = Object.fromEntries((await db.channel.findMany()).map((c) => [c.code, c.id]));
  return { hotelId: hotel.id, roomType: { id: roomType.id, slug: roomType.slug }, roomIds, channels };
}

export const stay = (fromOffset = 20, nights = 2): { checkIn: DateStr; checkOut: DateStr } => {
  const today = todayIn("Asia/Riyadh");
  return { checkIn: addDays(today, fromOffset), checkOut: addDays(today, fromOffset + nights) };
};

export const testGuest = (n: number | string) => ({
  firstName: "Test",
  lastName: `Guest ${n}`,
  email: `guest${n}@example.test`,
  phone: "+966500000000",
});
