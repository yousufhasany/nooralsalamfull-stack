import { NextResponse } from "next/server";
import { db } from "@/server/db/client";

const FOLDERS = new Set(["rooms", "gallery", "hotel"]);

/** Serve a photograph stored for the public site. */
export async function GET(_request: Request, context: { params: Promise<{ folder: string; name: string }> }) {
  const { folder, name } = await context.params;
  if (!FOLDERS.has(folder) || !/^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i.test(name)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const image = await db.storedImage.findUnique({ where: { path: `${folder}/${name}` } });
  if (!image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
