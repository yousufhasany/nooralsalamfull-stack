import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { can, getCurrentUser } from "@/server/auth/session";
import { readPrivateFile } from "@/server/storage/private-files";
import { canViewCleaningPhoto } from "@/server/services/housekeeping-clean.service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "housekeeping.view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const photo = await db.housekeepingPhoto.findUnique({ where: { id }, include: { task: true } });
  if (!photo || photo.storageKey.startsWith("pending/")) return new NextResponse("Not found", { status: 404 });
  if (!canViewCleaningPhoto({ userId: user.id, inspect: can(user, "housekeeping.inspect"), assignedToId: photo.task.assignedToId })) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const body = await readPrivateFile(photo.storageKey).catch(() => null);
  if (!body) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
