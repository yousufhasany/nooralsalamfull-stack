import { UnimplementedProvider } from "./unimplemented";

/**
 * Generic slot for a professional channel manager (SiteMinder, Cloudbeds, RateGain, STAAH, D-EDGE,
 * HotelRunner, ...). One channel manager connection fans out to many OTAs.
 *
 * No API access is assumed. To add a real one, copy this class, implement ChannelManagerProvider against
 * the vendor's official API (after the vendor grants you access), and register it in registry.ts.
 */
export class ExternalChannelManagerProvider extends UnimplementedProvider {
  readonly key = "channel_manager";
  readonly displayName = "External channel manager";
  readonly requirements = {
    summary:
      "Connect a professional channel manager that distributes to Booking.com, Agoda, Trip.com, Expedia and others. API access and a PMS-integration agreement are issued by the channel manager vendor.",
    steps: [
      "Choose a channel manager that supports your OTAs (e.g. SiteMinder, Cloudbeds, RateGain, STAAH, D-EDGE, HotelRunner) and subscribe.",
      "Ask the vendor for PMS/CRS API access (many vendors only open this to approved technology partners) and their API documentation.",
      "Implement an adapter class for that vendor (ChannelManagerProvider) and register it in src/integrations/channels/registry.ts.",
      "Map room types and rate plans in Channels > Mapping using the IDs the vendor assigns, then run Test Connection.",
    ],
    docsUrl: "",
    directConnectionForIndividualHotels: true,
    credentialFields: [
      { key: "apiBaseUrl", label: "API base URL (from the vendor)", secret: false },
      { key: "apiKey", label: "API key", secret: true },
    ],
  };
}
