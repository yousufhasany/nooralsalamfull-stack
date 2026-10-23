import bcrypt from "bcryptjs";
import { db } from "@/server/db/client";
import type { RoleKey } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { audit } from "@/server/services/audit.service";

const BCRYPT_COST = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain upper-case, lower-case letters and a number.";
  }
  return null;
}

// Compared against when the account does not exist so timing does not reveal account existence.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password", BCRYPT_COST));

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  tokenVersion: number;
}

export async function authenticate(email: string, password: string, ip: string | null): Promise<AuthenticatedUser> {
  const normalized = email.trim().toLowerCase();
  await enforceRateLimit(`login:ip:${ip ?? "unknown"}`, 30, 15 * 60);
  await enforceRateLimit(`login:email:${normalized}`, 10, 15 * 60);

  const user = await db.user.findFirst({ where: { email: normalized, deletedAt: null }, include: { role: true } });
  const generic = new AppError("UNAUTHORIZED", "Invalid email or password.");

  if (!user || !user.isActive) {
    await bcrypt.compare(password, await getDummyHash());
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("UNAUTHORIZED", "Account temporarily locked after repeated failed attempts. Try again later.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed },
    });
    await audit({ userId: user.id, action: "auth.login_failed", entity: "User", entityId: user.id, source: "ADMIN", ip });
    throw generic;
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id, source: "ADMIN", ip });
  return { id: user.id, email: user.email, name: user.name, role: user.role.key, tokenVersion: user.tokenVersion };
}

export async function changePassword(userId: string, newPassword: string, actorId: string | null) {
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new AppError("INVALID_INPUT", weak);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  await audit({ userId: actorId, action: "user.password_changed", entity: "User", entityId: userId });
}
