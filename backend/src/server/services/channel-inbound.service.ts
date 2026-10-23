import { db } from "@/server/db/client";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentSource, ReservationSource } from "@/generated/prisma/enums";
import type { ExternalReservation } from "@/integrations/channels/types";
import { AppError } from "@/lib/errors";
import { D, ZERO, round2, toDb } from "@/lib/money";
import { sha256, stableStringify } from "@/server/security/crypto";
import { cancelReservation, createReservation, modifyReservation, type ExternalPricing } from "./reservation.service";
import { ledgerCharges, recordPayment } from "./financial.service";
import { removeCommission, upsertCommission } from "./ota-finance.service";
import { audit } from "./audit.service";

/**
 * Inbound channel pipeline (webhook, polling and initial import all come through here).
 *
 *   verify (done by caller) -> idempotency record -> map room/rate -> create/modify/cancel the CENTRAL
 *   reservation -> payment/commission facts exactly as supplied -> mark event processed.
 *
 * The OTA never owns the reservation: ChannelReservation only stores the raw payload and link.
 */

export type InboundOutcome =
  | { outcome: "CREATED" | "MODIFIED" | "CANCELLED" | "UNCHANGED"; reservationId: string }
  | { outcome: "DUPLICATE"; reservationId?: string }
  | { outcome: "FAILED"; error: string };

const PAYMENT_SOURCE: Record<ReservationSource, PaymentSource> = {
  DIRECT_WEBSITE: "DIRECT_WEBSITE",
  BOOKING_COM: "BOOKING_COM",
  AGODA: "AGODA",
  TRIP_COM: "TRIP_COM",
  EXPEDIA: "EXPEDIA",
  PHONE: "OTHER",
  WALK_IN: "OTHER",
  OTHER: "OTHER",
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function deriveEventId(ext: ExternalReservation): string {
  if (ext.eventId) return ext.eventId;
  return `${ext.externalReservationId}:${ext.action}:${ext.version ?? sha256(stableStringify(ext.raw)).slice(0, 16)}`;
}

function buildPricing(ext: ExternalReservation, fallbackCurrency: string): { pricing: ExternalPricing; gross: string | null; pricingProvided: boolean } {
  const m = ext.money;
  const currency = m?.currency ?? fallbackCurrency;
  if (!m || (m.totalAmount == null && m.netRoomCharge == null)) {
    return { pricing: { currency, netRoomCharge: "0.00" }, gross: null, pricingProvided: false };
  }
  const tax = D(m.taxAmount ?? 0);
  const total = m.totalAmount != null ? D(m.totalAmount) : null;
  const net = m.netRoomCharge != null ? D(m.netRoomCharge) : total!.minus(tax);
  const pricing: ExternalPricing = {
    currency,
    netRoomCharge: toDb(net),
    taxLines: tax.greaterThan(0)
      ? [{ code: "OTA_TAX", name: "Tax (as reported by channel)", rate: "0", taxableAmount: toDb(net), amount: toDb(tax) }]
      : [],
  };
  return { pricing, gross: toDb(net.plus(tax)), pricingProvided: true };
}

async function resolveMappings(channelId: string, ext: ExternalReservation) {
  const room = await db.channelRoomMapping.findUnique({
    where: { channelId_externalRoomId: { channelId, externalRoomId: ext.externalRoomId } },
  });
  if (!room || !room.isActive) {
    throw new AppError("INVALID_INPUT", `No room mapping for external room "${ext.externalRoomId}". Map it in Channels > Mapping and retry.`);
  }
  let ratePlanId: string | null = null;
  if (ext.externalRatePlanId) {
    const rp = await db.channelRatePlanMapping.findUnique({
      where: { channelId_externalRatePlanId: { channelId, externalRatePlanId: ext.externalRatePlanId } },
    });
    ratePlanId = rp?.ratePlanId ?? null;
  }
  return { roomTypeId: room.roomTypeId, ratePlanId };
}

export async function processExternalReservation(
  channelId: string,
  ext: ExternalReservation,
  via: "WEBHOOK" | "POLL" | "IMPORT",
  opts: { signatureValid?: boolean } = {},
): Promise<InboundOutcome> {
  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { outcome: "FAILED", error: "Channel not found" };
  const eventId = deriveEventId(ext);

  // 1. Idempotency: one row per (channel, externalEventId).
  let eventRowId: string;
  try {
    const ev = await db.channelWebhookEvent.create({
      data: {
        channelId,
        externalEventId: eventId,
        eventType: `${via}:${ext.action}`,
        // Canonical form (with the provider's raw payload nested) so a failed event can be re-processed.
        payload: JSON.parse(JSON.stringify(ext)) as object,
        signatureValid: opts.signatureValid ?? via !== "WEBHOOK",
        status: "RECEIVED",
        attempts: 1,
      },
    });
    eventRowId = ev.id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.channelWebhookEvent.findUniqueOrThrow({
      where: { channelId_externalEventId: { channelId, externalEventId: eventId } },
    });
    if (existing.status === "PROCESSED" || existing.status === "REJECTED") {
      const known = await db.reservation.findFirst({
        where: { channelId, externalReservationId: ext.externalReservationId },
        select: { id: true },
      });
      return { outcome: "DUPLICATE", reservationId: known?.id };
    }
    await db.channelWebhookEvent.update({ where: { id: existing.id }, data: { attempts: { increment: 1 }, status: "RECEIVED", error: null } });
    eventRowId = existing.id;
  }

  try {
    const result = await applyExternalReservation(channel.id, channel.source, ext);
    await db.channelWebhookEvent.update({ where: { id: eventRowId }, data: { status: "PROCESSED", processedAt: new Date(), error: null } });
    await db.channelConnection.updateMany({
      where: { channelId },
      data: { lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date(), lastError: null },
    });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await db.channelWebhookEvent.update({ where: { id: eventRowId }, data: { status: "FAILED", error: message.slice(0, 1000) } });
    await db.channelReservation.upsert({
      where: { channelId_externalReservationId: { channelId, externalReservationId: ext.externalReservationId } },
      create: {
        channelId,
        externalReservationId: ext.externalReservationId,
        externalStatus: ext.action,
        payloadHash: sha256(stableStringify(ext.raw)),
        payload: ext.raw as object,
        importError: message.slice(0, 1000),
      },
      update: { importError: message.slice(0, 1000), externalStatus: ext.action },
    });
    await db.channelConnection.updateMany({ where: { channelId }, data: { lastSyncAt: new Date() } });
    return { outcome: "FAILED", error: message };
  }
}

async function applyExternalReservation(channelId: string, channelSource: ReservationSource, ext: ExternalReservation): Promise<InboundOutcome> {
  const source: ReservationSource =
    channelSource === "OTHER" && ext.originSource ? ext.originSource : channelSource;
  const payloadHash = sha256(stableStringify(ext.raw));

  const existing = await db.reservation.findFirst({
    where: { source, externalReservationId: ext.externalReservationId },
    include: { rooms: true },
  });

  const link = async (reservationId: string, status: string) => {
    await db.channelReservation.upsert({
      where: { channelId_externalReservationId: { channelId, externalReservationId: ext.externalReservationId } },
      create: { channelId, externalReservationId: ext.externalReservationId, reservationId, externalStatus: status, payloadHash, payload: ext.raw as object },
      update: { reservationId, externalStatus: status, payloadHash, payload: ext.raw as object, importError: null, version: { increment: 1 } },
    });
  };

  // ---- Cancellation -----------------------------------------------------
  if (ext.action === "CANCELLED") {
    if (!existing) {
      // Cancellation of something we never imported: record it, nothing to release.
      await db.channelReservation.upsert({
        where: { channelId_externalReservationId: { channelId, externalReservationId: ext.externalReservationId } },
        create: { channelId, externalReservationId: ext.externalReservationId, externalStatus: "CANCELLED", payloadHash, payload: ext.raw as object },
        update: { externalStatus: "CANCELLED", payloadHash, payload: ext.raw as object },
      });
      return { outcome: "UNCHANGED", reservationId: "" };
    }
    if (existing.status === "CANCELLED") return { outcome: "UNCHANGED", reservationId: existing.id };
    const fee = ext.money?.cancellationFee && D(ext.money.cancellationFee).greaterThan(0) ? toDb(ext.money.cancellationFee) : undefined;
    await cancelReservation({
      reservationId: existing.id,
      reason: "Cancelled by channel",
      cancellationFee: fee,
      auditSource: "CHANNEL",
      channelOriginated: true,
    });
    await db.$transaction(async (tx) => {
      await removeCommission(tx, existing.id, "channel cancellation");
      await tx.oTAPayout.deleteMany({ where: { reservationId: existing.id, status: "PENDING" } });
    });
    await link(existing.id, "CANCELLED");
    return { outcome: "CANCELLED", reservationId: existing.id };
  }

  // ---- New / modified --------------------------------------------------------
  const { roomTypeId, ratePlanId } = await resolveMappings(channelId, ext);
  const { pricing, gross, pricingProvided } = buildPricing(ext, "SAR");
  const guest = {
    firstName: ext.guest.firstName || "Guest",
    lastName: ext.guest.lastName || "(channel)",
    email: ext.guest.email || undefined,
    phone: ext.guest.phone || undefined,
    nationality: ext.guest.nationality || undefined,
  };
  const lines = [{ roomTypeId, ratePlanId, adults: Math.max(1, ext.adults), children: ext.children, quantity: Math.max(1, ext.rooms) }];

  if (existing) {
    if (["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(existing.status)) return { outcome: "UNCHANGED", reservationId: existing.id };
    const typeChanges: Record<string, string> = {};
    for (const r of existing.rooms) if (r.roomTypeId !== roomTypeId) typeChanges[r.id] = roomTypeId;
    await modifyReservation({
      reservationId: existing.id,
      checkIn: ext.checkIn,
      checkOut: ext.checkOut,
      roomTypeChanges: typeChanges,
      adults: lines[0].adults * lines[0].quantity,
      children: ext.children * lines[0].quantity,
      specialRequests: ext.specialRequests,
      external: pricingProvided ? pricing : undefined,
      allowOverbooking: true,
      auditSource: "CHANNEL",
    });
    await syncFinancialFacts(existing.id, channelId, source, ext, gross);
    await link(existing.id, "MODIFIED");
    return { outcome: "MODIFIED", reservationId: existing.id };
  }

  const collection = ext.payment?.collection ?? "UNKNOWN";
  const created = await createReservation({
    source,
    channelId,
    externalReservationId: ext.externalReservationId,
    guest,
    lines,
    checkIn: ext.checkIn,
    checkOut: ext.checkOut,
    paymentCollection: collection,
    specialRequests: ext.specialRequests ?? "",
    internalNotes: pricingProvided ? "" : "Pricing was not provided by the channel - review required.",
    external: pricing,
    allowOverbooking: true,
    allowPastDates: true,
    status: "CONFIRMED",
    auditSource: "CHANNEL",
  });
  await syncFinancialFacts(created.id, channelId, source, ext, gross);
  await link(created.id, "NEW");
  return { outcome: "CREATED", reservationId: created.id };
}

/**
 * Record payment / commission / expected payout exactly as the channel supplied them.
 * Missing information stays missing (reservation shows INFORMATION_NOT_PROVIDED); nothing is assumed paid.
 */
async function syncFinancialFacts(reservationId: string, channelId: string, source: ReservationSource, ext: ExternalReservation, gross: string | null) {
  await db.$transaction(async (tx) => {
    const res = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (ext.payment) {
      if (res.paymentCollection !== ext.payment.collection) {
        await tx.reservation.update({ where: { id: reservationId }, data: { paymentCollection: ext.payment.collection } });
      }
      const collected = ext.payment.collectedAmount ? D(ext.payment.collectedAmount) : ZERO;
      if (collected.greaterThan(0)) {
        const already = await tx.payment.aggregate({ where: { reservationId, status: "SUCCEEDED" }, _sum: { amount: true } });
        const delta = round2(collected.minus(D(already._sum.amount)));
        if (delta.greaterThan(0)) {
          await recordPayment(tx, {
            reservationId,
            amount: delta,
            source: PAYMENT_SOURCE[source],
            collectionMethod: ext.payment.collection,
            reference: `${source} ${ext.externalReservationId}`,
            note: "Reported by channel",
            confirmed: true,
          });
        }
      }
    }

    const m = ext.money;
    const grossAmount = gross ?? (await ledgerCharges(tx, reservationId)).total.toFixed(2);
    if (m && (m.commissionAmount != null || m.commissionRate != null) && (gross !== null || !D(grossAmount).isZero())) {
      const commission = await upsertCommission(tx, {
        reservationId,
        channelId,
        source,
        currency: res.currency,
        gross: grossAmount,
        commissionAmount: m.commissionAmount ?? null,
        rate: m.commissionRate ?? null,
      });
      // Expected payout: only for OTA-collected bookings and only when gross & commission were both supplied.
      if (commission && (ext.payment?.collection ?? res.paymentCollection) === "OTA_COLLECTED") {
        const pending = await tx.oTAPayout.findFirst({ where: { reservationId, channelId, status: "PENDING" } });
        const net = round2(D(commission.grossAmount).minus(D(commission.commissionAmount)));
        if (pending) {
          await tx.oTAPayout.update({
            where: { id: pending.id },
            data: { grossAmount: commission.grossAmount, commissionAmount: commission.commissionAmount, netAmount: toDb(net) },
          });
        } else {
          const anyPaid = await tx.oTAPayout.findFirst({ where: { reservationId, channelId, status: { not: "PENDING" } } });
          if (!anyPaid) {
            await tx.oTAPayout.create({
              data: {
                channelId,
                reservationId,
                grossAmount: commission.grossAmount,
                commissionAmount: commission.commissionAmount,
                netAmount: toDb(net),
                currency: res.currency,
                status: "PENDING",
                notes: "Expected payout derived from channel-supplied gross and commission. Not received.",
              },
            });
          }
        }
      }
    }
    await audit({ action: "channel.financial_facts_synced", entity: "Reservation", entityId: reservationId, after: { collection: ext.payment?.collection ?? null, commissionSupplied: !!(m?.commissionAmount || m?.commissionRate) }, source: "CHANNEL" }, tx);
  });
}

/** Re-process a previously failed inbound event (e.g. after the missing room mapping was added). */
export async function retryInboundEvent(eventId: string): Promise<InboundOutcome> {
  const ev = await db.channelWebhookEvent.findUnique({ where: { id: eventId } });
  if (!ev) throw new AppError("NOT_FOUND", "Event not found.");
  if (ev.status === "PROCESSED") return { outcome: "DUPLICATE" };
  const ext = ev.payload as unknown as ExternalReservation;
  if (!ext || typeof ext !== "object" || !("externalReservationId" in ext)) {
    throw new AppError("INVALID_STATE", "This event cannot be re-processed automatically.");
  }
  const via = ev.eventType.startsWith("POLL") ? "POLL" : ev.eventType.startsWith("IMPORT") ? "IMPORT" : "WEBHOOK";
  return processExternalReservation(ev.channelId, { ...ext, eventId: ev.externalEventId }, via, { signatureValid: ev.signatureValid });
}
