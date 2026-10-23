import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { D, ZERO, round2, toDb } from "@/lib/money";
import { fromDate } from "@/lib/dates";
import { getHotel } from "./settings.service";
import { ledgerCharges, paymentTotals } from "./financial.service";
import { audit } from "./audit.service";

export interface InvoiceSnapshot {
  hotel: {
    nameEn: string;
    nameAr: string;
    addressEn: string;
    addressAr: string;
    phone: string;
    email: string;
    vatNumber: string;
    commercialReg: string;
  };
  guest: { name: string; email: string | null; phone: string | null; nationality: string | null };
  reservation: {
    number: string;
    source: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    rooms: string[];
  };
  taxes: { code: string; name: string; rate: string; taxableAmount: string; taxAmount: string }[];
}

async function nextInvoiceNumber(tx: Tx, year: number) {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "InvoiceCounter" ("year", "value") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "InvoiceCounter"."value" + 1
    RETURNING "value"`;
  return `NAS-INV-${year}-${String(rows[0].value).padStart(6, "0")}`;
}

/**
 * Issue an invoice for a reservation from the financial ledger. An existing ISSUED/PAID invoice is voided
 * (kept for history) and replaced, so there is always exactly one live invoice per reservation.
 */
export async function generateInvoice(reservationId: string, userId?: string | null, client?: Tx) {
  const run = async (tx: Tx) => {
    const res = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        guest: true,
        rooms: { include: { roomType: true, room: true }, orderBy: { createdAt: "asc" } },
        additionalCharges: { where: { voidedAt: null }, orderBy: { postedAt: "asc" } },
      },
    });
    if (!res) throw new AppError("NOT_FOUND", "Reservation not found.");
    const hotel = await getHotel(tx);
    const charges = await ledgerCharges(tx, reservationId);
    const { paid, refunded } = await paymentTotals(tx, reservationId);

    const prior = await tx.invoice.findMany({ where: { reservationId, status: { in: ["ISSUED", "PAID", "DRAFT"] } } });
    for (const p of prior) {
      await tx.invoice.update({ where: { id: p.id }, data: { status: "VOID", voidedAt: new Date(), voidReason: "Superseded by a new invoice" } });
    }

    // Allocate the ledger's room revenue across rooms in proportion to each room's price.
    const roomItems: { description: string; quantity: number; unitPrice: string; amount: string; kind: string }[] = [];
    const weights = res.rooms.map((r) => D(r.subtotal));
    const totalWeight = weights.reduce((a, b) => a.plus(b), ZERO);
    let allocated = ZERO;
    res.rooms.forEach((r, i) => {
      const isLast = i === res.rooms.length - 1;
      const share = totalWeight.isZero()
        ? round2(charges.revenue.div(res.rooms.length))
        : round2(charges.revenue.mul(weights[i]).div(totalWeight));
      const amount = isLast ? round2(charges.revenue.minus(allocated)) : share;
      allocated = allocated.plus(amount);
      const label = r.room ? `${r.roomType.nameEn} - Room ${r.room.number}` : r.roomType.nameEn;
      roomItems.push({
        description: `${label} (${res.nights} night${res.nights === 1 ? "" : "s"})`,
        quantity: res.nights,
        unitPrice: toDb(amount.div(Math.max(1, res.nights))),
        amount: toDb(amount),
        kind: "ROOM",
      });
    });
    const extraItems = res.additionalCharges.map((c) => ({
      description: c.description,
      quantity: c.quantity,
      unitPrice: toDb(c.unitPrice),
      amount: toDb(c.amount),
      kind: "EXTRA",
    }));
    // Extras on the invoice must equal the ledger (net of included tax); fall back to the ledger figure.
    const extrasLedger = charges.extras;
    const extrasListed = extraItems.reduce((a, e) => a.plus(e.amount), ZERO);
    if (!extrasListed.equals(extrasLedger)) {
      extraItems.splice(0, extraItems.length);
      if (!extrasLedger.isZero()) extraItems.push({ description: "Additional charges", quantity: 1, unitPrice: toDb(extrasLedger), amount: toDb(extrasLedger), kind: "EXTRA" });
    }
    const items = [...roomItems, ...extraItems];
    if (!charges.discount.isZero()) {
      items.push({ description: "Discount", quantity: 1, unitPrice: toDb(charges.discount), amount: toDb(charges.discount), kind: "DISCOUNT" });
    }

    const taxRows = await tx.taxTransaction.groupBy({
      by: ["taxCode", "taxName", "rate"],
      where: { reservationId },
      _sum: { taxAmount: true, taxableAmount: true },
    });
    const taxes = taxRows
      .filter((t) => !D(t._sum.taxAmount).isZero())
      .map((t) => ({ code: t.taxCode, name: t.taxName, rate: D(t.rate).toString(), taxableAmount: toDb(t._sum.taxableAmount ?? 0), taxAmount: toDb(t._sum.taxAmount ?? 0) }));

    const snapshot: InvoiceSnapshot = {
      hotel: {
        nameEn: hotel.nameEn,
        nameAr: hotel.nameAr,
        addressEn: hotel.addressEn,
        addressAr: hotel.addressAr,
        phone: hotel.phone,
        email: hotel.email,
        vatNumber: hotel.vatNumber,
        commercialReg: hotel.commercialReg,
      },
      guest: { name: `${res.guest.firstName} ${res.guest.lastName}`, email: res.guest.email, phone: res.guest.phone, nationality: res.guest.nationality },
      reservation: {
        number: res.number,
        source: res.source,
        checkIn: fromDate(res.checkIn),
        checkOut: fromDate(res.checkOut),
        nights: res.nights,
        rooms: res.rooms.map((r) => r.room?.number ?? r.roomType.nameEn),
      },
      taxes,
    };

    const subtotal = charges.revenue.plus(charges.extras);
    const total = round2(subtotal.plus(charges.discount).plus(charges.tax));
    const net = paid.minus(refunded);
    const number = await nextInvoiceNumber(tx, new Date().getUTCFullYear());
    const invoice = await tx.invoice.create({
      data: {
        number,
        reservationId,
        guestId: res.guestId,
        status: net.greaterThanOrEqualTo(total) && total.greaterThan(0) ? "PAID" : "ISSUED",
        currency: res.currency,
        subtotal: toDb(subtotal),
        discountTotal: toDb(charges.discount.negated()),
        taxTotal: toDb(charges.tax),
        total: toDb(total),
        paidTotal: toDb(net),
        snapshot: snapshot as object,
        createdById: userId ?? null,
        items: { create: items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
      include: { items: true },
    });
    await audit({ userId, action: "invoice.issued", entity: "Invoice", entityId: invoice.id, after: { number, total: toDb(total) } }, tx);
    return invoice;
  };
  return client ? run(client) : db.$transaction(run, { timeout: 20_000 });
}

export async function getInvoice(id: string, client: DbOrTx = db) {
  const invoice = await client.invoice.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, reservation: true } });
  if (!invoice) throw new AppError("NOT_FOUND", "Invoice not found.");
  return { ...invoice, snapshot: invoice.snapshot as unknown as InvoiceSnapshot };
}
