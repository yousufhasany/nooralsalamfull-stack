import type {
  AvailabilityUpdate,
  ChannelContext,
  ChannelManagerProvider,
  ConnectResult,
  ExternalReservation,
  ProviderCapabilities,
  ProviderRequirements,
  PushResult,
  RateUpdate,
  RestrictionUpdate,
  TestResult,
} from "../types";

/**
 * Base class for connectors that are intentionally NOT implemented yet.
 *
 * We do not know (and refuse to guess) the provider's wire formats, endpoints or authentication.
 * Every operation fails loudly with an explanation so the UI can never show a fake
 * "connected" state or silently drop an inventory update.
 */
export abstract class UnimplementedProvider implements ChannelManagerProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;
  abstract readonly requirements: ProviderRequirements;
  readonly isSimulation = false;
  readonly isImplemented = false;
  readonly capabilities: ProviderCapabilities = {
    webhooks: false,
    polling: false,
    pushAvailability: false,
    pushRates: false,
    pushRestrictions: false,
  };

  protected notImplemented(): string {
    return `${this.displayName} connector is not implemented. It must be built against the provider's current official documentation after the provider approves your connectivity (see Channels > Configure for the required steps).`;
  }

  async connect(_ctx: ChannelContext): Promise<ConnectResult> {
    return { ok: false, message: this.notImplemented() };
  }
  async disconnect(_ctx: ChannelContext): Promise<void> {
    return;
  }
  async testConnection(_ctx: ChannelContext): Promise<TestResult> {
    return { ok: false, message: this.notImplemented() };
  }
  async getReservations(_ctx: ChannelContext): Promise<ExternalReservation[]> {
    throw new Error(this.notImplemented());
  }
  async pushAvailability(_ctx: ChannelContext, _u: AvailabilityUpdate[]): Promise<PushResult> {
    return { ok: false, recordCount: 0, error: this.notImplemented(), retryable: false };
  }
  async pushRates(_ctx: ChannelContext, _u: RateUpdate[]): Promise<PushResult> {
    return { ok: false, recordCount: 0, error: this.notImplemented(), retryable: false };
  }
  async pushRestrictions(_ctx: ChannelContext, _u: RestrictionUpdate[]): Promise<PushResult> {
    return { ok: false, recordCount: 0, error: this.notImplemented(), retryable: false };
  }
  async acknowledgeReservation(_ctx: ChannelContext, _id: string): Promise<PushResult> {
    return { ok: false, recordCount: 0, error: this.notImplemented(), retryable: false };
  }
}
