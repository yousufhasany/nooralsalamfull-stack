import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission, can } from "@/server/auth/session";
import { getReservationDetail } from "@/server/services/reservation-query.service";
import { findAssignableRooms } from "@/server/services/availability.service";
import { getReservationBalance } from "@/server/services/financial.service";
import { db } from "@/server/db/client";
import { fromDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { label } from "@/lib/labels";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { Badge, paymentTone, reservationTone, sourceTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import {
  addChargeAction,
  addNoteAction,
  assignRoomAction,
  cancelReservationAction,
  deleteReservationAction,
  checkInAction,
  checkOutAction,
  confirmReservationAction,
  issueInvoiceAction,
  modifyReservationAction,
  recordPaymentAction,
  refundPaymentAction,
  resolveModificationAction,
  setCollectionAction,
  updateReservationGuestAction,
  voidChargeAction,
} from "@/app/(admin)/admin/actions/reservations";

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("reservations.view");
  const { id } = await params;
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const res = await getReservationDetail(id).catch(() => null);
  if (!res) notFound();
  const money = (v: unknown) => formatMoney(v as string, res.currency, locale);
  const balance = await getReservationBalance(db, res.id);
  const roomTypes = await db.roomType.findMany({ where: { deletedAt: null }, orderBy: { nameEn: "asc" } });
  const assignable = await Promise.all(
    res.rooms.map(async (rr) => ({
      id: rr.id,
      rooms: await findAssignableRooms(db, {
        roomTypeId: rr.roomTypeId,
        checkIn: fromDate(rr.checkIn),
        checkOut: fromDate(rr.checkOut),
        excludeReservationRoomId: rr.id,
      }),
    })),
  );
  const assignMap = Object.fromEntries(assignable.map((a) => [a.id, a.rooms]));

  return (
    <>
      <PageHeader
        title={res.number}
        description={`${res.guest.firstName} ${res.guest.lastName} · ${formatDate(res.checkIn, locale)} → ${formatDate(res.checkOut, locale)} · ${res.nights} nights`}
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={sourceTone[res.source]}>{label.source(res.source, locale)}</Badge>
            <Badge tone={reservationTone[res.status]}>{label.reservationStatus(res.status, locale)}</Badge>
            <Badge tone={paymentTone[res.paymentStatus]}>{label.paymentStatus(res.paymentStatus, locale)}</Badge>
          </div>
        }
      />

      {res.isOverbooked ? (
        <p className="mb-4 rounded-lg border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          This booking was accepted from a channel after local inventory was already full. Verify rooms before check-in.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Stay" description={`${label.collection(res.paymentCollection, locale)} · Total ${money(res.totalAmount)} · Paid ${money(res.paidAmount)} · Balance ${money(balance.balance)}`} />
            <CardBody className="space-y-4">
              <ul className="space-y-3 text-sm">
                {res.rooms.map((rr) => (
                  <li key={rr.id} className="rounded-xl border border-sand-200 p-3">
                    <p className="font-medium">
                      {rr.roomType.nameEn} {rr.room ? `· Room ${rr.room.number}` : "· unassigned"}
                    </p>
                    <p className="text-ink-500">
                      {rr.adults} adults, {rr.children} children · {money(rr.subtotal)}
                    </p>
                    {can(user, "reservations.edit") && res.status !== "CHECKED_OUT" && res.status !== "CANCELLED" ? (
                      <ActionForm action={assignRoomAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="reservationId" value={res.id} />
                        <input type="hidden" name="reservationRoomId" value={rr.id} />
                        <Select name="roomId" defaultValue={rr.roomId ?? ""} className="max-w-xs">
                          <option value="">Assign room…</option>
                          {assignMap[rr.id]?.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.number} (fl. {room.floor})
                            </option>
                          ))}
                        </Select>
                        <SubmitButton variant="outline">Assign</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>

              {can(user, "reservations.edit") && ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(res.status) ? (
                <ActionForm action={modifyReservationAction} className="grid gap-3 sm:grid-cols-2 border-t border-sand-200 pt-4">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <input type="hidden" name="reservationRoomId" value={res.rooms[0]?.id ?? ""} />
                  <Field label="Check-in" htmlFor="checkIn">
                    <Input id="checkIn" name="checkIn" type="date" defaultValue={fromDate(res.checkIn)} />
                  </Field>
                  <Field label="Check-out" htmlFor="checkOut">
                    <Input id="checkOut" name="checkOut" type="date" defaultValue={fromDate(res.checkOut)} />
                  </Field>
                  <Field label="Adults" htmlFor="adults">
                    <Input id="adults" name="adults" type="number" defaultValue={res.adults} />
                  </Field>
                  <Field label="Children" htmlFor="children">
                    <Input id="children" name="children" type="number" defaultValue={res.children} />
                  </Field>
                  <Field label="Change first room type" htmlFor="roomTypeId" className="sm:col-span-2">
                    <Select id="roomTypeId" name="roomTypeId" defaultValue="">
                      <option value="">Keep current</option>
                      {roomTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.nameEn}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Special requests" htmlFor="specialRequests" className="sm:col-span-2">
                    <Textarea id="specialRequests" name="specialRequests" defaultValue={res.specialRequests} />
                  </Field>
                  <Field label="Internal notes" htmlFor="internalNotes" className="sm:col-span-2">
                    <Textarea id="internalNotes" name="internalNotes" defaultValue={res.internalNotes} />
                  </Field>
                  <SubmitButton>Save stay changes</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Front desk" />
            <CardBody className="space-y-6">
              {res.status === "PENDING" && can(user, "reservations.edit") ? (
                <ActionForm action={confirmReservationAction}>
                  <input type="hidden" name="reservationId" value={res.id} />
                  <SubmitButton>Confirm reservation</SubmitButton>
                </ActionForm>
              ) : null}

              {res.status === "CONFIRMED" && can(user, "reservations.checkin") ? (
                <ActionForm action={checkInAction} className="space-y-3">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="guestVerified" required /> Guest identity verified
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="allowEarly" /> Allow early arrival
                  </label>
                  {res.rooms.map((rr) => (
                    <Field key={rr.id} label={`Room for ${rr.roomType.nameEn}`} htmlFor={`assign-${rr.id}`}>
                      <Select id={`assign-${rr.id}`} name={`assign:${rr.id}`} defaultValue={rr.roomId ?? ""}>
                        <option value="">Auto-assign a ready room</option>
                        {assignMap[rr.id]?.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.number}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Deposit (optional)" htmlFor="depositAmount">
                      <Input id="depositAmount" name="depositAmount" inputMode="decimal" />
                    </Field>
                    <Field label="Deposit method" htmlFor="depositSource">
                      <Select id="depositSource" name="depositSource" defaultValue="HOTEL_CASH">
                        <option value="HOTEL_CASH">Cash</option>
                        <option value="HOTEL_CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank</option>
                      </Select>
                    </Field>
                    <Field label="Reference" htmlFor="depositReference">
                      <Input id="depositReference" name="depositReference" />
                    </Field>
                  </div>
                  <SubmitButton>Check in</SubmitButton>
                </ActionForm>
              ) : null}

              {res.status === "CHECKED_IN" && can(user, "reservations.checkout") ? (
                <ActionForm action={checkOutAction} className="space-y-3">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <p className="text-sm text-ink-600">
                    Balance due: <strong>{money(balance.balance)}</strong>. Room will become Dirty after check-out.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Collect now" htmlFor="paymentAmount">
                      <Input id="paymentAmount" name="paymentAmount" inputMode="decimal" defaultValue={balance.balance.greaterThan(0) ? balance.balance.toFixed(2) : ""} />
                    </Field>
                    <Field label="Method" htmlFor="paymentSource">
                      <Select id="paymentSource" name="paymentSource" defaultValue="HOTEL_CASH">
                        <option value="HOTEL_CASH">Cash</option>
                        <option value="HOTEL_CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank</option>
                      </Select>
                    </Field>
                    <Field label="Reference" htmlFor="paymentReference">
                      <Input id="paymentReference" name="paymentReference" />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="allowOutstanding" /> Allow outstanding balance (manager decision)
                  </label>
                  <SubmitButton>Check out & issue invoice</SubmitButton>
                </ActionForm>
              ) : null}

              {can(user, "reservations.cancel") && ["PENDING", "CONFIRMED"].includes(res.status) ? (
                <ActionForm action={cancelReservationAction} className="grid gap-3 sm:grid-cols-2 border-t border-sand-200 pt-4">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <Field label="Reason" htmlFor="reason" required className="sm:col-span-2">
                    <Input id="reason" name="reason" required />
                  </Field>
                  <Field label="Cancellation fee (only if policy / OTA states one)" htmlFor="cancellationFee">
                    <Input id="cancellationFee" name="cancellationFee" inputMode="decimal" />
                  </Field>
                  <Field label="Result" htmlFor="newStatus">
                    <Select id="newStatus" name="newStatus" defaultValue="CANCELLED">
                      <option value="CANCELLED">Cancelled</option>
                      <option value="NO_SHOW">No-show</option>
                    </Select>
                  </Field>
                  <ConfirmSubmit name="go" value="1" label="Cancel reservation" message="Cancel this reservation and release inventory?" />
                </ActionForm>
              ) : null}
              {can(user, "reservations.delete") ? (
                <ActionForm action={deleteReservationAction} className="border-t border-sand-200 pt-4">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <ConfirmSubmit name="go" value="1" label={t.deleteReservation} message={fmt(t.deleteReservationConfirm, { n: res.number })} />
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Charges, payments and invoices" />
            <CardBody className="space-y-6">
              <ul className="text-sm">
                {res.additionalCharges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 py-2">
                    <span className={c.voidedAt ? "text-ink-400 line-through" : ""}>
                      {c.description} × {c.quantity} = {money(c.amount)}
                    </span>
                    {!c.voidedAt && can(user, "reservations.edit") ? (
                      <ActionForm action={voidChargeAction} className="flex items-center gap-2">
                        <input type="hidden" name="reservationId" value={res.id} />
                        <input type="hidden" name="chargeId" value={c.id} />
                        <Input name="reason" placeholder="Reason" required className="h-9 w-40" />
                        <SubmitButton variant="outline">Void</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
              {can(user, "reservations.edit") && res.status !== "CANCELLED" ? (
                <ActionForm action={addChargeAction} className="grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <Field label="Charge" htmlFor="description" className="sm:col-span-2">
                    <Input id="description" name="description" required />
                  </Field>
                  <Field label="Qty" htmlFor="quantity">
                    <Input id="quantity" name="quantity" type="number" defaultValue={1} />
                  </Field>
                  <Field label="Unit price" htmlFor="unitPrice">
                    <Input id="unitPrice" name="unitPrice" inputMode="decimal" required />
                  </Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-4">
                    <input type="checkbox" name="isTaxable" defaultChecked /> Taxable
                  </label>
                  <SubmitButton>Add charge</SubmitButton>
                </ActionForm>
              ) : null}

              <ul className="text-sm">
                {res.payments.map((p) => (
                  <li key={p.id} className="border-b border-sand-100 py-2">
                    {money(p.amount)} · {label.paymentSource(p.source, locale)} · {label.collection(p.collectionMethod, locale)} · {p.status}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {can(user, "payments.refund") && p.status === "SUCCEEDED" ? (
                      <ActionForm action={refundPaymentAction} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="reservationId" value={res.id} />
                        <input type="hidden" name="paymentId" value={p.id} />
                        <Input name="amount" placeholder="Amount" className="h-9 w-28" required />
                        <Input name="reason" placeholder="Reason" className="h-9 w-40" required />
                        <SubmitButton variant="outline">Refund</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
              {can(user, "payments.record") && res.status !== "CANCELLED" ? (
                <ActionForm action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <Field label="Amount" htmlFor="amount">
                    <Input id="amount" name="amount" inputMode="decimal" required />
                  </Field>
                  <Field label="Source" htmlFor="source">
                    <Select id="source" name="source" defaultValue="HOTEL_CASH">
                      <option value="HOTEL_CASH">Hotel cash</option>
                      <option value="HOTEL_CARD">Hotel card</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="DIRECT_WEBSITE">Direct website</option>
                    </Select>
                  </Field>
                  <Field label="Collection" htmlFor="collectionMethod">
                    <Select id="collectionMethod" name="collectionMethod" defaultValue="HOTEL_COLLECTED">
                      <option value="HOTEL_COLLECTED">Hotel collected</option>
                      <option value="PAY_AT_HOTEL">Pay at hotel</option>
                      <option value="ONLINE_PAYMENT">Online</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="OTA_COLLECTED">OTA collected (no hotel cash)</option>
                    </Select>
                  </Field>
                  <Field label="Reference" htmlFor="reference">
                    <Input id="reference" name="reference" />
                  </Field>
                  <SubmitButton>Record payment</SubmitButton>
                </ActionForm>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                {can(user, "invoices.view") ? (
                  <ActionForm action={issueInvoiceAction}>
                    <input type="hidden" name="reservationId" value={res.id} />
                    <SubmitButton variant="outline">Issue / refresh invoice</SubmitButton>
                  </ActionForm>
                ) : null}
                {res.invoices.map((inv) => (
                  <Link key={inv.id} href={`/admin/reservations/${res.id}/invoice/${inv.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    {inv.number} ({inv.status})
                  </Link>
                ))}
              </div>

              <ActionForm action={setCollectionAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="reservationId" value={res.id} />
                <Field label="Payment collection method" htmlFor="paymentCollection">
                  <Select id="paymentCollection" name="paymentCollection" defaultValue={res.paymentCollection}>
                    <option value="PAY_AT_HOTEL">Pay at hotel</option>
                    <option value="HOTEL_COLLECTED">Hotel collected</option>
                    <option value="OTA_COLLECTED">OTA collected</option>
                    <option value="ONLINE_PAYMENT">Online payment</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="UNKNOWN">Unknown</option>
                  </Select>
                </Field>
                <SubmitButton variant="outline">Update</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Financial ledger (append-only)" description="Corrections create new rows. History is never overwritten." />
            <CardBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase text-ink-500">
                    <th className="py-1">When</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th className="text-end">Amount</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {res.transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-sand-100">
                      <td className="py-1.5 text-ink-500">{formatDateTime(tx.postedAt, locale)}</td>
                      <td>{tx.type}</td>
                      <td>{tx.category}</td>
                      <td className="text-end tabular-nums">{money(tx.amount)}</td>
                      <td className="text-ink-500">{tx.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Guest" action={<Link href={`/admin/guests/${res.guest.id}`} className="text-sm text-brand-800 hover:underline">Profile</Link>} />
            <CardBody>
              {can(user, "guests.edit") ? (
                <ActionForm action={updateReservationGuestAction} className="space-y-3">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <input type="hidden" name="guestId" value={res.guest.id} />
                  <Field label="First name" htmlFor="g-first">
                    <Input id="g-first" name="firstName" defaultValue={res.guest.firstName} />
                  </Field>
                  <Field label="Last name" htmlFor="g-last">
                    <Input id="g-last" name="lastName" defaultValue={res.guest.lastName} />
                  </Field>
                  <Field label="Email" htmlFor="g-email">
                    <Input id="g-email" name="email" defaultValue={res.guest.email ?? ""} />
                  </Field>
                  <Field label="Phone" htmlFor="g-phone">
                    <Input id="g-phone" name="phone" defaultValue={res.guest.phone ?? ""} />
                  </Field>
                  <Field label="Nationality" htmlFor="g-nat">
                    <Input id="g-nat" name="nationality" defaultValue={res.guest.nationality ?? ""} />
                  </Field>
                  <SubmitButton variant="outline">Save guest</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm">
                  {res.guest.firstName} {res.guest.lastName}
                  <br />
                  {res.guest.email}
                  <br />
                  {res.guest.phone}
                </p>
              )}
            </CardBody>
          </Card>

          {res.channel || res.externalReservationId ? (
            <Card>
              <CardHeader title="Channel" />
              <CardBody className="space-y-1 text-sm">
                <p>{res.channel?.name ?? label.source(res.source, locale)}</p>
                {res.externalReservationId ? <p>External ID: {res.externalReservationId}</p> : null}
                {res.otaCommissions.map((c) => (
                  <p key={c.id}>
                    Commission {money(c.commissionAmount)} of {money(c.grossAmount)} ({c.status})
                  </p>
                ))}
                {res.otaPayouts.map((p) => (
                  <p key={p.id}>
                    Payout {money(p.netAmount)} · {label.payout(p.status, locale)}
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <ul className="mb-3 space-y-2 text-sm">
                {res.notes.map((n) => (
                  <li key={n.id}>
                    <span className="text-ink-500">{n.authorName}:</span> {n.body}
                  </li>
                ))}
              </ul>
              {can(user, "reservations.edit") ? (
                <ActionForm action={addNoteAction} className="space-y-2">
                  <input type="hidden" name="reservationId" value={res.id} />
                  <Textarea name="body" required />
                  <SubmitButton variant="outline">Add note</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          {res.modificationRequests.length > 0 ? (
            <Card>
              <CardHeader title="Modification requests" />
              <CardBody className="space-y-3">
                {res.modificationRequests.map((m) => (
                  <div key={m.id} className="text-sm">
                    <p>{m.message}</p>
                    <p className="text-ink-500">{m.status}</p>
                    {m.status === "OPEN" && can(user, "reservations.edit") ? (
                      <ActionForm action={resolveModificationAction} className="mt-2 flex gap-2">
                        <input type="hidden" name="reservationId" value={res.id} />
                        <input type="hidden" name="requestId" value={m.id} />
                        <Select name="status">
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </Select>
                        <SubmitButton variant="outline">Save</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Audit" />
            <CardBody>
              <ul className="space-y-1 text-xs text-ink-500">
                {res.audit.map((a) => (
                  <li key={a.id}>
                    {formatDateTime(a.createdAt, locale)} · {a.action} {a.user?.name ? `· ${a.user.name}` : ""}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
