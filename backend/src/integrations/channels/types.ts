import type { PaymentCollectionMethod, ReservationSource } from "@/generated/prisma/enums";

export type ChannelCredentials = Record<string, string>;

export interface ChannelContext {
  channelId: string;
  channelCode: string;
  providerKey: string;
  credentials: ChannelCredentials | null;
  config: Record<string, unknown> | null;
  hotelExternalId: string | null;
  webhookSecret: string | null;
}

export interface ProviderCapabilities {
  webhooks: boolean;
  polling: boolean;
  pushAvailability: boolean;
  pushRates: boolean;
  pushRestrictions: boolean;
}

export interface ProviderRequirements {
  summary: string;
  steps: string[];
  docsUrl: string;
  directConnectionForIndividualHotels: boolean;
  credentialFields: { key: string; label: string; secret: boolean }[];
}

export interface ConnectResult {
  ok: boolean;
  message: string;
  hotelExternalId?: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export interface PushResult {
  ok: boolean;
  recordCount: number;
  error?: string;
  retryable?: boolean;
}

export interface AvailabilityUpdate {
  externalRoomId: string;
  date: string;
  available: number;
}

export interface RateUpdate {
  externalRoomId: string;
  externalRatePlanId: string | null;
  date: string;
  price: string;
  currency: string;
}

export interface RestrictionUpdate {
  externalRoomId: string;
  externalRatePlanId: string | null;
  startDate: string;
  endDate: string;
  stopSell: boolean;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
}

export interface ExternalReservation {
  eventId?: string;
  externalReservationId: string;
  action: "NEW" | "MODIFIED" | "CANCELLED";
  originSource?: ReservationSource;
  version?: string;
  externalRoomId: string;
  externalRatePlanId?: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  guest: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    nationality?: string | null;
  };
  specialRequests?: string;
  money?: {
    currency?: string;
    totalAmount?: string | null;
    netRoomCharge?: string | null;
    taxAmount?: string | null;
    commissionAmount?: string | null;
    commissionRate?: string | null;
    cancellationFee?: string | null;
  } | null;
  payment?: {
    collection: PaymentCollectionMethod;
    collectedAmount?: string | null;
  } | null;
  raw: unknown;
}

export interface WebhookParseResult {
  verified: boolean;
  reason?: string;
  reservations: ExternalReservation[];
}

export interface ChannelManagerProvider {
  readonly key: string;
  readonly displayName: string;
  readonly isSimulation: boolean;
  readonly isImplemented: boolean;
  readonly capabilities: ProviderCapabilities;
  readonly requirements: ProviderRequirements;
  connect(ctx: ChannelContext): Promise<ConnectResult>;
  disconnect(ctx: ChannelContext): Promise<void>;
  testConnection(ctx: ChannelContext): Promise<TestResult>;
  getReservations(ctx: ChannelContext, since?: Date): Promise<ExternalReservation[]>;
  pushAvailability(ctx: ChannelContext, updates: AvailabilityUpdate[]): Promise<PushResult>;
  pushRates(ctx: ChannelContext, updates: RateUpdate[]): Promise<PushResult>;
  pushRestrictions(ctx: ChannelContext, updates: RestrictionUpdate[]): Promise<PushResult>;
  acknowledgeReservation(ctx: ChannelContext, externalReservationId: string): Promise<PushResult>;
  parseWebhook?(ctx: ChannelContext, rawBody: string, headers: Headers): Promise<WebhookParseResult>;
}
