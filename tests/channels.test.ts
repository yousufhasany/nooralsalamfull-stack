import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { mockRemote } from "@/integrations/channels/providers/mock";
import type { ExternalReservation } from "@/integrations/channels/types";
import { connectChannel, saveChannelConfiguration, testChannelConnection, upsertRoomMapping } from "@/server/services/channel.service";
import { processExternalReservation } from "@/server/services/channel-inbound.service";
import { runDueJobs, runJob } from "@/server/services/channel-sync.service";
import { createReservation } from "@/server/services/reservation.service";
import { getAvailability } from "@/server/services/availability.service";
import { addDays } from "@/lib/dates";
import { createWorld, stay, testGuest, type World } from "./helpers";

let world: World;
let mockId: string;

async function setup(rooms = 5) {
  world = await createWorld({ rooms, mock: true });
  mockId = world.channels.MOCK;
  mockRemote.reset();
  await saveChannelConfiguration({ channelId: mockId, rotateWebhookSecret: true });
  const res = await connectChannel(mockId);
  expect(res.ok).toBe(true);
  await upsertRoomMapping({ channelId: mockId, roomTypeId: world.roomType.id, externalRoomId: "EXT-DELUXE" });
}

function ext(id: string, over: Partial<ExternalReservation> = {}): ExternalReservation {
  const s = stay(30, 2);
  return {
    externalReservationId: id,
    action: "NEW",
    originSource: "BOOKING_COM",
    version: "1",
    externalRoomId: "EXT-DELUXE",
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: 2,
    children: 0,
    rooms: 1,
    guest: { firstName: "Demo", lastName: `Ota ${id}`, email: `${id.toLowerCase()}@example.test` },
    money: { currency: "SAR", totalAmount: "690.00", taxAmount: "90.00" },
    raw: { id, v: 1 },
    ...over,
  };
}

const avail = async (offset = 30) => (await getAvailability({ roomTypeIds: [world.roomType.id], ...stay(offset, 2) }))[0].available;

describe("connection honesty", () => {
  beforeEach(async () => {
    world = await createWorld({ rooms: 2, mock: true });
  });

  it("an unimplemented real OTA connector can never become CONNECTED", async () => {
    const booking = world.channels.BOOKING_COM;
    await saveChannelConfiguration({ channelId: booking, credentials: { username: "x", password: "y" } });
    const r = await testChannelConnection(booking);
    expect(r.ok).toBe(false);
    const conn = await db.channelConnection.findUniqueOrThrow({ where: { channelId: booking } });
    expect(conn.status).not.toBe("CONNECTED");
    expect(conn.isTestVerified).toBe(false);
  });

  it("credentials are stored encrypted and never in clear text", async () => {
    const booking = world.channels.BOOKING_COM;
    await saveChannelConfiguration({ channelId: booking, credentials: { password: "super-secret-value" } });
    const conn = await db.channelConnection.findUniqueOrThrow({ where: { channelId: booking } });
    expect(conn.credentialsEnc).toBeTruthy();
    expect(conn.credentialsEnc).not.toContain("super-secret-value");
  });
});

describe("inbound reservations (mock channel, DEVELOPMENT ONLY)", () => {
  beforeEach(async () => {
    await setup(5);
  });

  it("creates a central reservation with the right source, and consumes central inventory", async () => {
    expect(await avail()).toBe(5);
    const r = await processExternalReservation(mockId, ext("BK-1"), "WEBHOOK", { signatureValid: true });
    expect(r.outcome).toBe("CREATED");
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-1" }, include: { rooms: true } });
    expect(res.source).toBe("BOOKING_COM");
    expect(res.status).toBe("CONFIRMED");
    expect(res.totalAmount.toString()).toBe("690");
    expect(await avail()).toBe(4);
  });

  it("never marks an OTA reservation paid when the channel did not say so", async () => {
    await processExternalReservation(mockId, ext("BK-2"), "WEBHOOK");
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-2" } });
    expect(res.paymentStatus).toBe("INFORMATION_NOT_PROVIDED");
    expect(await db.payment.count({ where: { reservationId: res.id } })).toBe(0);
  });

  it("records OTA-collected payment, commission and an expected (not received) payout exactly as supplied", async () => {
    await processExternalReservation(
      mockId,
      ext("BK-3", {
        payment: { collection: "OTA_COLLECTED", collectedAmount: "690.00" },
        money: { currency: "SAR", totalAmount: "690.00", taxAmount: "90.00", commissionAmount: "103.50" },
      }),
      "WEBHOOK",
    );
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-3" } });
    expect(res.paymentStatus).toBe("PAID_BY_OTA");
    const payout = await db.oTAPayout.findFirstOrThrow({ where: { reservationId: res.id } });
    expect(payout.status).toBe("PENDING");
    expect(payout.commissionAmount.toString()).toBe("103.5");
    expect(payout.netAmount.toString()).toBe("586.5");
    // an OTA-collected payment must not create hotel cash in the ledger
    expect(await db.financialTransaction.count({ where: { reservationId: res.id, category: "CASH" } })).toBe(0);
  });

  it("is idempotent: the same event delivered repeatedly (even concurrently) creates one reservation", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => processExternalReservation(mockId, ext("BK-4"), "WEBHOOK")));
    expect(results.filter((r) => r.outcome === "CREATED").length).toBe(1);
    expect(await db.reservation.count({ where: { externalReservationId: "BK-4" } })).toBe(1);
    expect(await avail()).toBe(4);
  });

  it("a re-delivery with a new event id does not create a second reservation", async () => {
    await processExternalReservation(mockId, ext("BK-5"), "WEBHOOK");
    const again = await processExternalReservation(mockId, ext("BK-5", { version: "1b", eventId: "other-id" }), "WEBHOOK");
    expect(again.outcome).not.toBe("CREATED");
    expect(await db.reservation.count({ where: { externalReservationId: "BK-5" } })).toBe(1);
    expect(await avail()).toBe(4);
  });

  it("modification updates the same reservation and its dates", async () => {
    await processExternalReservation(mockId, ext("BK-6"), "WEBHOOK");
    const s = stay(30, 2);
    const out = await processExternalReservation(
      mockId,
      ext("BK-6", { action: "MODIFIED", version: "2", checkOut: addDays(s.checkIn, 3), money: { currency: "SAR", totalAmount: "1035.00", taxAmount: "135.00" } }),
      "WEBHOOK",
    );
    expect(out.outcome).toBe("MODIFIED");
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-6" } });
    expect(res.nights).toBe(3);
    expect(res.totalAmount.toString()).toBe("1035");
    expect(await db.reservation.count()).toBe(1);
  });

  it("cancellation releases inventory and reverses charges (history kept)", async () => {
    await processExternalReservation(mockId, ext("BK-7"), "WEBHOOK");
    expect(await avail()).toBe(4);
    const out = await processExternalReservation(mockId, ext("BK-7", { action: "CANCELLED", version: "3" }), "WEBHOOK");
    expect(out.outcome).toBe("CANCELLED");
    expect(await avail()).toBe(5);
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-7" } });
    expect(res.status).toBe("CANCELLED");
    expect(res.totalAmount.toString()).toBe("0");
    expect(await db.financialTransaction.count({ where: { reservationId: res.id, type: "REVERSAL" } })).toBeGreaterThan(0);
    // replaying the cancel is harmless
    const again = await processExternalReservation(mockId, ext("BK-7", { action: "CANCELLED", version: "3" }), "WEBHOOK");
    expect(again.outcome).toBe("DUPLICATE");
  });

  it("an unmapped room fails safely, is logged, and succeeds on retry after mapping", async () => {
    const e = ext("BK-8", { externalRoomId: "UNKNOWN-ROOM" });
    const first = await processExternalReservation(mockId, e, "WEBHOOK");
    expect(first.outcome).toBe("FAILED");
    expect(await db.reservation.count({ where: { externalReservationId: "BK-8" } })).toBe(0);
    const ev = await db.channelWebhookEvent.findFirstOrThrow({ where: { channelId: mockId } });
    expect(ev.status).toBe("FAILED");

    await upsertRoomMapping({ channelId: mockId, roomTypeId: world.roomType.id, externalRoomId: "UNKNOWN-ROOM" });
    const retry = await processExternalReservation(mockId, e, "WEBHOOK");
    expect(retry.outcome).toBe("CREATED");
    expect(await db.reservation.count({ where: { externalReservationId: "BK-8" } })).toBe(1);
  });

  it("overbooking from an OTA is recorded and flagged instead of silently dropped", async () => {
    const fullWorld = await createWorld({ rooms: 1, mock: true });
    mockId = fullWorld.channels.MOCK;
    world = fullWorld;
    await upsertRoomMapping({ channelId: mockId, roomTypeId: world.roomType.id, externalRoomId: "EXT-DELUXE" });
    const s = stay(30, 2);
    await createReservation({ source: "DIRECT_WEBSITE", guest: testGuest("d"), lines: [{ roomTypeId: world.roomType.id, adults: 1 }], ...s });
    const out = await processExternalReservation(mockId, ext("BK-9"), "WEBHOOK");
    expect(out.outcome).toBe("CREATED");
    const res = await db.reservation.findFirstOrThrow({ where: { externalReservationId: "BK-9" } });
    expect(res.isOverbooked).toBe(true);
  });
});

describe("outbound synchronisation (outbox, retry, backoff)", () => {
  beforeEach(async () => {
    await setup(5);
  });

  async function pendingInventoryJob() {
    return db.syncJob.findFirstOrThrow({ where: { channelId: mockId, operation: "INVENTORY_PUSH", status: "PENDING" } });
  }

  it("a direct booking enqueues an inventory push which sends the new central availability", async () => {
    await createReservation({ source: "DIRECT_WEBSITE", guest: testGuest("s"), lines: [{ roomTypeId: world.roomType.id, adults: 2, quantity: 2 }], ...stay(30, 2) });
    await runDueJobs();
    const s = stay(30, 2);
    expect(mockRemote.state(mockId).remoteInventory.get(mockRemote.inventoryKey("EXT-DELUXE", s.checkIn))).toBe(3);
  });

  it("retries with backoff, then flags the channel for verification, then recovers on manual retry", async () => {
    mockRemote.failNextPushes(mockId, 100);
    await createReservation({ source: "DIRECT_WEBSITE", guest: testGuest("f"), lines: [{ roomTypeId: world.roomType.id, adults: 1 }], ...stay(30, 2) });
    let job = await pendingInventoryJob();

    await runJob(job.id);
    job = await db.syncJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000); // backed off, not immediate

    for (let i = 1; i < job.maxAttempts; i++) {
      await db.syncJob.update({ where: { id: job.id }, data: { runAt: new Date() } });
      await runJob(job.id);
    }
    job = await db.syncJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe("FAILED");
    const conn = await db.channelConnection.findUniqueOrThrow({ where: { channelId: mockId } });
    expect(conn.inventoryNeedsVerification).toBe(true);
    // the booking itself was never affected by the sync outage
    expect(await db.reservation.count({ where: { status: "CONFIRMED" } })).toBe(1);

    mockRemote.failNextPushes(mockId, 0);
    const { retryJob } = await import("@/server/services/channel-sync.service");
    await retryJob(job.id);
    expect((await db.syncJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SUCCEEDED");
    expect((await db.channelConnection.findUniqueOrThrow({ where: { channelId: mockId } })).inventoryNeedsVerification).toBe(false);
  });

  it("rapid changes are coalesced into a single pending job", async () => {
    for (let i = 0; i < 4; i++) {
      await createReservation({ source: "DIRECT_WEBSITE", guest: testGuest(`c${i}`), lines: [{ roomTypeId: world.roomType.id, adults: 1 }], ...stay(30 + i * 3, 2) });
    }
    expect(await db.syncJob.count({ where: { channelId: mockId, operation: "INVENTORY_PUSH", status: "PENDING" } })).toBe(1);
  });
});
