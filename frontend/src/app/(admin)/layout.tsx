import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Arabic, Noto_Sans_Bengali } from "next/font/google";
import "@/app/globals.css";

const body = Inter({ subsets: ["latin"], variable: "--nf-body", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--nf-arabic", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--nf-bengali", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Staff — Noor Al Salam Hotel", template: "%s — Noor Al Salam PMS" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a2a21", width: "device-width", initialScale: 1 };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${arabic.variable} ${bengali.variable}`}>
      <body className="min-h-screen bg-sand-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}
