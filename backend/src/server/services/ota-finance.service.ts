import { db, type DbOrTx, type Tx } from "@/server/db/client";
import type { PayoutStatus, ReconciliationStatus, ReservationSource } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, ZERO, eq, round2, sum, toDb, type MoneyInput } from "@/lib/money";
import { ledgerCharges, postLedger, reverseScope } from "./financial.service";
import { audit } from "./audit.service";

/**
 * OTA money flows. Three separate facts are tracked and never conflated:
 *   1. the BOOKING            (Reservation + REVENUE/TAX ledger rows)
 *   2. the COMMISSION owed    (OTACommission + COMMISSION ledger row, only when supplied by the channel)
 *   3. the PAYOUT received    (OTAPayout + OTA_PAYOUT cash ledger row, only when the payout is confirmed PAID)
 */

export async function upsertCommission(
  tx: Tx,
  args: {
    reservationId: string;
    channelId: string;
    source: ReservationSource;
    currency: string;
    gross: MoneyInput;
    commissionAmount?: MoneyInput | null;
    rate?: MoneyInput | null;
    userId?: string | null;
  },
) {
  let commission: ReturnType<typeof D> | null = null;
  if (args.commissionAmount !== null && args.commissionAmount !== undefined && args.commissionAmount !== "") {
    commission = round2(args.commissionAmount);
  } else if (args.rate !== null && args.rate !== undefined && args.rate !== "") {
    commission = round2(D(args.gross).mul(D(args.rate)).div(100));
  }
  if (commission === null) return null; // nothing supplied -> nothing invented

  const existing = await tx.oTACommission.findFirst({
    where: { reservationId: args.reservationId, channelId: args.channelId, status: { not: "WAIVED" } },
    orderBy: { createdAt: "desc" },
  });
  if (existing && D(existing.commissionAmount).equals(commission) && D(existing.grossAmount).equals(D(args.gross))) return existing;

  if (existing) {
    await reverseScope(tx, {
      reservationId: args.reservationId,
      scope: "COMMISSION",
      reason: "commission revised",
      createdById: args.userId,
      categories: ["COMMISSION"],
    });
  }
  const gross = round2(args.gross);
  const rate = args.rate !== null && args.rate !== undefined && args.rate !== "" ? D(args.rate).toFixed(4) : null;
  const rec = existing
    ? await tx.oTACommission.update({
        where: { id: existing.id },
        data: { grossAmount: toDb(gross), commissionAmount: toDb(commission), netHotelAmount: toDb(gross.minus(commission)), rate },
      })
    : await tx.oTACommission.create({
        data: {
          channelId: args.channelId,
          reservationId: args.reservationId,
          rate,
          grossAmount: toDb(gross),
          commissionAmount: toDb(commission),
          netHotelAmount: toDb(gross.minus(commission)),
          currency: args.currency,
          status: "EXPECTED",
        },
      });
  if (!commission.isZero()) {
    await postLedger(tx, {
      reservationId: args.reservationId,
      commissionId: rec.id,
      source: args.source,
      type: "OTA_COMMISSION",
      category: "COMMISSION",
      amount: commission.negated(),
      currency: args.currency,
      description: `OTA commission${rate ? ` (${D(rate).toString()}%)` : ""}`,
      scope: "COMMISSION",
      createdById: args.userId,
    });
  }
  return rec;
}

export async function removeCommission(tx: Tx, reservationId: string, reason: string, userId?: string | null) {
  await reverseScope(tx, { reservationId, scope: "COMMISSION", reason, createdById: userId, categories: ["COMMISSION"] });
  await tx.oTACommission.updateMany({ where: { reservationId, status: { not: "WAIVED" } }, data: { status: "WAIVED" } });
}

export interface PayoutInput {
  channelId: string;
  externalPayoutId?: string | null;
  reservationId?: string | null;
  grossAmount: MoneyInput;
  commissionAmount?: MoneyInput;
  taxAmount?: MoneyInput;
  adjustmentAmount?: MoneyInput;
  /** Net amount as stated by the OTA. If omitted it is derived: gross - commission - tax + adjustments. */
  netAmount?: MoneyInput;
  currency: string;
  status: PayoutStatus;
  payoutDate?: string | null;
  expectedPayoutDate?: string | null;
  notes?: string;
  userId?: string | null;
}

/**
 * Record a payout. A cash ledger row (OTA_PAYOUT) is posted ONLY when the status is PAID, i.e. when the
 * payout is confirmed. Pending/expected payouts never create cash.
 */
export async function recordOtaPayout(tx: Tx, input: PayoutInput) {
  const channel = await tx.channel.findUnique({ where: { id: input.channelId } });
  if (!channel) throw new AppError("NOT_FOUND", "Channel not found.");
  const gross = round2(input.grossAmount);
  const commission = round2(input.commissionAmount ?? 0);
  const taxes = round2(input.taxAmount ?? 0);
  const adjustments = round2(input.adjustmentAmount ?? 0);
  const net = input.netAmount !== undefined ? round2(input.netAmount) : round2(gross.minus(commission).minus(taxes).plus(adjustments));

  if (input.externalPayoutId) {
    const dup = await tx.oTAPayout.findUnique({
      where: { channelId_externalPayoutId: { channelId: input.channelId, externalPayoutId: input.externalPayoutId } },
    });
    if (dup) throw new AppError("CONFLICT", "A payout with this external ID has already been recorded.");
  }
  const payout = await tx.oTAPayout.create({
    data: {
      channelId: input.channelId,
      externalPayoutId: input.externalPayoutId ?? null,
      reservationId: input.reservationId ?? null,
      grossAmount: toDb(gross),
      commissionAmount: toDb(commission),
      taxAmount: toDb(taxes),
      adjustmentAmount: toDb(adjustments),
      netAmount: toDb(net),
      currency: input.currency,
      status: input.status,
      payoutDate: input.payoutDate ? new Date(`${input.payoutDate}T00:00:00Z`) : null,
      expectedPayoutDate: input.expectedPayoutDate ? new Date(`${input.expectedPayoutDate}T00:00:00Z`) : null,
      notes: input.notes ?? "",
    },
  });
  if (input.status === "PAID") await postPayoutCash(tx, payout.id, input.userId);
  await audit({ userId: input.userId, action: "payout.recorded", entity: "OTAPayout", entityId: payout.id, after: payout, source: "ADMIN" }, tx);
  return payout;
}

async function postPayoutCash(tx: DbOrTx, payoutId: string, userId?: string | null) {
  const payout = await tx.oTAPayout.findUniqueOrThrow({ where: { id: payoutId }, include: { channel: true } });
  const already = await tx.financialTransaction.findFirst({ where: { payoutId, type: "OTA_PAYOUT", reversedBy: null } });
  if (already) return;
  await postLedger(tx, {
    reservationId: payout.reservationId,
    payoutId: payout.id,
    source: payout.channel.source,
    type: "OTA_PAYOUT",
    category: "CASH",
    amount: payout.netAmount,
    currency: payout.currency,
    description: `OTA payout${payout.externalPayoutId ? ` ${payout.externalPayoutId}` : ""}`,
    scope: `PAYOUT:${payout.id}`,
    createdById: userId,
    postedAt: payout.payoutDate ?? new Date(),
  });
}

export async function markPayoutPaid(payoutId: string, args: { payoutDate: string; userId?: string | null }) {
  return db.$transaction(async (tx) => {
    const p = await tx.oTAPayout.findUnique({ where: { id: payoutId } });
    if (!p) throw new AppError("NOT_FOUND", "Payout not found.");
    if (p.status === "PAID") throw new AppError("INVALID_STATE", "Payout is already marked as paid.");
    const updated = await tx.oTAPayout.update({
      where: { id: payoutId },
      data: { status: "PAID", payoutDate: new Date(`${args.payoutDate}T00:00:00Z`) },
    });
    await postPayoutCash(tx, payoutId, args.userId);
    await audit({ userId: args.userId, action: "payout.paid", entity: "OTAPayout", entityId: payoutId, before: { status: p.status }, after: { status: "PAID" } }, tx);
    return updated;
  });
}

export async function recordBankReceipt(args: {
  payoutId?: string | null;
  amount: MoneyInput;
  currency?: string;
  receivedOn: string;
  reference?: string;
  bankName?: string;
  notes?: string;
  userId?: string | null;
}) {
  return db.$transaction(async (tx) => {
    if (args.payoutId) {
      const p = await tx.oTAPayout.findUnique({ where: { id: args.payoutId } });
      if (!p) throw new AppError("NOT_FOUND", "Payout not found.");
    }
    const r = await tx.bankReceipt.create({
      data: {
        payoutId: args.payoutId ?? null,
        amount: toDb(args.amount),
        currency: args.currency ?? "SAR",
        receivedOn: new Date(`${args.receivedOn}T00:00:00Z`),
        reference: args.reference ?? "",
        bankName: args.bankName ?? "",
        notes: args.notes ?? "",
        recordedById: args.userId ?? null,
      },
    });
    await audit({ userId: args.userId, action: "bank_receipt.recorded", entity: "BankReceipt", entityId: r.id, after: r }, tx);
    return r;
  });
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  reservationId: string;
  status: ReconciliationStatus;
  expectedGross: string;
  expectedCommission: string;
  expectedNet: string;
  ledgerNet: string;
  payoutNet: string | null;
  bankReceived: string | null;
  issues: string[];
  payoutId: string | null;
}

/**
 * Compare four independent sources for an OTA reservation:
 *   OTA reservation (gross)  |  OTA commission  |  OTA payout  |  hotel ledger cash  |  bank receipts
 * and classify. Pure read: persist with `saveReconciliation`.
 */
export async function reconcileReservation(reservationId: string, client: DbOrTx = db): Promise<ReconciliationResult> {
  const res = await client.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  const issues: string[] = [];

  const charges = await ledgerCharges(client, reservationId);
  const expectedGross = charges.total;

  const commissions = await client.oTACommission.findMany({ where: { reservationId, status: { not: "WAIVED" } } });
  const hasCommissionData = commissions.length > 0;
  const expectedCommission = sum(commissions.map((c) => c.commissionAmount));
  const expectedNet = round2(expectedGross.minus(expectedCommission));

  const payouts = await client.oTAPayout.findMany({ where: { reservationId }, include: { receipts: true } });
  const paidPayouts = payouts.filter((p) => p.status === "PAID");
  const payoutNet = paidPayouts.length ? sum(paidPayouts.map((p) => p.netAmount)) : null;
  const bankReceived = paidPayouts.some((p) => p.receipts.length) ? sum(paidPayouts.flatMap((p) => p.receipts.map((r) => r.amount))) : null;

  const cash = await client.financialTransaction.aggregate({
    where: { reservationId, type: "OTA_PAYOUT", category: "CASH" },
    _sum: { amount: true },
  });
  const ledgerNet = D(cash._sum.amount);

  const collection = res.paymentCollection;
  let status: ReconciliationStatus;

  if (res.status === "CANCELLED" || res.status === "NO_SHOW") {
    if (expectedGross.isZero() && paidPayouts.length === 0) status = "MATCHED";
    else if (paidPayouts.length === 0) status = "NEEDS_REVIEW";
    else status = "NEEDS_REVIEW";
    if (status === "NEEDS_REVIEW") issues.push("Cancelled reservation still has an outstanding amount or payout.");
  } else if (collection === "UNKNOWN") {
    status = "NEEDS_REVIEW";
    issues.push("Payment collection method was not provided by the channel.");
  } else if (collection !== "OTA_COLLECTED") {
    // Hotel collects from the guest: compare guest payments with the amount due.
    const paid = D(res.paidAmount);
    if (eq(paid, expectedGross) && expectedGross.greaterThan(0)) status = "MATCHED";
    else if (paid.greaterThan(0)) {
      status = "PARTIALLY_MATCHED";
      issues.push(`Guest paid ${paid.toFixed(2)} of ${expectedGross.toFixed(2)} due.`);
    } else {
      status = "UNMATCHED";
      issues.push("No payment has been collected from the guest yet.");
    }
    if (!hasCommissionData) issues.push("No commission data supplied by the channel.");
  } else {
    if (!hasCommissionData) issues.push("Commission was not supplied by the channel - expected net cannot be verified.");
    if (payouts.some((p) => p.status === "DISPUTED" || p.status === "FAILED")) {
      status = "NEEDS_REVIEW";
      issues.push("A payout is disputed or failed.");
    } else if (paidPayouts.length === 0) {
      status = "UNMATCHED";
      issues.push(payouts.length ? "Payout is not yet confirmed as paid." : "No payout information has been received.");
    } else {
      const payoutOk = eq(payoutNet ?? ZERO, expectedNet);
      const ledgerOk = eq(ledgerNet, payoutNet ?? ZERO);
      const bankOk = bankReceived !== null && eq(bankReceived, payoutNet ?? ZERO);
      if (!payoutOk) issues.push(`Payout net ${payoutNet?.toFixed(2)} differs from expected net ${expectedNet.toFixed(2)}.`);
      if (!ledgerOk) issues.push(`Ledger cash ${ledgerNet.toFixed(2)} differs from payout ${payoutNet?.toFixed(2)}.`);
      if (bankReceived === null) issues.push("No bank receipt recorded for this payout.");
      else if (!bankOk) issues.push(`Bank receipt ${bankReceived.toFixed(2)} differs from payout ${payoutNet?.toFixed(2)}.`);
      if (payoutOk && ledgerOk && bankOk && hasCommissionData) status = "MATCHED";
      else if (!payoutOk || !ledgerOk || (bankReceived !== null && !bankOk)) status = "NEEDS_REVIEW";
      else status = "PARTIALLY_MATCHED";
    }
  }

  return {
    reservationId,
    status,
    expectedGross: toDb(expectedGross),
    expectedCommission: toDb(expectedCommission),
    expectedNet: toDb(expectedNet),
    ledgerNet: toDb(ledgerNet),
    payoutNet: payoutNet ? toDb(payoutNet) : null,
    bankReceived: bankReceived ? toDb(bankReceived) : null,
    issues,
    payoutId: paidPayouts[0]?.id ?? payouts[0]?.id ?? null,
  };
}

export async function saveReconciliation(r: ReconciliationResult, userId?: string | null) {
  return db.reconciliationRecord.create({
    data: {
      reservationId: r.reservationId,
      payoutId: r.payoutId,
      status: r.status,
      expectedGross: r.expectedGross,
      expectedCommission: r.expectedCommission,
      expectedNet: r.expectedNet,
      ledgerNet: r.ledgerNet,
      payoutNet: r.payoutNet,
      bankReceived: r.bankReceived,
      issues: r.issues,
      reviewedById: userId ?? null,
    },
  });
}

/** Reconcile every OTA-sourced reservation created in the window. */
export async function runReconciliation(args: { from: Date; to: Date; userId?: string | null }) {
  const reservations = await db.reservation.findMany({
    where: {
      createdAt: { gte: args.from, lt: args.to },
      source: { in: ["BOOKING_COM", "AGODA", "TRIP_COM", "EXPEDIA", "OTHER"] },
      channelId: { not: null },
      deletedAt: null,
    },
    select: { id: true },
  });
  const results: ReconciliationResult[] = [];
  for (const r of reservations) {
    const result = await reconcileReservation(r.id);
    await saveReconciliation(result, args.userId);
    results.push(result);
  }
  return results;
}
