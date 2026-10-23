import { hmacSha256Hex, safeEqual } from "@/server/security/crypto";
import type {
  AvailabilityUpdate,
  ChannelContext,
  ChannelManagerProvider,
  ConnectResult,
  ExternalReservation,
  ProviderCapabilities,
  PushResult,
  RateUpdate,
  RestrictionUpdate,
  TestResult,
  WebhookParseResult,
} from "../types";

/**
 * ############################################################################
 *  DEVELOPMENT ONLY  -  MockChannelProvider
 *  Simulates an OTA / channel manager for local development and automated tests.
 *  It talks to NOTHING external. It refuses to operate when NODE_ENV=production.
 * ############################################################################
 */

interface MockChannelState {
  remoteInventory: Map<string, number>;
  remoteRates: Map<string, string>;
  remoteRestrictions: RestrictionUpdate[];
  inbox: ExternalReservation[];
  acknowledged: Set<string>;
  pushLog: { op: string; count: number; at: Date }[];
  /** Number of upcoming push calls that should fail. */
  failNext: number;
  failRetryable: boolean;
  connectionOk: boolean;
}

const states = new Map<string, MockChannelState>();

function stateFor(channelId: string): MockChannelState {
  let s = states.get(channelId);
  if (!s) {
    s = {
      remoteInventory: new Map(),
      remoteRates: new Map(),
      remoteRestrictions: [],
      inbox: [],
      acknowledged: new Set(),
      pushLog: [],
      failNext: 0,
      failRetryable: true,
      connectionOk: true,
    };
    states.set(channelId, s);
  }
  return s;
}

/** Test/dev control surface for the simulator. */
export const mockRemote = {
  state: stateFor,
  reset(channelId?: string) {
    if (channelId) states.delete(channelId);
    else states.clear();
  },
  enqueueReservation(channelId: string, r: ExternalReservation) {
    stateFor(channelId).inbox.push(r);
  },
  failNextPushes(channelId: string, count: number, retryable = true) {
    const s = stateFor(channelId);
    s.failNext = count;
    s.failRetryable = retryable;
  },
  setConnectionOk(channelId: string, ok: boolean) {
    stateFor(channelId).connectionOk = ok;
  },
  inventoryKey: (externalRoomId: string, date: string) => `${externalRoomId}|${date}`,
  /** Sign a webhook body the same way the simulator expects to verify it. */
  sign(secret: string, body: string) {
    return hmacSha256Hex(secret, body);
  },
};

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

function guard(): string | null {
  return process.env.NODE_ENV === "production"
    ? "MockChannelProvider is DEVELOPMENT ONLY and is disabled in production."
    : null;
}

export class MockChannelProvider implements ChannelManagerProvider {
  readonly key = "mock";
  readonly displayName = "Mock channel (DEVELOPMENT ONLY)";
  readonly isSimulation = true;
  readonly isImplemented = true;
  readonly capabilities: ProviderCapabilities = {
    webhooks: true,
    polling: true,
    pushAvailability: true,
    pushRates: true,
    pushRestrictions: true,
  };
  readonly requirements = {
    summary: "DEVELOPMENT ONLY simulator. Not connected to any real OTA. Disabled in production.",
    steps: ["Use only on local/dev machines to exercise the channel workflow end-to-end."],
    docsUrl: "",
    directConnectionForIndividualHotels: true,
    credentialFields: [] as { key: string; label: string; secret: boolean }[],
  };

  async connect(ctx: ChannelContext): Promise<ConnectResult> {
    const blocked = guard();
    if (blocked) return { ok: false, message: blocked };
    return { ok: true, message: "Simulated connection established (DEVELOPMENT ONLY).", hotelExternalId: ctx.hotelExternalId ?? "MOCK-HOTEL" };
  }

  async disconnect(): Promise<void> {
    return;
  }

  async testConnection(ctx: ChannelContext): Promise<TestResult> {
    const blocked = guard();
    if (blocked) return { ok: false, message: blocked };
    return stateFor(ctx.channelId).connectionOk
      ? { ok: true, message: "Simulated connection OK (DEVELOPMENT ONLY)." }
      : { ok: false, message: "Simulated connection failure." };
  }

  async getReservations(ctx: ChannelContext): Promise<ExternalReservation[]> {
    const blocked = guard();
    if (blocked) throw new Error(blocked);
    const s = stateFor(ctx.channelId);
    return s.inbox.filter((r) => !s.acknowledged.has(`${r.externalReservationId}:${r.version ?? ""}`));
  }

  private maybeFail(ctx: ChannelContext, op: string): PushResult | null {
    const blocked = guard();
    if (blocked) return { ok: false, recordCount: 0, error: blocked, retryable: false };
    const s = stateFor(ctx.channelId);
    if (s.failNext > 0) {
      s.failNext--;
      return { ok: false, recordCount: 0, error: `Simulated ${op} failure`, retryable: s.failRetryable };
    }
    return null;
  }

  async pushAvailability(ctx: ChannelContext, updates: AvailabilityUpdate[]): Promise<PushResult> {
    const failed = this.maybeFail(ctx, "availability push");
    if (failed) return failed;
    const s = stateFor(ctx.channelId);
    for (const u of updates) s.remoteInventory.set(mockRemote.inventoryKey(u.externalRoomId, u.date), u.available);
    s.pushLog.push({ op: "availability", count: updates.length, at: new Date() });
    return { ok: true, recordCount: updates.length };
  }

  async pushRates(ctx: ChannelContext, updates: RateUpdate[]): Promise<PushResult> {
    const failed = this.maybeFail(ctx, "rate push");
    if (failed) return failed;
    const s = stateFor(ctx.channelId);
    for (const u of updates) s.remoteRates.set(`${u.externalRoomId}|${u.externalRatePlanId ?? ""}|${u.date}`, u.price);
    s.pushLog.push({ op: "rates", count: updates.length, at: new Date() });
    return { ok: true, recordCount: updates.length };
  }

  async pushRestrictions(ctx: ChannelContext, updates: RestrictionUpdate[]): Promise<PushResult> {
    const failed = this.maybeFail(ctx, "restriction push");
    if (failed) return failed;
    const s = stateFor(ctx.channelId);
    s.remoteRestrictions = updates;
    s.pushLog.push({ op: "restrictions", count: updates.length, at: new Date() });
    return { ok: true, recordCount: updates.length };
  }

  async acknowledgeReservation(ctx: ChannelContext, externalReservationId: string): Promise<PushResult> {
    const s = stateFor(ctx.channelId);
    for (const r of s.inbox.filter((x) => x.externalReservationId === externalReservationId)) {
      s.acknowledged.add(`${r.externalReservationId}:${r.version ?? ""}`);
    }
    return { ok: true, recordCount: 1 };
  }

  /** Simulator wire format: JSON `{ reservations: ExternalReservation[] }` signed with HMAC-SHA256 of the body. */
  async parseWebhook(ctx: ChannelContext, rawBody: string, headers: Headers): Promise<WebhookParseResult> {
    const blocked = guard();
    if (blocked) return { verified: false, reason: blocked, reservations: [] };
    if (!ctx.webhookSecret) return { verified: false, reason: "No webhook secret configured", reservations: [] };
    const given = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    const expected = hmacSha256Hex(ctx.webhookSecret, rawBody);
    if (!given || !safeEqual(given, expected)) return { verified: false, reason: "Invalid signature", reservations: [] };
    const body = JSON.parse(rawBody) as { reservations?: ExternalReservation[] };
    return { verified: true, reservations: body.reservations ?? [] };
  }
}
