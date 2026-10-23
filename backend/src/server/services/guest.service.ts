import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { decryptSecret, encryptSecret } from "@/server/security/crypto";
import { audit } from "./audit.service";

/** E.164-ish validation that accepts Saudi (+966 5x...) and international numbers. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ""))
  .refine((v) => /^\+?[0-9]{7,15}$/.test(v), "Enter a valid phone number, e.g. +966 5X XXX XXXX");

export const guestInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200).optional().or(z.literal("")),
  phone: phoneSchema.optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  idType: z.string().trim().max(40).optional().or(z.literal("")),
  idNumber: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  preferredLocale: z.enum(["en", "ar", "bn"]).optional(),
});
export type GuestInput = z.infer<typeof guestInputSchema>;

/** Normalise a phone number for comparisons (digits only, Saudi local 05x -> 9665x). */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  let p = phone.replace(/[^\d]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("05") && p.length === 10) p = `966${p.slice(1)}`;
  return p;
}

export async function findOrCreateGuest(input: GuestInput, client: DbOrTx = db, opts: { isDemo?: boolean } = {}) {
  const data = guestInputSchema.parse(input);
  const email = data.email || null;
  const phone = data.phone || null;

  let existing = null;
  if (email) {
    existing = await client.guest.findFirst({
      where: {
        deletedAt: null,
        email: { equals: email, mode: "insensitive" },
        firstName: { equals: data.firstName, mode: "insensitive" },
        lastName: { equals: data.lastName, mode: "insensitive" },
      },
    });
  }
  if (!existing && phone) {
    existing = await client.guest.findFirst({
      where: {
        deletedAt: null,
        phone,
        firstName: { equals: data.firstName, mode: "insensitive" },
        lastName: { equals: data.lastName, mode: "insensitive" },
      },
    });
  }

  const idFields = data.idNumber
    ? { idType: data.idType || null, idNumberEnc: encryptSecret(data.idNumber), idLast4: data.idNumber.slice(-4) }
    : {};

  if (existing) {
    return client.guest.update({
      where: { id: existing.id },
      data: {
        phone: phone ?? existing.phone,
        email: email ?? existing.email,
        nationality: data.nationality || existing.nationality,
        address: data.address || existing.address,
        ...idFields,
      },
    });
  }
  return client.guest.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      phone,
      nationality: data.nationality || null,
      address: data.address || null,
      preferredLocale: data.preferredLocale ?? "en",
      isDemo: opts.isDemo ?? false,
      ...idFields,
    },
  });
}

/** Decrypt a guest's ID number. Callers must be authorised and should audit the access. */
export async function revealGuestId(guestId: string): Promise<string | null> {
  const g = await db.guest.findUnique({ where: { id: guestId }, select: { idNumberEnc: true } });
  if (!g) throw new AppError("NOT_FOUND", "Guest not found.");
  return g.idNumberEnc ? decryptSecret(g.idNumberEnc) : null;
}

/** Hide a guest from the directory. Reservations that already name this guest stay in place. */
export async function deleteGuest(id: string, actorId?: string | null) {
  const guest = await db.guest.findFirst({ where: { id, deletedAt: null } });
  if (!guest) throw new AppError("NOT_FOUND", "Guest not found.");
  await db.guest.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: actorId,
    action: "guest.deleted",
    entity: "Guest",
    entityId: id,
    before: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email, phone: guest.phone },
    after: { deletedAt: new Date().toISOString() },
  });
}

export async function updateGuest(id: string, input: Partial<GuestInput> & { notes?: string }, client: DbOrTx = db) {
  const { idNumber, notes, ...rest } = input;
  const parsed = guestInputSchema.partial().parse(rest);
  return client.guest.update({
    where: { id },
    data: {
      ...(parsed.firstName !== undefined ? { firstName: parsed.firstName } : {}),
      ...(parsed.lastName !== undefined ? { lastName: parsed.lastName } : {}),
      ...(parsed.email !== undefined ? { email: parsed.email || null } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone || null } : {}),
      ...(parsed.nationality !== undefined ? { nationality: parsed.nationality || null } : {}),
      ...(parsed.address !== undefined ? { address: parsed.address || null } : {}),
      ...(parsed.idType !== undefined ? { idType: parsed.idType || null } : {}),
      ...(idNumber ? { idNumberEnc: encryptSecret(idNumber), idLast4: idNumber.slice(-4) } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
}
