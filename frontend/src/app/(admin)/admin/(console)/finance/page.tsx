import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { revenueByChannel } from "@/server/services/financial.service";
import { startOfMonth, endOfMonthExclusive, todayIn, toDate, addDays, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { markPayoutPaidAction, recordBankReceiptAction } from "@/app/(admin)/admin/actions/finance";
import { adminMessages } from "@/i18n/admin";

export default async function FinancePage() {
  const user = await requirePagePermission("finance.view");
  const hotel = await getHotel();
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const today = todayIn(hotel.timezone);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonthExclusive(today);
  const [
    revenue,
    todayRev,
    refunds,
    hotelCash,
    payouts,
    commissions,
  ] = await Promise.all([
    revenueByChannel({ from: toDate(monthStart), to: toDate(monthEnd) }),
    db.financialTransaction.aggregate({
      where: { category: "REVENUE", postedAt: { gte: toDate(today), lt: toDate(addDays(today, 1)) } },
      _sum: { amount: true },
    }),
    db.refund.aggregate({ where: { refundedAt: { gte: toDate(monthStart), lt: toDate(monthEnd) }, status: "COMPLETED" }, _sum: { amount: true } }),
    db.payment.aggregate({
      where: { status: "SUCCEEDED", collectionMethod: { in: ["HOTEL_COLLECTED", "PAY_AT_HOTEL", "ONLINE_PAYMENT", "BANK_TRANSFER"] }, receivedAt: { gte: toDate(monthStart), lt: toDate(monthEnd) } },
      _sum: { amount: true },
    }),
    db.oTAPayout.findMany({ include: { channel: true, reservation: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.oTACommission.aggregate({ where: { createdAt: { gte: toDate(monthStart), lt: toDate(monthEnd) } }, _sum: { commissionAmount: true } }),
  ]);
  const money = (v: unknown) => formatMoney(v as string, hotel.currency, locale);
  const pendingPayouts = payouts.filter((p) => p.status === "PENDING" || p.status === "PROCESSING");

  return (
    <>
      <PageHeader title="Finance" description="Figures come from the ledger, payments, commissions and payouts. A reservation is not automatically a payment." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's revenue" value={money(todayRev._sum.amount)} />
        <Stat label="Hotel-collected (MTD)" value={money(hotelCash._sum.amount)} />
        <Stat label="OTA commissions (MTD)" value={money(commissions._sum.commissionAmount)} />
        <Stat label="Refunds (MTD)" value={money(refunds._sum.amount)} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Revenue by channel this month" description="Gross / commission / net from ledger postings only." />
        <CardBody>
          {revenue.length === 0 ? (
            <p className="text-sm text-ink-500">No ledger revenue in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs uppercase text-ink-500">
                  <th className="py-2">Channel</th>
                  <th className="text-end">Gross</th>
                  <th className="text-end">Commission</th>
                  <th className="text-end">Net</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map((r) => (
                  <tr key={r.source} className="border-t border-sand-200">
                    <td className="py-2">{label.source(r.source, locale)}</td>
                    <td className="text-end tabular-nums">{money(r.gross)}</td>
                    <td className="text-end tabular-nums">{money(r.commission)}</td>
                    <td className="text-end tabular-nums">{money(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <ReadOnly locked={!can(user, "finance.manage")} notice={adminMessages(locale).viewOnly}>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Record bank receipt" />
          <CardBody>
            <ActionForm action={recordBankReceiptAction} className="space-y-3">
              <Field label="Amount" htmlFor="amount">
                <Input id="amount" name="amount" inputMode="decimal" required />
              </Field>
              <Field label="Received on" htmlFor="receivedOn">
                <Input id="receivedOn" name="receivedOn" type="date" required />
              </Field>
              <Field label="Link to payout (optional)" htmlFor="payoutId">
                <Select id="payoutId" name="payoutId">
                  <option value="">None</option>
                  {payouts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.channel.name} {p.netAmount.toString()} {p.externalPayoutId ?? p.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bank" htmlFor="bankName">
                <Input id="bankName" name="bankName" />
              </Field>
              <Field label="Reference" htmlFor="reference">
                <Input id="reference" name="reference" />
              </Field>
              <SubmitButton>Record receipt</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="OTA payouts" description={`${pendingPayouts.length} pending. Mark paid only when the bank actually received the money.`} />
          <CardBody className="space-y-3">
            {payouts.length === 0 ? <p className="text-sm text-ink-500">No payout records yet.</p> : null}
            {payouts.map((p) => (
              <div key={p.id} className="rounded-xl border border-sand-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.channel.name}</strong>
                  <Badge>{label.payout(p.status, locale)}</Badge>
                  <span className="tabular-nums">{money(p.netAmount)}</span>
                </div>
                <p className="text-ink-500">
                  Gross {money(p.grossAmount)} · Commission {money(p.commissionAmount)}
                  {p.reservation ? ` · ${p.reservation.number}` : ""}
                  {p.expectedPayoutDate ? ` · expected ${formatDate(p.expectedPayoutDate, locale)}` : ""}
                </p>
                {p.status !== "PAID" ? (
                  <ActionForm action={markPayoutPaidAction} className="mt-2 flex gap-2">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <Input type="date" name="payoutDate" required defaultValue={today} className="h-9 w-40" />
                    <SubmitButton variant="outline">Mark paid</SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      </ReadOnly>
    </>
  );
}
