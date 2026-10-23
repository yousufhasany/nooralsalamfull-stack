import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { inventorySnapshot, valuation } from "@/server/services/inventory.service";
import { D } from "@/lib/money";

function csv(rows: string[][]) {
  return rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function range(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) createdAt.gte = new Date(`${from}T00:00:00+03:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) createdAt.lte = new Date(`${to}T23:59:59+03:00`);
  return Object.keys(createdAt).length ? createdAt : undefined;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "inventory.view")) return new NextResponse("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "stock";
  const createdAt = range(url);
  const hotel = await getHotel();
  const snap = await inventorySnapshot(hotel.id);
  let rows: string[][] = [["report", kind]];
  if (kind === "stock" || kind === "low") {
    rows = [["sku", "nameEn", "nameAr", "unit", "onHand", "reorder", "unitCostSAR", "valueSAR", "expiry"]];
    for (const r of snap.rows) {
      if (kind === "low" && !r.low) continue;
      rows.push([r.item.sku, r.item.nameEn, r.item.nameAr, r.item.unit, r.qty.toFixed(3), r.item.reorderQty.toString(), r.item.unitCost.toString(), r.value.toFixed(2), r.item.expiryDate?.toISOString().slice(0, 10) ?? ""]);
    }
  } else if (kind === "movements") {
    const list = await db.inventoryMovement.findMany({ where: { item: { hotelId: hotel.id }, ...(createdAt ? { createdAt } : {}) }, include: { item: true }, orderBy: { createdAt: "desc" }, take: 5000 });
    rows = [["when", "sku", "type", "quantity", "unitCostSAR", "balanceAfter", "reference", "note"]];
    for (const m of list) rows.push([m.createdAt.toISOString(), m.item.sku, m.type, m.quantity.toString(), m.unitCost.toString(), m.balanceAfter.toString(), m.reference, m.note]);
  } else if (kind === "consumption") {
    const list = await db.inventoryConsumption.findMany({
      where: { task: { room: { hotelId: hotel.id } }, ...(createdAt ? { createdAt } : {}) },
      include: { item: true, task: { include: { room: true, assignedTo: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    rows = [["when", "room", "employee", "sku", "nameEn", "quantity", "department"]];
    for (const row of list) rows.push([row.createdAt.toISOString(), row.task.room.number, row.task.assignedTo?.name ?? "", row.item.sku, row.item.nameEn, row.quantity.toString(), "HOUSEKEEPING"]);
  } else if (kind === "purchases") {
    const list = await db.purchaseOrder.findMany({ where: { hotelId: hotel.id, ...(createdAt ? { createdAt } : {}) }, include: { supplier: true, items: true } });
    rows = [["number", "supplier", "status", "orderDate", "lines", "valueSAR"]];
    for (const o of list) {
      const value = o.items.reduce((s, i) => s.plus(valuation(i.quantity, i.unitCost)), D(0));
      rows.push([o.number, o.supplier.name, o.status, o.orderDate.toISOString().slice(0, 10), String(o.items.length), value.toFixed(2)]);
    }
  } else if (kind === "adjustments") {
    const list = await db.stockAdjustment.findMany({ where: { item: { hotelId: hotel.id }, ...(createdAt ? { createdAt } : {}) }, include: { item: true } });
    rows = [["when", "item", "previous", "adjusted", "status", "reason"]];
    for (const a of list) rows.push([a.createdAt.toISOString(), a.item.sku, a.previousQty.toString(), a.adjustedQty.toString(), a.status, a.reason]);
  } else if (kind === "transfers") {
    const list = await db.stockTransfer.findMany({ where: { hotelId: hotel.id, ...(createdAt ? { createdAt } : {}) }, include: { fromLocation: true, toLocation: true } });
    rows = [["number", "from", "to", "status", "created"]];
    for (const t of list) rows.push([t.number, t.fromLocation.nameEn, t.toLocation.nameEn, t.status, t.createdAt.toISOString()]);
  }
  return new NextResponse(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${kind}.csv"` } });
}
