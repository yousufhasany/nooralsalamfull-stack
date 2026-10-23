import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/server/db/client";
import type { RoleKey } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { ROLE_PERMISSIONS, type Permission } from "./permissions";
import type { AuthenticatedUser } from "./auth.service";

const COOKIE = "nas_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set to at least 32 characters");
    return new TextEncoder().encode("development-only-secret-do-not-use-in-production!!");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: AuthenticatedUser) {
  const token = await new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  locale: string;
  permissions: readonly Permission[];
}

/** Resolve the logged-in user for this request (verified against the database on every request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.user.findFirst({ where: { id: payload.sub, deletedAt: null, isActive: true }, include: { role: true } });
    if (!user || user.tokenVersion !== payload.tv) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.key,
      locale: user.locale,
      permissions: ROLE_PERMISSIONS[user.role.key],
    };
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export function can(user: SessionUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/** For pages: redirects unauthenticated users, 403-redirects unauthorised ones. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/admin/forbidden");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActionPermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Please sign in again.");
  if (!can(user, permission)) throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  return user;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
