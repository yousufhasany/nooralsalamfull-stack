export type NotificationChannelKind = "EMAIL" | "SMS" | "WHATSAPP";

export type NotificationEvent =
  | "reservation.created"
  | "reservation.confirmed"
  | "reservation.modified"
  | "reservation.cancelled"
  | "guest.checked_in"
  | "guest.checked_out"
  | "payment.received";

export interface NotificationMessage {
  channel: NotificationChannelKind;
  to: string;
  subject: string;
  body: string;
}

export interface NotificationSendResult {
  ok: boolean;
  error?: string;
}

export interface NotificationProvider {
  key: string;
  channel: NotificationChannelKind;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}
