import { z } from "zod";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { getHotel } from "./settings.service";
import { audit } from "./audit.service";
import { materializeImage, materializeOptionalImage, deletePublicImage } from "@/server/storage/public-files";

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function getPublicRoomTypes() {
  const hotel = await getHotel();
  return db.roomType.findMany({
    where: { hotelId: hotel.id, isActive: true, deletedAt: null },
    include: { images: { orderBy: { sortOrder: "asc" } }, amenities: { include: { amenity: true } } },
    orderBy: [{ sortOrder: "asc" }, { basePrice: "asc" }],
  });
}

export async function getPublicRoomTypeBySlug(slug: string) {
  const hotel = await getHotel();
  return db.roomType.findFirst({
    where: { hotelId: hotel.id, slug, isActive: true, deletedAt: null },
    include: { images: { orderBy: { sortOrder: "asc" } }, amenities: { include: { amenity: true } } },
  });
}

export async function getPublicFacilities() {
  const hotel = await getHotel();
  return db.facility.findMany({ where: { hotelId: hotel.id, isActive: true }, orderBy: { sortOrder: "asc" } });
}

export async function getPublicGallery() {
  const hotel = await getHotel();
  return db.galleryImage.findMany({ where: { hotelId: hotel.id, isActive: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  phone: z.string().trim().max(40).optional().default(""),
  subject: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(10, "Please write a few more words").max(3000),
  /** Honeypot: real users never fill this. */
  website: z.string().max(0).optional(),
});

export async function submitContactMessage(raw: unknown, ip: string | null) {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    // A filled honeypot is silently accepted so bots learn nothing.
    if (typeof (raw as { website?: unknown })?.website === "string" && (raw as { website: string }).website.length > 0) return { id: "ignored" };
    throw parsed.error;
  }
  await enforceRateLimit(`contact:ip:${ip ?? "unknown"}`, 5, 60 * 60);
  const { website: _website, ...data } = parsed.data;
  void _website;
  const msg = await db.contactMessage.create({ data });
  return { id: msg.id };
}

// ---------------------------------------------------------------------------
// Admin content management
// ---------------------------------------------------------------------------

export const facilityInputSchema = z.object({
  slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Use lower-case letters, numbers and dashes"),
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  nameBn: z.string().trim().min(1).max(120),
  descriptionEn: z.string().trim().max(1000).default(""),
  descriptionAr: z.string().trim().max(1000).default(""),
  descriptionBn: z.string().trim().max(1000).default(""),
  icon: z.string().trim().max(40).default("sparkles"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.coerce.boolean().default(true),
});

export async function saveFacility(id: string | null, raw: unknown, userId: string) {
  const data = facilityInputSchema.parse(raw);
  const hotel = await getHotel();
  const row = id
    ? await db.facility.update({ where: { id }, data })
    : await db.facility.create({ data: { ...data, hotelId: hotel.id } });
  await audit({ userId, action: id ? "facility.updated" : "facility.created", entity: "Facility", entityId: row.id, after: row });
  return row;
}

export async function deleteFacility(id: string, userId: string) {
  await db.facility.delete({ where: { id } });
  await audit({ userId, action: "facility.deleted", entity: "Facility", entityId: id });
}

export const galleryInputSchema = z.object({
  category: z.enum(["HOTEL", "ROOMS", "LOBBY", "RESTAURANT", "FACILITIES", "EXTERIOR"]),
  url: z.string().trim().min(1).max(500),
  altEn: z.string().trim().max(200).default(""),
  altAr: z.string().trim().max(200).default(""),
  altBn: z.string().trim().max(200).default(""),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.coerce.boolean().default(true),
});

export async function saveGalleryImage(id: string | null, raw: unknown, userId: string) {
  const data = galleryInputSchema.parse(raw);
  data.url = await materializeImage(data.url, "gallery");
  const hotel = await getHotel();
  const row = id
    ? await db.galleryImage.update({ where: { id }, data })
    : await db.galleryImage.create({ data: { ...data, hotelId: hotel.id } });
  await audit({ userId, action: id ? "gallery.updated" : "gallery.created", entity: "GalleryImage", entityId: row.id, after: row });
  return row;
}

export async function deleteGalleryImage(id: string, userId: string) {
  const img = await db.galleryImage.delete({ where: { id } });
  await deletePublicImage(img.url);
  await audit({ userId, action: "gallery.deleted", entity: "GalleryImage", entityId: id });
}

export const hotelProfileSchema = z.object({
  nameEn: z.string().trim().min(1),
  nameAr: z.string().trim().min(1),
  nameBn: z.string().trim().min(1),
  taglineEn: z.string().trim().default(""),
  taglineAr: z.string().trim().default(""),
  taglineBn: z.string().trim().default(""),
  descriptionEn: z.string().trim().default(""),
  descriptionAr: z.string().trim().default(""),
  descriptionBn: z.string().trim().default(""),
  addressEn: z.string().trim().default(""),
  addressAr: z.string().trim().default(""),
  addressBn: z.string().trim().default(""),
  city: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  whatsapp: z.string().trim().default(""),
  email: z.string().trim().default(""),
  logoUrl: z.string().trim().default(""),
  heroImageUrl: z.string().trim().default(""),
  contactHoursEn: z.string().trim().default(""),
  contactHoursAr: z.string().trim().default(""),
  contactHoursBn: z.string().trim().default(""),
  mapEmbedUrl: z.string().trim().default(""),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  vatNumber: z.string().trim().default(""),
  commercialReg: z.string().trim().default(""),
  latitude: z.string().trim().optional().default(""),
  longitude: z.string().trim().optional().default(""),
});

export async function saveHotelProfile(raw: unknown, userId: string) {
  const parsed = hotelProfileSchema.parse(raw);
  const hotel = await getHotel();
  const { latitude, longitude, ...rest } = parsed;
  const lat = latitude === "" ? null : Number(latitude);
  const lng = longitude === "" ? null : Number(longitude);
  if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180))) {
    throw new AppError("INVALID_INPUT", "Latitude / longitude are not valid coordinates.");
  }
  const updated = await db.hotel.update({
    where: { id: hotel.id },
    data: {
      ...rest,
      logoUrl: await materializeOptionalImage(rest.logoUrl, "hotel"),
      heroImageUrl: await materializeOptionalImage(rest.heroImageUrl, "hotel"),
      latitude: lat,
      longitude: lng,
    },
  });
  await audit({ userId, action: "hotel.profile_updated", entity: "Hotel", entityId: hotel.id, before: hotel, after: updated });
  return updated;
}
