import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/session";
import { getInvoice } from "@/server/services/invoice.service";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "@/components/site/print-button";

export default async function InvoicePage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  await requirePagePermission("invoices.view");
  const { invoiceId } = await params;
  const invoice = await getInvoice(invoiceId).catch(() => null);
  if (!invoice) notFound();
  const snap = invoice.snapshot;
  const money = (v: unknown) => formatMoney(v as string, invoice.currency, "en");

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-900">{snap.hotel.nameEn}</h1>
          <p className="text-sm text-ink-500" dir="rtl">
            {snap.hotel.nameAr}
          </p>
          <p className="mt-2 text-sm text-ink-600">
            {snap.hotel.addressEn}
            <br />
            {snap.hotel.phone} · {snap.hotel.email}
            {snap.hotel.vatNumber ? (
              <>
                <br />
                VAT: {snap.hotel.vatNumber}
              </>
            ) : null}
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs uppercase tracking-wide text-ink-500">Invoice</p>
          <p className="font-semibold">{invoice.number}</p>
          <p className="text-sm text-ink-500">{invoice.status}</p>
          <PrintButton label="Print" />
        </div>
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-ink-500">Guest</dt>
          <dd>{snap.guest.name}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Reservation</dt>
          <dd>{snap.reservation.number}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Check-in</dt>
          <dd>{snap.reservation.checkIn}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Check-out</dt>
          <dd>{snap.reservation.checkOut}</dd>
        </div>
      </dl>
      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-sand-200 text-start text-xs uppercase text-ink-500">
            <th className="py-2">Description</th>
            <th>Qty</th>
            <th className="text-end">Unit</th>
            <th className="text-end">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b border-sand-100">
              <td className="py-2">{item.description}</td>
              <td>{item.quantity}</td>
              <td className="text-end tabular-nums">{money(item.unitPrice)}</td>
              <td className="text-end tabular-nums">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 ms-auto max-w-xs space-y-1 text-sm">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(invoice.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums">{money(invoice.discountTotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Tax</span>
          <span className="tabular-nums">{money(invoice.taxTotal)}</span>
        </p>
        <p className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(invoice.total)}</span>
        </p>
        <p className="flex justify-between text-ink-500">
          <span>Paid</span>
          <span className="tabular-nums">{money(invoice.paidTotal)}</span>
        </p>
      </div>
    </div>
  );
}
