import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { getChannelProvider } from "@/integrations/channels/registry";
import { buildChannelContext } from "@/server/services/channel.service";
import { processExternalReservation } from "@/server/services/channel-inbound.service";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Inbound channel webhook. Authenticity is decided by the PROVIDER ADAPTER (signature / secret as
 * defined by that provider's documentation). Unverified requests are rejected and never processed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelParam } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    await enforceRateLimit(`webhook:ip:${ip}`, 600, 60);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    throw e;
  }

  const code = channelParam.toUpperCase().replace(/-/g, "_");
  const channel = await db.channel.findUnique({ where: { code }, include: { connection: true } });
  if (!channel || !channel.isEnabled) return NextResponse.json({ error: "unknown_channel" }, { status: 404 });
  if (channel.connection?.status !== "CONNECTED") {
    return NextResponse.json({ error: "channel_not_connected" }, { status: 409 });
  }

  const provider = getChannelProvider(channel.providerKey);
  if (!provider.isImplemented || !provider.parseWebhook) {
    return NextResponse.json({ error: "webhooks_not_supported" }, { status: 501 });
  }

  const lengthHeader = Number(request.headers.get("content-length") ?? 0);
  if (lengthHeader > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const ctx = await buildChannelContext(channel.id);
  let parsed;
  try {
    parsed = await provider.parseWebhook(ctx, rawBody, request.headers);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!parsed.verified) {
    await db.channelWebhookEvent
      .create({
        data: {
          channelId: channel.id,
          externalEventId: `rejected:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
          eventType: "WEBHOOK:REJECTED",
          payload: { bytes: rawBody.length },
          signatureValid: false,
          status: "REJECTED",
          error: parsed.reason ?? "Signature verification failed",
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { id: string; outcome: string; error?: string }[] = [];
  for (const ext of parsed.reservations) {
    const r = await processExternalReservation(channel.id, ext, "WEBHOOK", { signatureValid: true });
    results.push({ id: ext.externalReservationId, outcome: r.outcome, error: r.outcome === "FAILED" ? r.error : undefined });
    if (r.outcome !== "FAILED" && provider.acknowledgeReservation) {
      await provider.acknowledgeReservation(ctx, ext.externalReservationId).catch(() => undefined);
    }
  }
  const failed = results.filter((r) => r.outcome === "FAILED").length;
  // 202: received and stored; failed events stay visible in the admin console for retry.
  return NextResponse.json({ received: results.length, failed }, { status: failed ? 202 : 200 });
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
