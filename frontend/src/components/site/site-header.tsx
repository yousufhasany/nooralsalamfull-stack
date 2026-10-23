"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe, Menu, X } from "lucide-react";
import { LOCALES, LOCALE_META, localePath, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function stripLocale(pathname: string): string {
  const parts = pathname.split("/");
  if ((LOCALES as readonly string[]).includes(parts[1])) {
    const rest = parts.slice(2).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname || "/";
}

export function SiteHeader({ locale, t, hotelName }: { locale: Locale; t: Messages; hotelName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const base = stripLocale(pathname);
  const home = base === "/";

  useEffect(() => {
    if (!home) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [home]);

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setLangOpen(false);
  }

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/rooms", label: t.nav.rooms },
    { href: "/facilities", label: t.nav.facilities },
    { href: "/about", label: t.nav.about },
    { href: "/gallery", label: t.nav.gallery },
    { href: "/contact", label: t.nav.contact },
  ];

  const isActive = (href: string) => (href === "/" ? base === "/" : base.startsWith(href));

  return (
    <header
      className={cn(
        "no-print sticky top-0 z-40 text-white transition-colors duration-300",
        home && !scrolled && !open ? "border-b border-transparent bg-transparent" : "border-b border-white/10 bg-brand-950/95 backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={localePath(locale, "/")} className="flex items-center gap-2.5" aria-label={hotelName}>
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full border border-gold-500/70 text-gold-400">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l2.4 5.2L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-.8L12 3z" />
            </svg>
          </span>
          <span className="font-display text-lg font-semibold leading-none tracking-wide">{hotelName}</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={localePath(locale, l.href)}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn("rounded-md px-3 py-2 text-sm text-white/80 transition-colors hover:text-white", isActive(l.href) && "text-gold-400")}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              aria-label={t.common.language}
              className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-white/90 hover:bg-white/10"
            >
              <Globe size={16} aria-hidden />
              <span>{LOCALE_META[locale].nativeLabel}</span>
            </button>
            {langOpen ? (
              <ul role="listbox" aria-label={t.common.language} className="absolute end-0 mt-2 w-40 overflow-hidden rounded-lg border border-sand-200 bg-white py-1 text-ink-900 shadow-lift">
                {LOCALES.map((l) => (
                  <li key={l} role="option" aria-selected={l === locale}>
                    <Link
                      href={localePath(l, base)}
                      hrefLang={l}
                      lang={l}
                      className={cn("block px-4 py-2 text-sm hover:bg-sand-100", l === locale && "font-semibold text-brand-800")}
                    >
                      {LOCALE_META[l].nativeLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <Link href={localePath(locale, "/manage-booking")} className="hidden px-3 text-sm text-white/80 hover:text-white xl:block">
            {t.nav.manageBooking}
          </Link>
          <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "gold", size: "sm" }), "hidden sm:inline-flex")}>
            {t.nav.bookNow}
          </Link>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t.common.menu}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-white/10 bg-brand-950 px-4 pb-5 pt-2 lg:hidden">
          <ul className="space-y-1">
            {[...links, { href: "/manage-booking", label: t.nav.manageBooking }].map((l) => (
              <li key={l.href}>
                <Link href={localePath(locale, l.href)} className={cn("block rounded-lg px-3 py-3 text-base text-white/90 hover:bg-white/10", isActive(l.href) && "text-gold-400")}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={localePath(locale, "/rooms")} className={cn(buttonVariants({ variant: "gold", size: "lg" }), "mt-4 w-full")}>
            {t.nav.bookNow}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
