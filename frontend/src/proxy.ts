import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

/**
 * Locale routing for the public site.
 *   /rooms      -> English (served internally from /en/rooms)
 *   /ar/rooms   -> Arabic
 *   /bn/rooms   -> Bangla
 * `/en/...` is redirected to the canonical un-prefixed URL so each page has exactly one URL per language.
 * Admin, API and static files are not touched.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(`/${DEFAULT_LOCALE}`.length) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!admin|api|_next|_vercel|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\..*).*)",
  ],
};
