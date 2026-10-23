import { UnimplementedProvider } from "./unimplemented";

/**
 * Agoda
 * Verified against developer.agoda.com/supply (checked Oct 2026):
 *  - Certification requires implementing at least GetProduct, SetAriV2, GetBookingList and GetBookingDetails,
 *    then self-certification and a pilot with 2-3 live properties (channel managers) or supervised
 *    end-to-end certification (direct connects).
 *  - A property is connected by selecting the channel manager in YCS ("Enable channel manager mode") or by
 *    requesting API access with hotel id + name.
 */
export class AgodaProvider extends UnimplementedProvider {
  readonly key = "agoda";
  readonly displayName = "Agoda";
  readonly requirements = {
    summary:
      "Agoda connectivity requires certification (GetProduct, SetAriV2, GetBookingList, GetBookingDetails) as a Direct Connect or Channel Manager, or use an Agoda-certified channel manager.",
    steps: [
      "Option A (recommended): select an Agoda-certified channel manager in YCS (Property > Property Settings > Optional Settings > Enable channel manager mode) and connect it to this PMS via the 'Channel Manager' channel.",
      "Option B: contact your Agoda connectivity manager to become a certified Direct Connect (end-to-end supervised certification + pilot).",
      "Obtain your Agoda property ID, room IDs and rate plan IDs and enter them in Channels > Mapping.",
      "Implement the connector against the current Agoda Supply API documentation and complete Agoda's certification before enabling production traffic.",
    ],
    docsUrl: "https://developer.agoda.com/supply/docs/certification",
    directConnectionForIndividualHotels: false,
    credentialFields: [{ key: "apiKey", label: "Agoda API key", secret: true }],
  };
}
