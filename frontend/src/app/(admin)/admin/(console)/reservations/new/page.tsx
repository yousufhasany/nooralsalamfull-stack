import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { findAssignableRooms } from "@/server/services/availability.service";
import { createWalkInAction } from "@/app/(admin)/admin/actions/reservations";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardBody } from "@/components/ui/card";
import { isDateStr } from "@/lib/dates";

type Search = Promise<{ roomTypeId?: string; roomId?: string; checkIn?: string; checkOut?: string }>;

export default async function NewReservationPage({ searchParams }: { searchParams: Search }) {
  await requirePagePermission("reservations.create");
  const q = await searchParams;
  const hotel = await getHotel();
  const [roomTypes, ratePlans] = await Promise.all([
    db.roomType.findMany({ where: { hotelId: hotel.id, isActive: true, deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.ratePlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const roomTypeId = roomTypes.some((r) => r.id === q.roomTypeId) ? q.roomTypeId : undefined;
  const checkIn = q.checkIn && isDateStr(q.checkIn) ? q.checkIn : undefined;
  const checkOut = q.checkOut && isDateStr(q.checkOut) ? q.checkOut : undefined;
  const freeRooms =
    roomTypeId && checkIn && checkOut && checkOut > checkIn ? await findAssignableRooms(db, { roomTypeId, checkIn, checkOut }) : [];
  const roomId = freeRooms.some((r) => r.id === q.roomId) ? q.roomId : undefined;

  return (
    <>
      <PageHeader title="New reservation" description="Phone, walk-in or other staff-created booking. Prices are calculated on the server." />
      <Card>
        <CardBody>
          <ActionForm action={createWalkInAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="source" required>
              <Select id="source" name="source" defaultValue="WALK_IN">
                <option value="WALK_IN">Walk-in</option>
                <option value="PHONE">Phone</option>
                <option value="DIRECT_WEBSITE">Direct website (staff)</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Payment collection" htmlFor="paymentCollection">
              <Select id="paymentCollection" name="paymentCollection" defaultValue="PAY_AT_HOTEL">
                <option value="PAY_AT_HOTEL">Pay at hotel</option>
                <option value="HOTEL_COLLECTED">Already collected</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </Select>
            </Field>
            <Field label="First name" htmlFor="firstName" required>
              <Input id="firstName" name="firstName" required />
            </Field>
            <Field label="Last name" htmlFor="lastName" required>
              <Input id="lastName" name="lastName" required />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" placeholder="+966 5X XXX XXXX" />
            </Field>
            <Field label="Nationality" htmlFor="nationality">
              <Input id="nationality" name="nationality" />
            </Field>
            <Field label="Room type" htmlFor="roomTypeId" required>
              <Select id="roomTypeId" name="roomTypeId" defaultValue={roomTypeId ?? ""} required>
                <option value="">Select…</option>
                {roomTypes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameEn} / {r.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            {freeRooms.length > 0 ? (
              <Field label="Room" htmlFor="roomId" hint="Free rooms of this type for the chosen dates. Leave empty to assign at check-in.">
                <Select id="roomId" name="roomId" defaultValue={roomId ?? ""}>
                  <option value="">Assign at check-in</option>
                  {freeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.number} · floor {r.floor}
                      {r.status === "AVAILABLE" || r.status === "RESERVED" ? "" : " (needs cleaning)"}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Rate plan" htmlFor="ratePlanId">
              <Select id="ratePlanId" name="ratePlanId">
                <option value="">Default</option>
                {ratePlans.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Check-in" htmlFor="checkIn" required>
              <Input id="checkIn" name="checkIn" type="date" defaultValue={checkIn} required />
            </Field>
            <Field label="Check-out" htmlFor="checkOut" required>
              <Input id="checkOut" name="checkOut" type="date" defaultValue={checkOut} required />
            </Field>
            <Field label="Adults" htmlFor="adults">
              <Input id="adults" name="adults" type="number" min={1} step={1} defaultValue={1} />
            </Field>
            <Field label="Children" htmlFor="children">
              <Input id="children" name="children" type="number" min={0} step={1} defaultValue={0} />
            </Field>
            <Field label="Rooms" htmlFor="rooms">
              <Input id="rooms" name="rooms" type="number" min={1} step={1} defaultValue={1} />
            </Field>
            <Field label="Promotion code" htmlFor="promotionCode" hint="Upper or lower case both work.">
              <Input id="promotionCode" name="promotionCode" />
            </Field>
            <Field label="Special requests" htmlFor="specialRequests" className="sm:col-span-2">
              <Textarea id="specialRequests" name="specialRequests" />
            </Field>
            <Field label="Internal notes" htmlFor="internalNotes" className="sm:col-span-2">
              <Textarea id="internalNotes" name="internalNotes" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Create reservation</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
