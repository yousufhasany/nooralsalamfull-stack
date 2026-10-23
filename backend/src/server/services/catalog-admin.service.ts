import { z } from "zod";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { addDays, isDateStr, todayIn, toDate } from "@/lib/dates";
import { getHotel } from "./settings.service";
import { audit } from "./audit.service";
import { enqueueInventorySync, enqueueRateSync } from "./channel-queue.service";
import { materializeImage, deletePublicImage } from "@/server/storage/public-files";

const money = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a valid amount, e.g. 350.00");
const dateStr = z.string().refine(isDateStr, "Invalid date");
const bool = z.coerce.boolean();

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

export const roomTypeSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "Use lower-case letters, numbers and dashes"),
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  nameBn: z.string().trim().min(1).max(120),
  descriptionEn: z.string().trim().max(3000).default(""),
  descriptionAr: z.string().trim().max(3000).default(""),
  descriptionBn: z.string().trim().max(3000).default(""),
  bedType: z.string().trim().max(80).default(""),
  bedTypeAr: z.string().trim().max(80).default(""),
  bedTypeBn: z.string().trim().max(80).default(""),
  sizeSqm: z.coerce.number().int().min(1).max(2000).optional().nullable(),
  maxAdults: z.coerce.number().int().min(1).max(20),
  maxChildren: z.coerce.number().int().min(0).max(20),
  maxOccupancy: z.coerce.number().int().min(1).max(30),
  basePrice: money,
  weekendPrice: money.optional().nullable().or(z.literal("").transform(() => null)),
  sortOrder: z.coerce.number().int().default(0),
  isActive: bool.default(true),
  amenityIds: z.array(z.string()).default([]),
});

export async function saveRoomType(id: string | null, raw: unknown, userId: string) {
  const { amenityIds, ...data } = roomTypeSchema.parse(raw);
  if (data.maxOccupancy < data.maxAdults) throw new AppError("INVALID_INPUT", "Maximum occupancy cannot be smaller than maximum adults.");
  const hotel = await getHotel();
  const dup = await db.roomType.findFirst({ where: { hotelId: hotel.id, slug: data.slug, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new AppError("CONFLICT", "Another room type already uses this slug.");
  const row = await db.$transaction(async (tx) => {
    const rt = id
      ? await tx.roomType.update({ where: { id }, data })
      : await tx.roomType.create({ data: { ...data, hotelId: hotel.id } });
    await tx.roomAmenity.deleteMany({ where: { roomTypeId: rt.id } });
    if (amenityIds.length) await tx.roomAmenity.createMany({ data: amenityIds.map((amenityId) => ({ roomTypeId: rt.id, amenityId })) });
    await audit({ userId, action: id ? "roomtype.updated" : "roomtype.created", entity: "RoomType", entityId: rt.id, after: rt }, tx);
    return rt;
  });
  const today = todayIn(hotel.timezone);
  await enqueueRateSync({ roomTypeIds: [row.id], from: today, to: addDays(today, 365) }).catch(() => undefined);
  await enqueueInventorySync({ roomTypeIds: [row.id], from: today, to: addDays(today, 365) }).catch(() => undefined);
  return row;
}

export async function archiveRoomType(id: string, userId: string) {
  const hotel = await getHotel();
  const future = await db.reservationRoom.count({
    where: { roomTypeId: id, isBlocking: true, checkOut: { gt: toDate(todayIn(hotel.timezone)) }, reservation: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } } },
  });
  if (future > 0) throw new AppError("INVALID_STATE", "This room type has current or future reservations and cannot be archived.");
  await db.roomType.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ userId, action: "roomtype.archived", entity: "RoomType", entityId: id });
}

export async function addRoomImage(roomTypeId: string, url: string, alt: { en: string; ar: string; bn: string }, userId: string) {
  const parsed = await materializeImage(url, "rooms");
  const count = await db.roomImage.count({ where: { roomTypeId } });
  const img = await db.roomImage.create({
    data: { roomTypeId, url: parsed, altEn: alt.en, altAr: alt.ar, altBn: alt.bn, sortOrder: count },
  });
  await audit({ userId, action: "roomimage.added", entity: "RoomType", entityId: roomTypeId, after: { url: parsed } });
  return img;
}

export async function removeRoomImage(id: string, userId: string) {
  const img = await db.roomImage.delete({ where: { id } });
  await deletePublicImage(img.url);
  await audit({ userId, action: "roomimage.removed", entity: "RoomType", entityId: img.roomTypeId });
}

// ---------------------------------------------------------------------------
// Rate plans, date rates and pricing rules
// ---------------------------------------------------------------------------

export const ratePlanSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/, "Use upper-case letters, numbers and underscores"),
  type: z.enum(["STANDARD", "NON_REFUNDABLE", "BREAKFAST_INCLUDED", "HALF_BOARD", "FULL_BOARD", "CORPORATE", "PROMOTIONAL"]),
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  nameBn: z.string().trim().min(1).max(120),
  isRefundable: bool.default(true),
  adjustmentType: z.enum(["FIXED", "PERCENT"]).default("FIXED"),
  adjustmentValue: z.string().trim().regex(/^-?\d{1,8}(\.\d{1,2})?$/, "Enter a number, e.g. -10 or 25.50").default("0"),
  isPublic: bool.default(true),
  isActive: bool.default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveRatePlan(id: string | null, raw: unknown, userId: string) {
  const data = ratePlanSchema.parse(raw);
  const row = id ? await db.ratePlan.update({ where: { id }, data }) : await db.ratePlan.create({ data });
  await audit({ userId, action: id ? "rateplan.updated" : "rateplan.created", entity: "RatePlan", entityId: row.id, after: row });
  return row;
}

export const roomRateSchema = z
  .object({
    roomTypeId: z.string().min(1),
    ratePlanId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
    label: z.string().trim().max(80).default(""),
    startDate: dateStr,
    endDate: dateStr,
    price: money,
    daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([]),
    priority: z.coerce.number().int().default(0),
    isActive: bool.default(true),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must not be before start date", path: ["endDate"] });

export async function saveRoomRate(id: string | null, raw: unknown, userId: string) {
  const d = roomRateSchema.parse(raw);
  const data = { ...d, startDate: toDate(d.startDate), endDate: toDate(d.endDate) };
  const row = id ? await db.roomRate.update({ where: { id }, data }) : await db.roomRate.create({ data });
  await audit({ userId, action: id ? "roomrate.updated" : "roomrate.created", entity: "RoomRate", entityId: row.id, after: row });
  await enqueueRateSync({ roomTypeIds: [row.roomTypeId], from: d.startDate, to: d.endDate }).catch(() => undefined);
  return row;
}

export async function deleteRoomRate(id: string, userId: string) {
  const row = await db.roomRate.delete({ where: { id } });
  await audit({ userId, action: "roomrate.deleted", entity: "RoomRate", entityId: id, before: row });
}

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["LONG_STAY_DISCOUNT", "CHANNEL_ADJUSTMENT", "CORPORATE", "PROMOTIONAL"]),
  source: z.enum(["DIRECT_WEBSITE", "BOOKING_COM", "AGODA", "TRIP_COM", "EXPEDIA", "PHONE", "WALK_IN", "OTHER"]).optional().nullable().or(z.literal("").transform(() => null)),
  roomTypeId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
  adjustmentType: z.enum(["FIXED", "PERCENT"]),
  adjustmentValue: z.string().trim().regex(/^-?\d{1,8}(\.\d{1,2})?$/, "Enter a number, e.g. -10 or 25.50"),
  minNights: z.coerce.number().int().min(1).optional().nullable().or(z.literal("").transform(() => null)),
  priority: z.coerce.number().int().default(0),
  isActive: bool.default(true),
});

export async function savePricingRule(id: string | null, raw: unknown, userId: string) {
  const data = pricingRuleSchema.parse(raw);
  const row = id ? await db.pricingRule.update({ where: { id }, data }) : await db.pricingRule.create({ data });
  await audit({ userId, action: id ? "pricingrule.updated" : "pricingrule.created", entity: "PricingRule", entityId: row.id, after: row });
  return row;
}

export async function deletePricingRule(id: string, userId: string) {
  await db.pricingRule.delete({ where: { id } });
  await audit({ userId, action: "pricingrule.deleted", entity: "PricingRule", entityId: id });
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const promotionSchema = z
  .object({
    code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dash and underscore only").transform((v) => v.toUpperCase()),
    nameEn: z.string().trim().min(1).max(120),
    nameAr: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().min(1).max(120),
    discountType: z.enum(["PERCENT", "FIXED"]),
    amount: money,
    startDate: dateStr,
    endDate: dateStr,
    usageLimit: z.coerce.number().int().min(1).optional().nullable().or(z.literal("").transform(() => null)),
    minNights: z.coerce.number().int().min(1).optional().nullable().or(z.literal("").transform(() => null)),
    isActive: bool.default(true),
    roomTypeIds: z.array(z.string()).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must not be before start date", path: ["endDate"] })
  .refine((v) => v.discountType !== "PERCENT" || Number(v.amount) <= 100, { message: "A percentage discount cannot exceed 100", path: ["amount"] });

export async function savePromotion(id: string | null, raw: unknown, userId: string) {
  const { roomTypeIds, ...d } = promotionSchema.parse(raw);
  const data = { ...d, startDate: toDate(d.startDate), endDate: toDate(d.endDate) };
  const row = await db.$transaction(async (tx) => {
    const p = id ? await tx.promotion.update({ where: { id }, data }) : await tx.promotion.create({ data });
    await tx.promotionRoomType.deleteMany({ where: { promotionId: p.id } });
    if (roomTypeIds.length) await tx.promotionRoomType.createMany({ data: roomTypeIds.map((roomTypeId) => ({ promotionId: p.id, roomTypeId })) });
    await audit({ userId, action: id ? "promotion.updated" : "promotion.created", entity: "Promotion", entityId: p.id, after: p }, tx);
    return p;
  });
  return row;
}
