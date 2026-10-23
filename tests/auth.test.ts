import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { authenticate, hashPassword, validatePasswordStrength } from "@/server/auth/auth.service";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, adminHomePath, roleHasPermission } from "@/server/auth/permissions";
import { encryptSecret, decryptSecret } from "@/server/security/crypto";
import { createWorld } from "./helpers";

describe("authentication", () => {
  beforeAll(async () => {
    await createWorld({ rooms: 1 });
    const role = await db.role.findUniqueOrThrow({ where: { key: "RECEPTIONIST" } });
    await db.user.create({ data: { email: "desk@example.test", name: "Demo Desk", passwordHash: await hashPassword("Correct-Horse-9"), roleId: role.id, isDemo: true } });
  });

  it("accepts the right password and returns the role", async () => {
    const u = await authenticate("DESK@example.test", "Correct-Horse-9", "10.0.0.1");
    expect(u.role).toBe("RECEPTIONIST");
  });

  it("gives the same generic error for unknown user and wrong password", async () => {
    const a = await authenticate("nobody@example.test", "whatever", "10.0.0.2").catch((e) => e.message);
    const b = await authenticate("desk@example.test", "wrong-password", "10.0.0.3").catch((e) => e.message);
    expect(a).toBe("Invalid email or password.");
    expect(b).toBe("Invalid email or password.");
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    for (let i = 0; i < 5; i++) await authenticate("desk@example.test", "bad", `10.1.0.${i}`).catch(() => undefined);
    await expect(authenticate("desk@example.test", "Correct-Horse-9", "10.1.1.1")).rejects.toThrow(/locked/i);
  });

  it("enforces password strength", () => {
    expect(validatePasswordStrength("short")).toBeTruthy();
    expect(validatePasswordStrength("alllowercase1234")).toBeTruthy();
    expect(validatePasswordStrength("Str0ng-enough-pass")).toBeNull();
  });
});

describe("RBAC matrix", () => {
  it("gives each role the menu and actions for that job", () => {
    for (const p of ALL_PERMISSIONS) expect(roleHasPermission("SUPER_ADMIN", p)).toBe(true);

    expect(roleHasPermission("RECEPTIONIST", "reservations.checkin")).toBe(true);
    expect(roleHasPermission("RECEPTIONIST", "reservations.checkout")).toBe(true);
    expect(roleHasPermission("RECEPTIONIST", "payments.record")).toBe(true);
    expect(roleHasPermission("RECEPTIONIST", "finance.view")).toBe(false);
    expect(roleHasPermission("RECEPTIONIST", "users.view")).toBe(false);
    expect(roleHasPermission("RECEPTIONIST", "housekeeping.view")).toBe(false);
    expect(roleHasPermission("RECEPTIONIST", "settings.view")).toBe(false);
    expect(roleHasPermission("RECEPTIONIST", "reservations.delete")).toBe(false);

    expect(roleHasPermission("RESERVATION_MANAGER", "channels.manage")).toBe(true);
    expect(roleHasPermission("RESERVATION_MANAGER", "rates.manage")).toBe(true);
    expect(roleHasPermission("RESERVATION_MANAGER", "reservations.checkin")).toBe(false);
    expect(roleHasPermission("RESERVATION_MANAGER", "finance.view")).toBe(false);
    expect(roleHasPermission("RESERVATION_MANAGER", "users.view")).toBe(false);

    expect(roleHasPermission("HOUSEKEEPING", "housekeeping.update")).toBe(true);
    expect(roleHasPermission("HOUSEKEEPING", "housekeeping.inspect")).toBe(false);
    expect(roleHasPermission("HOUSEKEEPING", "inventory.issue")).toBe(true);
    expect(roleHasPermission("HOUSEKEEPING", "dashboard.view")).toBe(false);
    expect(roleHasPermission("HOUSEKEEPING", "reservations.view")).toBe(false);

    expect(roleHasPermission("ACCOUNTANT", "finance.manage")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "reconciliation.manage")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "payments.refund")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "rooms.view")).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", "users.view")).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", "reservations.edit")).toBe(false);

    expect(roleHasPermission("HOTEL_MANAGER", "housekeeping.inspect")).toBe(true);
    expect(roleHasPermission("HOTEL_MANAGER", "inventory.approve")).toBe(true);
    expect(roleHasPermission("HOTEL_MANAGER", "audit.view")).toBe(true);
    expect(roleHasPermission("HOTEL_MANAGER", "audit.delete")).toBe(false);
    expect(roleHasPermission("RECEPTIONIST", "audit.delete")).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", "audit.delete")).toBe(false);
    expect(ROLE_PERMISSIONS.HOTEL_MANAGER).not.toContain("users.manage");
    expect(roleHasPermission("HOTEL_MANAGER", "users.view")).toBe(false);
    expect(roleHasPermission("HOTEL_MANAGER", "settings.view")).toBe(false);
    expect(roleHasPermission("HOTEL_MANAGER", "content.view")).toBe(false);
    expect(roleHasPermission("HOTEL_MANAGER", "reservations.delete")).toBe(false);

    expect(adminHomePath("HOUSEKEEPING")).toBe("/admin/housekeeping");
    expect(adminHomePath("RECEPTIONIST")).toBe("/admin");
    expect(adminHomePath("ACCOUNTANT")).toBe("/admin");

    const views = (role: keyof typeof ROLE_PERMISSIONS) => ROLE_PERMISSIONS[role].filter((p) => p.endsWith(".view")).join(",");
    expect(views("RECEPTIONIST")).not.toBe(views("SUPER_ADMIN"));
    expect(views("HOUSEKEEPING")).not.toBe(views("RECEPTIONIST"));
    expect(views("ACCOUNTANT")).not.toBe(views("HOTEL_MANAGER"));
    expect(views("RESERVATION_MANAGER")).not.toBe(views("RECEPTIONIST"));

    for (const p of ALL_PERMISSIONS) expect(Object.values(ROLE_PERMISSIONS).some((l) => l.includes(p))).toBe(true);
  });
});

describe("secret vault", () => {
  it("round-trips and detects tampering", () => {
    const enc = encryptSecret("1234567890");
    expect(enc).not.toContain("1234567890");
    expect(decryptSecret(enc)).toBe("1234567890");
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
