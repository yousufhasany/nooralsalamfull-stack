import type { RoleKey } from "@/generated/prisma/enums";

export const ALL_PERMISSIONS = [
  "dashboard.view",
  "reservations.view",
  "reservations.create",
  "reservations.edit",
  "reservations.cancel",
  "reservations.delete",
  "reservations.checkin",
  "reservations.checkout",
  "guests.view",
  "guests.edit",
  "guests.view_id",
  "guests.delete",
  "rooms.view",
  "rooms.manage",
  "roomtypes.view",
  "roomtypes.manage",
  "rates.view",
  "rates.manage",
  "promotions.manage",
  "housekeeping.view",
  "housekeeping.update",
  "housekeeping.inspect",
  "inventory.view",
  "inventory.manage",
  "inventory.receive",
  "inventory.issue",
  "inventory.transfer",
  "inventory.approve",
  "inventory.adjust",
  "payments.record",
  "payments.refund",
  "invoices.view",
  "finance.view",
  "finance.manage",
  "reconciliation.view",
  "reconciliation.manage",
  "channels.view",
  "channels.manage",
  "reports.view",
  "settings.view",
  "settings.manage",
  "content.view",
  "content.manage",
  "users.view",
  "users.manage",
  "audit.view",
  "audit.delete",
  "messages.view",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

function allow(...permissions: Permission[]): readonly Permission[] {
  return permissions;
}

/**
 * Each role sees and does only its own work.
 * Super Admin keeps the whole system, including users, settings, website content, and deletes.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  HOTEL_MANAGER: allow(
    "dashboard.view",
    "reservations.view",
    "reservations.create",
    "reservations.edit",
    "reservations.cancel",
    "reservations.checkin",
    "reservations.checkout",
    "guests.view",
    "guests.edit",
    "guests.view_id",
    "rooms.view",
    "rooms.manage",
    "roomtypes.view",
    "rates.view",
    "rates.manage",
    "promotions.manage",
    "housekeeping.view",
    "housekeeping.inspect",
    "inventory.view",
    "inventory.manage",
    "inventory.receive",
    "inventory.transfer",
    "inventory.approve",
    "payments.record",
    "invoices.view",
    "finance.view",
    "reconciliation.view",
    "channels.view",
    "reports.view",
    "messages.view",
    "audit.view",
  ),
  RECEPTIONIST: allow(
    "dashboard.view",
    "reservations.view",
    "reservations.create",
    "reservations.edit",
    "reservations.cancel",
    "reservations.checkin",
    "reservations.checkout",
    "guests.view",
    "guests.edit",
    "guests.view_id",
    "rooms.view",
    "payments.record",
    "invoices.view",
    "messages.view",
  ),
  RESERVATION_MANAGER: allow(
    "dashboard.view",
    "reservations.view",
    "reservations.create",
    "reservations.edit",
    "reservations.cancel",
    "guests.view",
    "guests.edit",
    "guests.view_id",
    "rooms.view",
    "roomtypes.view",
    "rates.view",
    "rates.manage",
    "promotions.manage",
    "invoices.view",
    "payments.record",
    "channels.view",
    "channels.manage",
    "reports.view",
    "messages.view",
  ),
  HOUSEKEEPING: allow(
    "rooms.view",
    "housekeeping.view",
    "housekeeping.update",
    "inventory.view",
    "inventory.issue",
  ),
  ACCOUNTANT: allow(
    "dashboard.view",
    "reservations.view",
    "guests.view",
    "invoices.view",
    "payments.record",
    "payments.refund",
    "finance.view",
    "finance.manage",
    "reconciliation.view",
    "reconciliation.manage",
    "reports.view",
  ),
};

export const ROLE_LABELS: Record<RoleKey, { en: string; ar: string; bn: string }> = {
  SUPER_ADMIN: { en: "Super Admin", ar: "مدير النظام", bn: "সুপার অ্যাডমিন" },
  HOTEL_MANAGER: { en: "Hotel Manager", ar: "مدير الفندق", bn: "হোটেল ম্যানেজার" },
  RECEPTIONIST: { en: "Receptionist", ar: "موظف الاستقبال", bn: "রিসেপশনিস্ট" },
  RESERVATION_MANAGER: { en: "Reservation Manager", ar: "مدير الحجوزات", bn: "রিজার্ভেশন ম্যানেজার" },
  HOUSEKEEPING: { en: "Housekeeping", ar: "التدبير المنزلي", bn: "হাউসকিপিং" },
  ACCOUNTANT: { en: "Accountant", ar: "المحاسب", bn: "হিসাবরক্ষক" },
};

export function roleHasPermission(role: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** First staff page this role may open. Login and /admin must not send housekeeping to the dashboard. */
export function adminHomePath(role: RoleKey): string {
  const permissions = ROLE_PERMISSIONS[role];
  if (permissions.includes("dashboard.view")) return "/admin";
  if (permissions.includes("housekeeping.view")) return "/admin/housekeeping";
  if (permissions.includes("finance.view")) return "/admin/finance";
  if (permissions.includes("reservations.view")) return "/admin/reservations";
  if (permissions.includes("rooms.view")) return "/admin/rooms";
  return "/admin/forbidden";
}
