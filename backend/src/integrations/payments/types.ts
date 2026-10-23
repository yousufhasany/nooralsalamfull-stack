export interface PaymentSessionRequest {
  reservationNumber: string;
  amount: string;
  currency: string;
  customer: { name: string; email: string | null; phone: string | null };
  returnUrl: string;
  callbackUrl: string;
  locale: "en" | "ar" | "bn";
}

export interface PaymentSession {
  redirectUrl: string;
}

export interface VerifiedPayment {
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "CANCELLED";
  providerReference: string;
  currency: string;
  amount: string;
  reservationNumber?: string | null;
}

export interface PaymentCallbackResult {
  verified: boolean;
  payment?: { providerReference: string; reservationNumber?: string | null };
}

export interface PaymentProvider {
  key: string;
  createSession(input: PaymentSessionRequest): Promise<PaymentSession>;
  parseCallback(rawBody: string, headers: Headers): Promise<PaymentCallbackResult>;
  verifyPayment(providerReference: string): Promise<VerifiedPayment>;
}
