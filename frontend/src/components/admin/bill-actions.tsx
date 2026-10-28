"use client";

import { Button } from "@/components/ui/button";

export interface BillFile {
  number: string;
  status: string;
  hotelName: string;
  hotelNameAr: string;
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
  guest: string;
  reservation: string;
  checkIn: string;
  checkOut: string;
  items: { description: string; quantity: string; unit: string; amount: string }[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paid: string;
}

function esc(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** A standalone copy of the bill that opens in a browser without the admin screens. */
export function billDocument(bill: BillFile) {
  const rows = bill.items
    .map(
      (item) =>
        `<tr><td>${esc(item.description)}</td><td>${esc(item.quantity)}</td><td class="end">${esc(item.unit)}</td><td class="end">${esc(item.amount)}</td></tr>`,
    )
    .join("");
  const vat = bill.vatNumber ? `<br>VAT: ${esc(bill.vatNumber)}` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(bill.number)}</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c211e; margin: 32px; }
  h1 { margin: 0; font-size: 28px; }
  .muted { color: #5c6560; }
  .top { display: flex; justify-content: space-between; gap: 24px; }
  .end { text-align: end; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 32px; }
  dt { color: #5c6560; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  th, td { padding: 8px 0; border-bottom: 1px solid #eee; text-align: start; }
  .totals { margin-inline-start: auto; width: 240px; margin-top: 24px; }
  .totals p { display: flex; justify-content: space-between; margin: 4px 0; }
  .strong { font-weight: 650; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${esc(bill.hotelName)}</h1>
      <p dir="rtl">${esc(bill.hotelNameAr)}</p>
      <p class="muted">${esc(bill.address)}<br>${esc(bill.phone)} · ${esc(bill.email)}${vat}</p>
    </div>
    <div class="end">
      <p class="muted">Invoice</p>
      <p class="strong">${esc(bill.number)}</p>
      <p class="muted">${esc(bill.status)}</p>
    </div>
  </div>
  <dl>
    <div><dt>Guest</dt><dd>${esc(bill.guest)}</dd></div>
    <div><dt>Reservation</dt><dd>${esc(bill.reservation)}</dd></div>
    <div><dt>Check-in</dt><dd>${esc(bill.checkIn)}</dd></div>
    <div><dt>Check-out</dt><dd>${esc(bill.checkOut)}</dd></div>
  </dl>
  <table>
    <thead><tr><th>Description</th><th>Qty</th><th class="end">Unit</th><th class="end">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <p><span>Subtotal</span><span>${esc(bill.subtotal)}</span></p>
    <p><span>Discount</span><span>${esc(bill.discount)}</span></p>
    <p><span>Tax</span><span>${esc(bill.tax)}</span></p>
    <p class="strong"><span>Total</span><span>${esc(bill.total)}</span></p>
    <p><span>Paid</span><span>${esc(bill.paid)}</span></p>
  </div>
</body>
</html>`;
}

export function BillActions({ bill }: { bill: BillFile }) {
  function download() {
    const blob = new Blob([billDocument(bill)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bill.number}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button type="button" onClick={() => window.print()}>
        Print
      </Button>
      <Button type="button" variant="outline" onClick={download}>
        Download
      </Button>
    </div>
  );
}
