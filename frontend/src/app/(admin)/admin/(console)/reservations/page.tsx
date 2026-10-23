import Link from "next/link";
import { requirePagePermission } from "@/server/auth/session";
import { listReservations } from "@/server/services/reservation-query.service";
import { deleteReservationAction } from "@/app/(admin)/admin/actions/reservations";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit } from "@/components/admin/form-status";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";
import { pick } from "@/i18n/config";
import { label } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader, Pager } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge, paymentTone, reservationTone, sourceTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/server/auth/session";
import type { PaymentStatus, ReservationSource, ReservationStatus } from "@/generated/prisma/enums";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ReservationsPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePagePermission("reservations.view");
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const q = await searchParams;
  const get = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const data = await listReservations({
    q: get("q"),
    status: get("status") as ReservationStatus | undefined,
    source: get("source") as ReservationSource | undefined,
    paymentStatus: get("payment") as PaymentStatus | undefined,
    from: get("from"),
    to: get("to"),
    page: Number(get("page") ?? 1),
    sort: (get("sort") as "createdAt" | "checkIn" | "checkOut" | "totalAmount") ?? "createdAt",
  });

  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (typeof v === "string" && k !== "page") p.set(k, v);
    p.set("page", String(page));
    return `/admin/reservations?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t.reservations}
        description={t.reservationsIntro}
        action={
          can(user, "reservations.create") ? (
            <Link href="/admin/reservations/new" className={buttonVariants()}>
              {t.newReservation}
            </Link>
          ) : null
        }
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <Input name="q" placeholder={t.searchReservations} defaultValue={get("q")} className="lg:col-span-2" />
        <Select name="status" defaultValue={get("status") ?? ""}>
          <option value="">{t.allStatuses}</option>
          {Object.keys(reservationTone).map((s) => (
            <option key={s} value={s}>
              {label.reservationStatus(s, locale)}
            </option>
          ))}
        </Select>
        <Select name="source" defaultValue={get("source") ?? ""}>
          <option value="">{t.allChannels}</option>
          {Object.keys(sourceTone).map((s) => (
            <option key={s} value={s}>
              {label.source(s, locale)}
            </option>
          ))}
        </Select>
        <Select name="payment" defaultValue={get("payment") ?? ""}>
          <option value="">{t.allPayments}</option>
          {Object.keys(paymentTone).map((s) => (
            <option key={s} value={s}>
              {label.paymentStatus(s, locale)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input type="date" name="from" defaultValue={get("from")} aria-label={t.dateFrom} />
          <Input type="date" name="to" defaultValue={get("to")} aria-label={t.dateTo} />
        </div>
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          {t.apply}
        </button>
      </form>
      <DataTable
        caption={t.reservations}
        rows={data.rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title={t.none} text={t.emptyReservations} />}
        columns={[
          {
            key: "number",
            header: t.reservation,
            cell: (r) => (
              <Link href={`/admin/reservations/${r.id}`} className="font-medium text-brand-800 hover:underline">
                {r.number}
              </Link>
            ),
          },
          {
            key: "guest",
            header: t.guest,
            cell: (r) => (
              <span>
                {r.guest.firstName} {r.guest.lastName}
              </span>
            ),
          },
          {
            key: "source",
            header: t.channel,
            cell: (r) => <Badge tone={sourceTone[r.source]}>{label.source(r.source, locale)}</Badge>,
          },
          {
            key: "dates",
            header: t.stay,
            cell: (r) => (
              <span className="text-ink-600">
                {formatDate(r.checkIn, locale)} → {formatDate(r.checkOut, locale)}
              </span>
            ),
            hideOnMobile: true,
          },
          {
            key: "rooms",
            header: t.rooms,
            cell: (r) => r.rooms.map((x) => x.room?.number ?? pick(x.roomType, "name", locale)).join(", "),
            hideOnMobile: true,
          },
          {
            key: "status",
            header: t.status,
            cell: (r) => <Badge tone={reservationTone[r.status]}>{label.reservationStatus(r.status, locale)}</Badge>,
          },
          {
            key: "pay",
            header: t.payment,
            cell: (r) => <Badge tone={paymentTone[r.paymentStatus]}>{label.paymentStatus(r.paymentStatus, locale)}</Badge>,
          },
          {
            key: "total",
            header: t.total,
            align: "end",
            cell: (r) => <span className="tabular-nums">{formatMoney(r.totalAmount, r.currency, locale)}</span>,
          },
          {
            key: "delete",
            header: "",
            cell: (r) =>
              can(user, "reservations.delete") ? (
                <ActionForm action={deleteReservationAction}>
                  <input type="hidden" name="reservationId" value={r.id} />
                  <ConfirmSubmit name="go" value="1" label={t.delete} message={fmt(t.deleteReservationConfirm, { n: r.number })} />
                </ActionForm>
              ) : null,
          },
        ]}
      />
      <Pager page={data.page} pages={data.pages} href={href} labels={{ previous: t.previous, next: t.next, page: fmt(t.pageOf, { page: data.page, pages: data.pages }) }} />
    </>
  );
}
