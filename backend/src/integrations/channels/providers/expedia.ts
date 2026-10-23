import { UnimplementedProvider } from "./unimplemented";

/**
 * Expedia Group
 * Verified against developers.expediagroup.com/supply/lodging (checked Oct 2026):
 *  - Expedia is not accepting direct connections from individual properties; connect via a connectivity provider.
 *  - Connectivity partners must accept the Expedia Group API License Agreement, implement Availability/Rates (with ETP),
 *    Booking Retrieval/Notification (virtual cards, VAP) and satisfy PCI compliance (AOC, TLS 1.2+).
 */
export class ExpediaProvider extends UnimplementedProvider {
  readonly key = "expedia";
  readonly displayName = "Expedia";
  readonly requirements = {
    summary:
      "Expedia Group does not accept direct connections from individual properties. Connect through an Expedia connectivity provider (channel manager).",
    steps: [
      "Option A (recommended): work with an Expedia-approved connectivity provider / channel manager and connect it to this PMS via the 'Channel Manager' channel.",
      "Option B: apply as a connectivity partner at the Expedia Group Connectivity Hub (license agreement, PCI compliance/AOC, certification of Availability/Rates and Booking Retrieval APIs).",
      "Obtain your Expedia property ID, room type IDs and rate plan IDs and enter them in Channels > Mapping.",
      "Virtual card payments from Expedia contain card data: do NOT store them in this system unless PCI-DSS controls are in place.",
    ],
    docsUrl: "https://developers.expediagroup.com/supply/lodging",
    directConnectionForIndividualHotels: false,
    credentialFields: [
      { key: "username", label: "Username", secret: false },
      { key: "password", label: "Password", secret: true },
    ],
  };
}
