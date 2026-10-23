import { UnimplementedProvider } from "./unimplemented";

/**
 * Booking.com
 * Verified against developers.booking.com / connect.booking.com (checked Oct 2026):
 *  - Individual properties cannot use the Connectivity APIs directly; they connect through a
 *    Booking.com-approved channel manager / connectivity provider.
 *  - Booking.com is currently pausing integrations with NEW connectivity providers.
 *  - Production API access needs a Connectivity Portal machine account, partner certification
 *    (Rates & Availability, Reservations) and PCI/PII compliance review.
 * Therefore the supported path for this hotel is: PMS -> approved channel manager -> Booking.com.
 */
export class BookingComProvider extends UnimplementedProvider {
  readonly key = "booking_com";
  readonly displayName = "Booking.com";
  readonly requirements = {
    summary:
      "Booking.com does not accept direct API connections from individual hotels. Connect through a Booking.com-approved channel manager (use the 'Channel Manager' connection), or become a certified connectivity partner.",
    steps: [
      "Option A (recommended): In the Booking.com Extranet choose Account > Channel Manager and connect a Booking.com-approved channel manager; then connect that channel manager to this PMS using the 'Channel Manager' channel.",
      "Option B: Become a Booking.com connectivity partner (currently paused for new providers). Requires a Connectivity Portal machine account, API certification and PCI/PII compliance.",
      "Obtain the property (hotel) ID, room type IDs and rate plan IDs from Booking.com and enter them in Channels > Mapping.",
      "A real connector must then be implemented against the current Booking.com Connectivity documentation (Rates & Availability + Reservations APIs) and certified by Booking.com.",
    ],
    docsUrl: "https://developers.booking.com/connectivity/docs/going_live",
    directConnectionForIndividualHotels: false,
    credentialFields: [
      { key: "machineAccountUser", label: "Machine account user", secret: false },
      { key: "machineAccountSecret", label: "Machine account secret", secret: true },
    ],
  };
}
