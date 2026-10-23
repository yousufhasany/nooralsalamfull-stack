import { db, type DbOrTx, type Tx } from "@/server/db/client";
import type {
  FinancialTransactionType,
  LedgerCategory,
  PaymentCollectionMethod,
  PaymentSource,
  PaymentStatus,
  ReservationSource,
} from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, ZERO, round2, toDb, sum, type MoneyInput } from "@/lib/money";
import type { TaxLine } from "./pricing.service";
import { computeTaxes } from "./pricing.service";
import { getHotel, getSettings } from "./settings.service";
import { audit } from "./audit.service";

/**
 * Financial ledger rules
 * ----------------------
 *  - FinancialTransaction and TaxTransaction are APPEND-ONLY (DB triggers enforce it).
 *  - Sign convention: charges positive, discounts negative, guest/OTA cash received positive,
 *    cash paid out (refund) negative, OTA commission negative.
 *  - Corrections are REVERSAL rows (exact negation of the original, linked via reversalOfId) plus new postings.
 *  - A reservation is NOT a payment: payment state is derived from Payment/Refund records only.
 */

export interface LedgerEntryInput {
  reservationId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  payoutId?: string | null;
  commissionId?: string | null;
  source?: ReservationSource | null;
  type: FinancialTransactionType;
  category: LedgerCategory;
  amount: MoneyInput;
  currency: string;
  description?: string;
  scope?: string;
  reversalOfId?: string | null;
  createdById?: string | null;
  postedAt?: Date;
}

export async function postLedger(tx: DbOrTx, e: LedgerEntryInput) {
  return tx.financialTransaction.create({
    data: {
      reservationId: e.reservationId ?? null,
      invoiceId: e.invoiceId ?? null,
      paymentId: e.paymentId ?? null,
      refundId: e.refundId ?? null,
      payoutId: e.payoutId ?? null,
      commissionId: e.commissionId ?? null,
      source: e.source ?? null,
      type: e.type,
      category: e.category,
      amount: toDb(e.amount),
      currency: e.currency,
      description: e.description ?? "",
      scope: e.scope ?? "STAY",
      reversalOfId: e.reversalOfId ?? null,
      createdById: e.createdById ?? null,
      postedAt: e.postedAt ?? new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

export interface StayChargeInput {
  reservationId: string;
  source: ReservationSource;
  currency: string;
  netRoomCharge: MoneyInput;
  netDiscount: MoneyInput;
  taxLines: TaxLine[];
  scope?: string;
  description?: string;
  createdById?: string | null;
}

export async function postStayCharges(tx: Tx, c: StayChargeInput) {
  const scope = c.scope ?? "STAY";
  const base = { reservationId: c.reservationId, source: c.source, currency: c.currency, scope, createdById: c.createdById };
  if (!D(c.netRoomCharge).isZero()) {
    await postLedger(tx, { ...base, type: "ROOM_CHARGE", category: "REVENUE", amount: c.netRoomCharge, description: c.description ?? "Room charge" });
  }
  if (!D(c.netDiscount).isZero()) {
    await postLedger(tx, { ...base, type: "DISCOUNT", category: "REVENUE", amount: D(c.netDiscount).negated(), description: "Discount" });
  }
  for (const t of c.taxLines) {
    if (D(t.amount).isZero()) continue;
    await postLedger(tx, { ...base, type: "TAX", category: "TAX", amount: t.amount, description: `${t.name} ${t.rate}%` });
    await tx.taxTransaction.create({
      data: {
        reservationId: c.reservationId,
        taxCode: t.code,
        taxName: t.name,
        rate: t.rate,
        taxableAmount: t.taxableAmount,
        taxAmount: t.amount,
        scope,
      },
    });
  }
}

/**
 * Reverse every not-yet-reversed posting of a scope (STAY / EXTRA:<id>). Original rows stay intact;
 * negating REVERSAL rows (and negative tax rows) are appended.
 */
export async function reverseScope(
  tx: Tx,
  args: {
    reservationId: string;
    scope: string;
    reason: string;
    createdById?: string | null;
    categories?: LedgerCategory[];
  },
) {
  const originals = await tx.financialTransaction.findMany({
    where: {
      reservationId: args.reservationId,
      scope: args.scope,
      type: { not: "REVERSAL" },
      category: { in: args.categories ?? ["REVENUE", "TAX"] },
      reversedBy: null,
    },
  });
  for (const o of originals) {
    await postLedger(tx, {
      reservationId: o.reservationId,
      source: o.source,
      type: "REVERSAL",
      category: o.category,
      amount: D(o.amount).negated(),
      currency: o.currency,
      description: `Reversal: ${o.description} (${args.reason})`,
      scope: o.scope,
      reversalOfId: o.id,
      createdById: args.createdById,
    });
  }

  const taxRows = await tx.taxTransaction.groupBy({
    by: ["taxCode", "taxName", "rate"],
    where: { reservationId: args.reservationId, scope: args.scope },
    _sum: { taxAmount: true, taxableAmount: true },
  });
  for (const t of taxRows) {
    if (D(t._sum.taxAmount).isZero() && D(t._sum.taxableAmount).isZero()) continue;
    await tx.taxTransaction.create({
      data: {
        reservationId: args.reservationId,
        taxCode: t.taxCode,
        taxName: t.taxName,
        rate: t.rate,
        taxableAmount: D(t._sum.taxableAmount).negated().toFixed(2),
        taxAmount: D(t._sum.taxAmount).negated().toFixed(2),
        scope: args.scope,
      },
    });
  }
}

/** Sum of all REVENUE and TAX postings (net of reversals) = what the guest/OTA owes for the stay. */
export async function ledgerCharges(client: DbOrTx, reservationId: string) {
  // A REVERSAL row is attributed to the type of the row it reverses.
  const rows = await client.$queryRaw<{ type: FinancialTransactionType; category: LedgerCategory; total: string }[]>`
    SELECT COALESCE(o."type", t."type") AS "type", t."category", SUM(t."amount")::text AS total
    FROM "FinancialTransaction" t
    LEFT JOIN "FinancialTransaction" o ON o."id" = t."reversalOfId"
    WHERE t."reservationId" = ${reservationId} AND t."category" IN ('REVENUE', 'TAX')
    GROUP BY 1, 2`;
  let revenue = ZERO;
  let discount = ZERO;
  let tax = ZERO;
  let extras = ZERO;
  for (const r of rows) {
    const v = D(r.total);
    if (r.category === "TAX") tax = tax.plus(v);
    else if (r.type === "DISCOUNT") discount = discount.plus(v);
    else if (r.type === "ADDITIONAL_CHARGE") extras = extras.plus(v);
    else revenue = revenue.plus(v);
  }
  return { revenue, discount, tax, extras, total: revenue.plus(discount).plus(tax).plus(extras) };
}

/** Re-derive cached totals on the reservation from the ledger. */
export async function refreshReservationTotals(tx: DbOrTx, reservationId: string) {
  const c = await ledgerCharges(tx, reservationId);
  await tx.reservation.update({
    where: { id: reservationId },
    data: {
      roomsSubtotal: toDb(c.revenue),
      discountTotal: toDb(c.discount.negated()),
      additionalChargesTotal: toDb(c.extras),
      taxTotal: toDb(c.tax),
      totalAmount: toDb(c.total),
    },
  });
  await refreshPaymentStatus(tx, reservationId);
}

// ---------------------------------------------------------------------------
// Additional charges (minibar, laundry, extra bed ...)
// ---------------------------------------------------------------------------

export async function addAdditionalCharge(
  tx: Tx,
  args: {
    reservationId: string;
    description: string;
    category?: string;
    quantity: number;
    unitPrice: MoneyInput;
    isTaxable: boolean;
    userId?: string | null;
  },
) {
  if (args.quantity < 1) throw new AppError("INVALID_INPUT", "Quantity must be at least 1.");
  if (D(args.unitPrice).isNegative()) throw new AppError("INVALID_INPUT", "Unit price cannot be negative.");
  const res = await tx.reservation.findUnique({ where: { id: args.reservationId } });
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  if (res.status === "CANCELLED" || res.status === "NO_SHOW") {
    throw new AppError("INVALID_STATE", "Charges cannot be added to a cancelled reservation.");
  }
  const hotel = await getHotel(tx);
  const taxSettings = await getSettings(hotel.id, "tax", tx);

  const amount = round2(D(args.unitPrice).mul(args.quantity));
  const charge = await tx.additionalCharge.create({
    data: {
      reservationId: args.reservationId,
      description: args.description,
      category: args.category ?? "OTHER",
      quantity: args.quantity,
      unitPrice: toDb(args.unitPrice),
      amount: toDb(amount),
      isTaxable: args.isTaxable,
      postedById: args.userId ?? null,
    },
  });

  const scope = `EXTRA:${charge.id}`;
  const taxes = args.isTaxable
    ? computeTaxes(amount, taxSettings.rules, taxSettings.pricesIncludeTax)
    : { taxes: [], taxTotal: ZERO };
  const netAmount = taxSettings.pricesIncludeTax ? round2(amount.minus(taxes.taxTotal)) : amount;

  await postLedger(tx, {
    reservationId: args.reservationId,
    source: res.source,
    type: "ADDITIONAL_CHARGE",
    category: "REVENUE",
    amount: netAmount,
    currency: res.currency,
    description: `${args.description} x${args.quantity}`,
    scope,
    createdById: args.userId,
  });
  for (const t of taxes.taxes) {
    await postLedger(tx, {
      reservationId: args.reservationId,
      source: res.source,
      type: "TAX",
      category: "TAX",
      amount: t.amount,
      currency: res.currency,
      description: `${t.name} ${t.rate}% on ${args.description}`,
      scope,
      createdById: args.userId,
    });
    await tx.taxTransaction.create({
      data: {
        reservationId: args.reservationId,
        taxCode: t.code,
        taxName: t.name,
        rate: t.rate,
        taxableAmount: t.taxableAmount,
        taxAmount: t.amount,
        scope,
      },
    });
  }
  await refreshReservationTotals(tx, args.reservationId);
  await audit({ userId: args.userId, action: "charge.added", entity: "AdditionalCharge", entityId: charge.id, after: charge }, tx);
  return charge;
}

export async function voidAdditionalCharge(tx: Tx, chargeId: string, reason: string, userId?: string | null) {
  const charge = await tx.additionalCharge.findUnique({ where: { id: chargeId } });
  if (!charge) throw new AppError("NOT_FOUND", "Charge not found.");
  if (charge.voidedAt) throw new AppError("INVALID_STATE", "Charge is already void.");
  await reverseScope(tx, { reservationId: charge.reservationId, scope: `EXTRA:${charge.id}`, reason, createdById: userId });
  await tx.additionalCharge.update({ where: { id: chargeId }, data: { voidedAt: new Date(), voidReason: reason } });
  await refreshReservationTotals(tx, charge.reservationId);
  await audit({ userId, action: "charge.voided", entity: "AdditionalCharge", entityId: chargeId, after: { reason } }, tx);
}

// ---------------------------------------------------------------------------
// Payments & refunds
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  reservationId: string;
  amount: MoneyInput;
  source: PaymentSource;
  collectionMethod: PaymentCollectionMethod;
  reference?: string;
  note?: string;
  provider?: string | null;
  providerReference?: string | null;
  invoiceId?: string | null;
  receivedAt?: Date;
  userId?: string | null;
  /** true only when an external party (OTA/payment provider) confirmed the funds. */
  confirmed?: boolean;
}

/**
 * Record money received against a reservation. For OTA_COLLECTED payments (the OTA charged the
 * guest) no hotel cash is posted - the cash arrives later as an OTA payout.
 */
export async function recordPayment(tx: Tx, input: RecordPaymentInput) {
  const amount = round2(input.amount);
  if (!amount.greaterThan(0)) throw new AppError("INVALID_INPUT", "Payment amount must be greater than zero.");
  const res = await tx.reservation.findUnique({ where: { id: input.reservationId } });
  if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
  if (res.status === "CANCELLED" || res.status === "NO_SHOW") {
    throw new AppError("INVALID_STATE", "Payments cannot be recorded on a cancelled reservation.");
  }
  const payment = await tx.payment.create({
    data: {
      reservationId: res.id,
      invoiceId: input.invoiceId ?? null,
      amount: toDb(amount),
      currency: res.currency,
      source: input.source,
      collectionMethod: input.collectionMethod,
      status: "SUCCEEDED",
      provider: input.provider ?? null,
      providerReference: input.providerReference ?? null,
      reference: input.reference ?? null,
      note: input.note ?? "",
      receivedAt: input.receivedAt ?? new Date(),
      recordedById: input.userId ?? null,
    },
  });
  if (input.collectionMethod !== "OTA_COLLECTED") {
    await postLedger(tx, {
      reservationId: res.id,
      paymentId: payment.id,
      source: res.source,
      type: "PAYMENT",
      category: "CASH",
      amount,
      currency: res.currency,
      description: `Payment (${input.source})${input.reference ? ` ref ${input.reference}` : ""}`,
      scope: "CASH",
      createdById: input.userId,
      postedAt: payment.receivedAt,
    });
  }
  await tx.reservation.update({
    where: { id: res.id },
    data: input.collectionMethod === "OTA_COLLECTED" || res.paymentCollection === "UNKNOWN" ? { paymentCollection: input.collectionMethod } : {},
  });
  await refreshPaymentStatus(tx, res.id);
  await audit({ userId: input.userId, action: "payment.recorded", entity: "Payment", entityId: payment.id, after: payment }, tx);
  return payment;
}

export async function recordRefund(
  tx: Tx,
  args: { paymentId: string; amount: MoneyInput; reason: string; userId?: string | null },
) {
  const amount = round2(args.amount);
  if (!amount.greaterThan(0)) throw new AppError("INVALID_INPUT", "Refund amount must be greater than zero.");
  const payment = await tx.payment.findUnique({ where: { id: args.paymentId }, include: { refunds: true } });
  if (!payment || payment.status !== "SUCCEEDED") throw new AppError("NOT_FOUND", "Payment not found.");
  const refunded = sum(payment.refunds.filter((r) => r.status === "COMPLETED").map((r) => r.amount));
  if (refunded.plus(amount).greaterThan(D(payment.amount))) {
    throw new AppError("INVALID_INPUT", "Refund exceeds the amount of the original payment.");
  }
  const res = await tx.reservation.findUniqueOrThrow({ where: { id: payment.reservationId } });
  const refund = await tx.refund.create({
    data: {
      paymentId: payment.id,
      reservationId: payment.reservationId,
      amount: toDb(amount),
      reason: args.reason,
      status: "COMPLETED",
      recordedById: args.userId ?? null,
    },
  });
  if (payment.collectionMethod !== "OTA_COLLECTED") {
    await postLedger(tx, {
      reservationId: payment.reservationId,
      paymentId: payment.id,
      refundId: refund.id,
      source: res.source,
      type: "REFUND",
      category: "CASH",
      amount: amount.negated(),
      currency: payment.currency,
      description: `Refund: ${args.reason}`,
      scope: "CASH",
      createdById: args.userId,
    });
  }
  await refreshPaymentStatus(tx, payment.reservationId);
  await audit({ userId: args.userId, action: "refund.recorded", entity: "Refund", entityId: refund.id, after: refund }, tx);
  return refund;
}

export async function paymentTotals(client: DbOrTx, reservationId: string) {
  const [payments, refunds] = await Promise.all([
    client.payment.aggregate({ where: { reservationId, status: "SUCCEEDED" }, _sum: { amount: true } }),
    client.refund.aggregate({ where: { reservationId, status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  return { paid: D(payments._sum.amount), refunded: D(refunds._sum.amount) };
}

/** Derive Reservation.paidAmount and paymentStatus from payment records. Never from the reservation status. */
export async function refreshPaymentStatus(tx: DbOrTx, reservationId: string): Promise<PaymentStatus> {
  const res = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const { paid, refunded } = await paymentTotals(tx, reservationId);
  const net = paid.minus(refunded);
  const total = D(res.totalAmount);

  let status: PaymentStatus;
  if (refunded.greaterThan(0) && refunded.greaterThanOrEqualTo(paid)) status = "REFUNDED";
  else if (refunded.greaterThan(0) && net.lessThan(total)) status = net.greaterThan(0) ? "PARTIALLY_REFUNDED" : "REFUNDED";
  else if (net.greaterThan(0) && net.greaterThanOrEqualTo(total) && total.greaterThan(0)) {
    status = res.paymentCollection === "OTA_COLLECTED" ? "PAID_BY_OTA" : "PAID";
  } else if (net.greaterThan(0)) status = "PARTIALLY_PAID";
  else if (res.paymentCollection === "UNKNOWN") status = "INFORMATION_NOT_PROVIDED";
  else if (res.paymentCollection === "PAY_AT_HOTEL") status = "PAY_AT_HOTEL";
  else if (res.paymentCollection === "ONLINE_PAYMENT") status = "PENDING";
  else status = "UNPAID";

  if (status !== res.paymentStatus || !D(res.paidAmount).equals(net)) {
    await tx.reservation.update({ where: { id: reservationId }, data: { paymentStatus: status, paidAmount: toDb(net) } });
  }
  return status;
}

export async function getReservationBalance(client: DbOrTx, reservationId: string) {
  const res = await client.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const { paid, refunded } = await paymentTotals(client, reservationId);
  const total = D(res.totalAmount);
  const net = paid.minus(refunded);
  return { total, paid, refunded, net, balance: round2(total.minus(net)) };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

export interface ChannelRevenueRow {
  source: ReservationSource;
  gross: string;
  commission: string;
  net: string;
}

/** Gross / commission / net by channel, computed purely from ledger postings. */
export async function revenueByChannel(
  args: { from: Date; to: Date },
  client: DbOrTx = db,
): Promise<ChannelRevenueRow[]> {
  const rows = await client.$queryRaw<{ source: ReservationSource; gross: string; commission: string }[]>`
    SELECT "source",
      COALESCE(SUM("amount") FILTER (WHERE "category" = 'REVENUE'), 0)::text AS gross,
      COALESCE(SUM("amount") FILTER (WHERE "category" = 'COMMISSION'), 0)::text AS commission
    FROM "FinancialTransaction"
    WHERE "postedAt" >= ${args.from} AND "postedAt" < ${args.to} AND "source" IS NOT NULL
    GROUP BY "source" ORDER BY "source"`;
  return rows.map((r) => ({
    source: r.source,
    gross: toDb(r.gross),
    commission: toDb(D(r.commission).abs()),
    net: toDb(D(r.gross).plus(D(r.commission))),
  }));
}
