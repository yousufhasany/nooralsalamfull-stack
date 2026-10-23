import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission, can } from "@/server/auth/session";
import { getGuestDetail } from "@/server/services/reservation-query.service";
import { deleteGuestAction, updateGuestAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, reservationTone, sourceTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";

export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("guests.view");
  const { id } = await params;
  const guest = await getGuestDetail(id).catch(() => null);
  if (!guest) notFound();
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);

  return (
    <>
      <PageHeader title={`${guest.firstName} ${guest.lastName}`} description={guest.isDemo ? "DEMO record — not a real person." : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            {can(user, "guests.edit") ? (
              <ActionForm action={updateGuestAction} className="space-y-3">
                <input type="hidden" name="guestId" value={guest.id} />
                <Field label="First name" htmlFor="firstName">
                  <Input id="firstName" name="firstName" defaultValue={guest.firstName} />
                </Field>
                <Field label="Last name" htmlFor="lastName">
                  <Input id="lastName" name="lastName" defaultValue={guest.lastName} />
                </Field>
                <Field label="Email" htmlFor="email">
                  <Input id="email" name="email" defaultValue={guest.email ?? ""} />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <Input id="phone" name="phone" defaultValue={guest.phone ?? ""} />
                </Field>
                <Field label="Nationality" htmlFor="nationality">
                  <Input id="nationality" name="nationality" defaultValue={guest.nationality ?? ""} />
                </Field>
                <Field label="Notes" htmlFor="notes">
                  <Textarea id="notes" name="notes" defaultValue={guest.notes} />
                </Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm">
                {guest.email}
                <br />
                {guest.phone}
              </p>
            )}
            {guest.idLast4 ? <p className="mt-3 text-xs text-ink-500">ID on file ending {guest.idLast4} (encrypted at rest).</p> : null}
            {can(user, "guests.delete") ? (
              <ActionForm action={deleteGuestAction} className="mt-4 border-t border-sand-200 pt-4">
                <input type="hidden" name="guestId" value={guest.id} />
                <ConfirmSubmit name="go" value="1" label={t.deleteGuest} message={fmt(t.deleteGuestConfirm, { n: `${guest.firstName} ${guest.lastName}` })} />
              </ActionForm>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Reservation history" />
          <CardBody>
            <ul className="space-y-3 text-sm">
              {guest.reservations.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/reservations/${r.id}`} className="font-medium text-brand-800 hover:underline">
                    {r.number}
                  </Link>{" "}
                  <Badge tone={sourceTone[r.source]}>{label.source(r.source, locale)}</Badge>{" "}
                  <Badge tone={reservationTone[r.status]}>{label.reservationStatus(r.status, locale)}</Badge>
                  <p className="text-ink-500">
                    {formatDate(r.checkIn, locale)} → {formatDate(r.checkOut, locale)} · {formatMoney(r.totalAmount, r.currency, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
