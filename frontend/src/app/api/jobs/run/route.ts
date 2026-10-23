import { NextResponse, type NextRequest } from "next/server";
import { runScheduler } from "@/server/services/channel-sync.service";
import { purgeExpiredHousekeepingPhotos } from "@/server/services/housekeeping-clean.service";
import { safeEqual } from "@/server/security/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Trigger for hosts without a long-running worker (cron / scheduler hits this URL).
 * Protected by JOBS_SECRET:  Authorization: Bearer <JOBS_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return NextResponse.json({ error: "jobs_not_configured" }, { status: 503 });
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runScheduler();
  const photos = await purgeExpiredHousekeepingPhotos();
  return NextResponse.json({ ...result, housekeepingPhotosPurged: photos.deleted });
}
