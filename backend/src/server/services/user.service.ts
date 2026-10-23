import { z } from "zod";
import { db } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { hashPassword, validatePasswordStrength } from "@/server/auth/auth.service";
import { audit } from "./audit.service";

export const userSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["SUPER_ADMIN", "HOTEL_MANAGER", "RECEPTIONIST", "RESERVATION_MANAGER", "HOUSEKEEPING", "ACCOUNTANT"]),
  password: z.string().optional(),
  isActive: z.coerce.boolean().default(true),
});

export async function saveUser(id: string | null, raw: unknown, actorId: string) {
  const d = userSchema.parse(raw);
  const role = await db.role.findUniqueOrThrow({ where: { key: d.role } });
  if (!id) {
    if (!d.password) throw new AppError("INVALID_INPUT", "A password is required for new users.");
    const weak = validatePasswordStrength(d.password);
    if (weak) throw new AppError("INVALID_INPUT", weak);
    const dup = await db.user.findUnique({ where: { email: d.email } });
    if (dup) throw new AppError("CONFLICT", "A user with this email already exists.");
    const u = await db.user.create({ data: { email: d.email, name: d.name, roleId: role.id, isActive: d.isActive, passwordHash: await hashPassword(d.password) } });
    await audit({ userId: actorId, action: "user.created", entity: "User", entityId: u.id, after: { email: u.email, role: d.role } });
    return u;
  }
  const before = await db.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
  if (id === actorId && (!d.isActive || before.role.key !== d.role)) {
    throw new AppError("INVALID_STATE", "You cannot deactivate or change the role of your own account.");
  }
  const data: Record<string, unknown> = { name: d.name, roleId: role.id, isActive: d.isActive };
  if (before.email !== d.email) data.email = d.email;
  if (d.password) {
    const weak = validatePasswordStrength(d.password);
    if (weak) throw new AppError("INVALID_INPUT", weak);
    data.passwordHash = await hashPassword(d.password);
  }
  // Role or password change, or deactivation, invalidates existing sessions.
  if (d.password || before.role.key !== d.role || !d.isActive) data.tokenVersion = { increment: 1 };
  const u = await db.user.update({ where: { id }, data });
  await audit({ userId: actorId, action: "user.updated", entity: "User", entityId: id, before: { role: before.role.key, isActive: before.isActive }, after: { role: d.role, isActive: d.isActive, passwordChanged: !!d.password } });
  return u;
}
