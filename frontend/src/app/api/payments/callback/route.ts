import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { getActivePaymentProvider } from "@/integrations/payments/registry";
import { applyVerifiedPayment } from "@/server/services/payment.service";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

/**
 * Payment provider callback. Returns 501 until a provider adapter is registered and configured.
 * The adapter verifies the provider's signature; the payment is then re-fetched from the provider
 * API, and only that verified record can mark a reservation as paid.
 */
export async function POST(request: NextRequest) {
  const provider = getActivePaymentProvider();
  if (!provider) return NextResponse.json({ error: "payments_not_configured" }, { status: 501 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await enforceRateLimit(`payment-callback:ip:${ip}`, 300, 60);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    throw e;
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  try {
    const parsed = await provider.parseCallback(rawBody, request.headers);
    if (!parsed.verified || !parsed.payment) return NextResponse.json({ error: "unverified" }, { status: 401 });

    const verified = await provider.verifyPayment(parsed.payment.providerReference);
    const number = verified.reservationNumber ?? parsed.payment.reservationNumber;
    if (!number) return NextResponse.json({ error: "no_reservation_reference" }, { status: 422 });
    const reservation = await db.reservation.findUnique({ where: { number }, select: { id: true } });
    if (!reservation) return NextResponse.json({ error: "unknown_reservation" }, { status: 404 });

    const result = await applyVerifiedPayment(reservation.id, verified);
    return NextResponse.json({ received: true, applied: result.applied });
  } catch (e) {
    console.error("[payment-callback]", e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
