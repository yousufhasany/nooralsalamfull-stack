import type { PaymentProvider } from "./types";

/**
 * Register concrete providers here once they are implemented against the provider's official docs, e.g.
 *   registerPaymentProvider(new MoyasarProvider(process.env.MOYASAR_SECRET_KEY!))
 * Secret keys stay server-side in environment variables / the secret vault.
 */
const providers = new Map<string, PaymentProvider>();

export function registerPaymentProvider(p: PaymentProvider) {
  providers.set(p.key, p);
}

/** The configured provider, or null when only pay-at-hotel is available. */
export function getActivePaymentProvider(): PaymentProvider | null {
  const key = process.env.PAYMENT_PROVIDER;
  if (!key || key === "none") return null;
  return providers.get(key) ?? null;
}

export function onlinePaymentsAvailable(): boolean {
  return getActivePaymentProvider() !== null;
}
