export type ErrorCode =
  | "ROOM_UNAVAILABLE"
  | "INVALID_DATES"
  | "INVALID_INPUT"
  | "PAYMENT_FAILED"
  | "SYNC_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RESERVATION_EXPIRED"
  | "CHANNEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "NOT_CONFIGURED"
  | "INTERNAL";

/**
 * Error that is safe to show to the end user (message never contains stack traces,
 * SQL or secrets). Everything else is treated as an internal error and masked.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const roomUnavailable = (details?: Record<string, unknown>) =>
  new AppError("ROOM_UNAVAILABLE", "Room is no longer available.", details);

/** A user-safe error tied to one form field, so the form can highlight it. */
export function fieldError(field: string, message: string, code: ErrorCode = "INVALID_INPUT"): AppError {
  return new AppError(code, message, { field });
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

function uniqueViolationFields(e: unknown): string[] | null {
  if (!e || typeof e !== "object" || (e as { code?: unknown }).code !== "P2002") return null;
  const meta = (e as { meta?: Record<string, unknown> }).meta ?? {};
  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  const fields = (meta.driverAdapterError as { cause?: { constraint?: { fields?: unknown } } } | undefined)?.cause?.constraint?.fields;
  return Array.isArray(fields) ? fields.map(String) : [];
}

/** Convert any thrown value to a customer-safe message. */
export function toSafeMessage(e: unknown): { code: ErrorCode; message: string; field?: string } {
  if (isAppError(e)) {
    const field = typeof e.details?.field === "string" ? e.details.field : undefined;
    return { code: e.code, message: e.message, field };
  }
  const unique = uniqueViolationFields(e);
  if (unique) {
    const field = unique.find((f) => f !== "hotelId");
    return { code: "CONFLICT", message: field ? `This ${field} is already in use.` : "This record already exists.", field };
  }
  console.error("[internal-error]", e);
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(e: unknown): ActionResult<never> {
  const { code, message, field } = toSafeMessage(e);
  return field ? { ok: false, code, message, fieldErrors: { [field]: [message] } } : { ok: false, code, message };
}
