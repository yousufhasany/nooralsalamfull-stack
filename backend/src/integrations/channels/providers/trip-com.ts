import { UnimplementedProvider } from "./unimplemented";

/**
 * Trip.com
 * Verified against connect.trip.com / apidoc.trip.com (checked Oct 2026):
 *  - Direct connectivity requires a business cooperation agreement with Trip.com; partners must support all
 *    available API functions and keep at least a year of rates/availability loaded.
 *  - Requests use partner-issued identifiers (AllianceID, SID, icode, token) provided by Trip.com.
 */
export class TripComProvider extends UnimplementedProvider {
  readonly key = "trip_com";
  readonly displayName = "Trip.com";
  readonly requirements = {
    summary:
      "Trip.com direct connectivity requires a signed cooperation agreement and partner credentials issued by Trip.com. Hotels normally connect through a Trip.com connectivity provider.",
    steps: [
      "Option A (recommended): choose a Trip.com preferred connectivity provider / channel manager and connect it to this PMS via the 'Channel Manager' channel.",
      "Option B: contact your Trip.com account manager to sign the connectivity cooperation agreement and receive partner credentials.",
      "Obtain the Trip.com hotel ID, room type IDs and rate plan IDs and enter them in Channels > Mapping.",
      "Implement the connector against the current Trip.com API documentation and pass Trip.com's validation.",
    ],
    docsUrl: "https://connect.trip.com/doc/trip",
    directConnectionForIndividualHotels: false,
    credentialFields: [
      { key: "allianceId", label: "Alliance ID", secret: false },
      { key: "sid", label: "SID", secret: false },
      { key: "icode", label: "Verification code", secret: true },
    ],
  };
}
