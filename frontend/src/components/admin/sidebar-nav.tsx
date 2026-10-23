"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/components/admin/nav";
import type { AdminMessages } from "@/i18n/admin";
import type { Permission } from "@/server/auth/permissions";
import { cn } from "@/lib/utils";

export function SidebarNav({ t, permissions }: { t: AdminMessages; permissions: readonly Permission[] }) {
  const pathname = usePathname();
  const items = ADMIN_NAV.filter((i) => permissions.includes(i.permission));
  const activeHref = items
    .filter((item) => (item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-1 lg:flex-col lg:overflow-visible lg:p-3" aria-label="Admin">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            {t[item.key]}
          </Link>
        );
      })}
    </nav>
  );
}
