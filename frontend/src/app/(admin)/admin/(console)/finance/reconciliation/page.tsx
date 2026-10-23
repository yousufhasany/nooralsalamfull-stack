import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { startOfMonth, todayIn, fromDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { reconcileOneAction, runReconciliationAction } from "@/app/(admin)/admin/actions/finance";
import { adminMessages } from "@/i18n/admin";

const tone: Record<string, "green" | "amber" | "red" | "neutral"> = {
  MATCHED: "green",
  PARTIALLY_MATCHED: "amber",
  UNMATCHED: "red",
  NEEDS_REVIEW: "amber",
};

export default async function ReconciliationPage() {
  const user = await requirePagePermission("reconciliation.view");
  const hotel = await getHotel();
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const today = todayIn(hotel.timezone);
  const records = await db.reconciliationRecord.findMany({
    include: { reservation: true, payout: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const ota = await db.reservation.findMany({
    where: { source: { in: ["BOOKING_COM", "AGODA", "TRIP_COM", "EXPEDIA"] }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, number: true, source: true, totalAmount: true, paymentStatus: true, paymentCollection: true },
  });

  return (
    <ReadOnly locked={!can(user, "reconciliation.manage")} notice={t.viewOnly}>
    <>
      <PageHeader
        title="OTA reconciliation"
        description="Compare OTA reservation, commission, payout, hotel ledger and bank receipt. Never mark matched unless the figures agree."
      />
      <Card className="mb-6">
        <CardHeader title="Run period" />
        <CardBody>
          <ActionForm action={runReconciliationAction} className="flex flex-wrap items-end gap-3">
            <Field label="From" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={startOfMonth(today)} required />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={today} required />
            </Field>
            <SubmitButton>Reconcile period</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card className="mb-6">
        <CardHeader title="OTA reservations without a recent review" />
        <CardBody className="space-y-2">
          {ota.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {r.number} · {label.source(r.source, locale)} · {formatMoney(r.totalAmount, hotel.currency, locale)} · {label.paymentStatus(r.paymentStatus, locale)}
              </span>
              <ActionForm action={reconcileOneAction}>
                <input type="hidden" name="reservationId" value={r.id} />
                <SubmitButton variant="outline">Review</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Saved reviews" />
        <CardBody>
          <ul className="space-y-3 text-sm">
            {records.map((r) => (
              <li key={r.id} className="rounded-xl border border-sand-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a className="font-medium text-brand-800 hover:underline" href={`/admin/reservations/${r.reservationId}`}>
                    {r.reservation.number}
                  </a>
                  <Badge tone={tone[r.status]}>{label.reconciliation(r.status, locale)}</Badge>
                  <span className="text-ink-500">{fromDate(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-ink-600">
                  Expected net {formatMoney(r.expectedNet, hotel.currency, locale)} · ledger {formatMoney(r.ledgerNet, hotel.currency, locale)}
                  {r.payoutNet ? ` · payout ${formatMoney(r.payoutNet, hotel.currency, locale)}` : ""}
                  {r.bankReceived ? ` · bank ${formatMoney(r.bankReceived, hotel.currency, locale)}` : ""}
                </p>
                {Array.isArray(r.issues) && (r.issues as string[]).length ? (
                  <ul className="mt-1 list-disc ps-5 text-warn-600">
                    {(r.issues as string[]).map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
    </ReadOnly>
  );
}
