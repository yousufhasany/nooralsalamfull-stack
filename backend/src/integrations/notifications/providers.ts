import type { NotificationChannelKind, NotificationProvider } from "./types";

/**
 * No delivery provider is bundled on purpose (the hotel has not chosen one). To enable real
 * delivery implement NotificationProvider (e.g. SMTP, a Saudi SMS gateway, WhatsApp Business
 * Cloud API) and register it below under the key used in EMAIL_PROVIDER / SMS_PROVIDER /
 * WHATSAPP_PROVIDER. Nothing here pretends a message was delivered.
 */
const registry = new Map<string, NotificationProvider>();

export function registerNotificationProvider(provider: NotificationProvider) {
  registry.set(`${provider.channel}:${provider.key}`, provider);
}

export function resolveNotificationProvider(channel: NotificationChannelKind): NotificationProvider | null {
  const envKey =
    channel === "EMAIL" ? process.env.EMAIL_PROVIDER : channel === "SMS" ? process.env.SMS_PROVIDER : process.env.WHATSAPP_PROVIDER;
  if (!envKey || envKey === "none" || envKey === "console") return null;
  return registry.get(`${channel}:${envKey}`) ?? null;
}
