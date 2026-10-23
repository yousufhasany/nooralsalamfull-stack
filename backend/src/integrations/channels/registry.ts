import type { ChannelManagerProvider } from "./types";
import { AgodaProvider } from "./providers/agoda";
import { BookingComProvider } from "./providers/booking-com";
import { ExpediaProvider } from "./providers/expedia";
import { ExternalChannelManagerProvider } from "./providers/external-channel-manager";
import { MockChannelProvider } from "./providers/mock";
import { TripComProvider } from "./providers/trip-com";

/**
 * All OTA-specific code lives behind this registry. Application code looks providers up by key and
 * never imports a concrete connector. To add a real connector implement ChannelManagerProvider and
 * register it here.
 */
const providers: ChannelManagerProvider[] = [
  new BookingComProvider(),
  new AgodaProvider(),
  new TripComProvider(),
  new ExpediaProvider(),
  new ExternalChannelManagerProvider(),
  new MockChannelProvider(),
];

const byKey = new Map(providers.map((p) => [p.key, p]));

export function getChannelProvider(key: string): ChannelManagerProvider {
  const p = byKey.get(key);
  if (!p) throw new Error(`Unknown channel provider "${key}"`);
  return p;
}

export function listChannelProviders(): ChannelManagerProvider[] {
  return providers.filter((p) => !p.isSimulation || process.env.NODE_ENV !== "production");
}
