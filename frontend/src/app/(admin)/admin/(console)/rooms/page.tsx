import { requirePagePermission, can } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { createRoomAction, deleteRoomAction, updateRoomAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { label } from "@/lib/labels";
import { pick } from "@/i18n/config";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";

const roomTone: Record<string, "green" | "red" | "amber" | "gray" | "blue" | "neutral"> = {
  AVAILABLE: "green",
  OCCUPIED: "blue",
  RESERVED: "neutral",
  DIRTY: "amber",
  CLEANING: "amber",
  MAINTENANCE: "red",
  OUT_OF_ORDER: "red",
};

export default async function RoomsPage() {
  const user = await requirePagePermission("rooms.view");
  const hotel = await getHotel();
  const [rooms, types] = await Promise.all([
    db.room.findMany({ where: { hotelId: hotel.id, deletedAt: null }, include: { roomType: true }, orderBy: [{ floor: "asc" }, { number: "asc" }] }),
    db.roomType.findMany({ where: { hotelId: hotel.id, deletedAt: null }, orderBy: { nameEn: "asc" } }),
  ]);
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);

  return (
    <>
      <PageHeader title={t.physicalRooms} description={t.physicalRoomsIntro} />
      {can(user, "rooms.manage") ? (
        <Card className="mb-6">
          <CardHeader title={t.addRoom} />
          <CardBody>
            <ActionForm action={createRoomAction} className="grid gap-3 sm:grid-cols-4">
              <Field label={t.number} htmlFor="number">
                <Input id="number" name="number" required />
              </Field>
              <Field label={t.floor} htmlFor="floor">
                <Input id="floor" name="floor" type="number" defaultValue={1} />
              </Field>
              <Field label={t.type} htmlFor="roomTypeId">
                <Select id="roomTypeId" name="roomTypeId" required>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {pick(type, "name", locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton>{t.add}</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
      <DataTable
        rows={rooms}
        rowKey={(r) => r.id}
        columns={[
          { key: "number", header: t.room, cell: (r) => r.number },
          { key: "floor", header: t.floor, cell: (r) => r.floor },
          { key: "type", header: t.type, cell: (r) => pick(r.roomType, "name", locale) },
          {
            key: "status",
            header: t.status,
            cell: (r) => <Badge tone={roomTone[r.status]}>{label.roomStatus(r.status, locale)}</Badge>,
          },
          {
            key: "active",
            header: t.active,
            cell: (r) => (r.isActive ? t.yes : t.no),
          },
          {
            key: "edit",
            header: "",
            cell: (r) =>
              can(user, "rooms.manage") ? (
                <ActionForm action={updateRoomAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Input name="number" defaultValue={r.number} className="h-9 w-20" />
                  <Input name="floor" type="number" defaultValue={r.floor} className="h-9 w-16" />
                  <Select name="roomTypeId" defaultValue={r.roomTypeId} className="h-9">
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {pick(type, "name", locale)}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="isActive" defaultChecked={r.isActive} /> {t.active}
                  </label>
                  <SubmitButton variant="outline">{t.save}</SubmitButton>
                </ActionForm>
              ) : null,
          },
          {
            key: "del",
            header: "",
            cell: (r) =>
              can(user, "rooms.manage") ? (
                <ActionForm action={deleteRoomAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit name="x" value="1" label={t.remove} message={fmt(t.removeRoom, { n: r.number })} />
                </ActionForm>
              ) : null,
          },
        ]}
      />
    </>
  );
}
