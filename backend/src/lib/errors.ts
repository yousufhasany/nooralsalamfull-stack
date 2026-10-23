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

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Convert any thrown value to a customer-safe message. */
export function toSafeMessage(e: unknown): { code: ErrorCode; message: string } {
  if (isAppError(e)) return { code: e.code, message: e.message };
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
  const { code, message } = toSafeMessage(e);
  return { ok: false, code, message };
}
