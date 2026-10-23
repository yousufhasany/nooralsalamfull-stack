import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { can, getCurrentUser } from "@/server/auth/session";
import { detectImage, readPrivateFile } from "@/server/storage/private-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "inventory.view")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const item = await db.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!item?.imageKey) return new NextResponse("Not found", { status: 404 });
  const body = await readPrivateFile(item.imageKey).catch(() => null);
  if (!body) return new NextResponse("Not found", { status: 404 });
  const kind = detectImage(body);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": kind?.mime ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
