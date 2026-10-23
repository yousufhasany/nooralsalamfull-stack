import type { ChannelKind, ReservationSource, RoleKey } from "@/generated/prisma/enums";
import type { Db } from "@/server/db/client";
import { ALL_PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/server/auth/permissions";

const CHANNELS: {
  code: string;
  name: string;
  kind: ChannelKind;
  source: ReservationSource;
  providerKey: string;
  mock?: boolean;
}[] = [
  { code: "BOOKING_COM", name: "Booking.com", kind: "OTA", source: "BOOKING_COM", providerKey: "booking_com" },
  { code: "AGODA", name: "Agoda", kind: "OTA", source: "AGODA", providerKey: "agoda" },
  { code: "TRIP_COM", name: "Trip.com", kind: "OTA", source: "TRIP_COM", providerKey: "trip_com" },
  { code: "EXPEDIA", name: "Expedia", kind: "OTA", source: "EXPEDIA", providerKey: "expedia" },
  { code: "CHANNEL_MANAGER", name: "External channel manager", kind: "CHANNEL_MANAGER", source: "OTHER", providerKey: "channel_manager" },
  { code: "MOCK", name: "Mock channel (development)", kind: "OTA", source: "OTHER", providerKey: "mock", mock: true },
];

/**
 * Roles, permissions, the hotel row, and unconnected channel slots.
 * Demo staff and rooms are created by the seed script, not here.
 */
export async function seedCore(db: Db, opts: { includeMock?: boolean } = {}) {
  for (const key of ALL_PERMISSIONS) {
    await db.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  const permissions = await db.permission.findMany();
  const permissionId = new Map(permissions.map((p) => [p.key, p.id]));

  for (const key of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    const labels = ROLE_LABELS[key];
    const role = await db.role.upsert({
      where: { key },
      create: { key, nameEn: labels.en, nameAr: labels.ar, nameBn: labels.bn },
      update: { nameEn: labels.en, nameAr: labels.ar, nameBn: labels.bn },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: ROLE_PERMISSIONS[key].map((permission) => ({
        roleId: role.id,
        permissionId: permissionId.get(permission)!,
      })),
    });
  }

  const existing = await db.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  const hotel =
    existing ??
    (await db.hotel.create({
      data: {
        slug: "noor-al-salam",
        nameEn: "Noor Al Salam Hotel",
        nameAr: "فندق نور السلام",
        nameBn: "নূর আল সালাম হোটেল",
        currency: "SAR",
        timezone: "Asia/Riyadh",
      },
    }));

  let sortOrder = 0;
  for (const channel of CHANNELS) {
    if (channel.mock && !opts.includeMock) continue;
    await db.channel.upsert({
      where: { code: channel.code },
      create: {
        code: channel.code,
        name: channel.name,
        kind: channel.kind,
        source: channel.source,
        providerKey: channel.providerKey,
        sortOrder: sortOrder++,
      },
      update: { name: channel.name, kind: channel.kind, source: channel.source, providerKey: channel.providerKey },
    });
  }

  return hotel;
}
