import type { Permission } from "@/server/auth/permissions";

export interface NavItem {
  href: string;
  key: keyof import("@/i18n/admin").AdminMessages;
  permission: Permission;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", key: "dashboard", permission: "dashboard.view" },
  { href: "/admin/reservations", key: "reservations", permission: "reservations.view" },
  { href: "/admin/guests", key: "guests", permission: "guests.view" },
  { href: "/admin/rooms", key: "rooms", permission: "rooms.view" },
  { href: "/admin/rooms/types", key: "roomTypes", permission: "roomtypes.view" },
  { href: "/admin/rates", key: "rates", permission: "rates.view" },
  { href: "/admin/housekeeping", key: "housekeeping", permission: "housekeeping.view" },
  { href: "/admin/housekeeping/inspections", key: "inspections", permission: "housekeeping.inspect" },
  { href: "/admin/inventory", key: "inventory", permission: "inventory.view" },
  { href: "/admin/finance", key: "finance", permission: "finance.view" },
  { href: "/admin/finance/reconciliation", key: "reconciliation", permission: "reconciliation.view" },
  { href: "/admin/channels", key: "channels", permission: "channels.view" },
  { href: "/admin/channels/mapping", key: "mapping", permission: "channels.view" },
  { href: "/admin/channels/sync-log", key: "syncLog", permission: "channels.view" },
  { href: "/admin/reports", key: "reports", permission: "reports.view" },
  { href: "/admin/content", key: "content", permission: "content.view" },
  { href: "/admin/messages", key: "messages", permission: "messages.view" },
  { href: "/admin/history", key: "history", permission: "audit.view" },
  { href: "/admin/users", key: "users", permission: "users.view" },
  { href: "/admin/settings", key: "settings", permission: "settings.view" },
];
