import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { deleteRateMappingAction, deleteRoomMappingAction, saveRateMappingAction, saveRoomMappingAction } from "@/app/(admin)/admin/actions/channels";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { adminMessages } from "@/i18n/admin";

export default async function MappingPage() {
  const user = await requirePagePermission("channels.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const hotel = await getHotel();
  const [channels, types, plans, roomMaps, rateMaps] = await Promise.all([
    db.channel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.roomType.findMany({ where: { hotelId: hotel.id, deletedAt: null }, orderBy: { nameEn: "asc" } }),
    db.ratePlan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.channelRoomMapping.findMany({ include: { channel: true, roomType: true }, orderBy: { createdAt: "desc" } }),
    db.channelRatePlanMapping.findMany({ include: { channel: true, ratePlan: true, roomType: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <ReadOnly locked={!can(user, "channels.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title="Room & rate mapping" description="Map internal room types and rate plans to each OTA's own IDs. External IDs are stored separately." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Room types" />
          <CardBody>
            <ActionForm action={saveRoomMappingAction} className="mb-4 space-y-3">
              <Field label="Channel" htmlFor="channelId">
                <Select id="channelId" name="channelId" required>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Internal room type" htmlFor="roomTypeId">
                <Select id="roomTypeId" name="roomTypeId" required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameEn}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="External room ID" htmlFor="externalRoomId">
                <Input id="externalRoomId" name="externalRoomId" required />
              </Field>
              <Field label="External name" htmlFor="externalRoomName">
                <Input id="externalRoomName" name="externalRoomName" />
              </Field>
              <SubmitButton>Save mapping</SubmitButton>
            </ActionForm>
            <ul className="text-sm">
              {roomMaps.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-b border-sand-100 py-2">
                  <span>
                    {m.channel.name}: {m.roomType.nameEn} → {m.externalRoomName || m.externalRoomId}
                  </span>
                  <ActionForm action={deleteRoomMappingAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmSubmit name="x" value="1" label="Remove" message="Remove this mapping?" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rate plans" />
          <CardBody>
            <ActionForm action={saveRateMappingAction} className="mb-4 space-y-3">
              <Field label="Channel" htmlFor="r-channel">
                <Select id="r-channel" name="channelId" required>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Internal rate plan" htmlFor="ratePlanId">
                <Select id="ratePlanId" name="ratePlanId" required>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.nameEn}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Room type (optional)" htmlFor="r-rt">
                <Select id="r-rt" name="roomTypeId">
                  <option value="">Any</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameEn}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="External rate plan ID" htmlFor="externalRatePlanId">
                <Input id="externalRatePlanId" name="externalRatePlanId" required />
              </Field>
              <Field label="External name" htmlFor="externalRatePlanName">
                <Input id="externalRatePlanName" name="externalRatePlanName" />
              </Field>
              <SubmitButton>Save mapping</SubmitButton>
            </ActionForm>
            <ul className="text-sm">
              {rateMaps.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-b border-sand-100 py-2">
                  <span>
                    {m.channel.name}: {m.ratePlan.code} → {m.externalRatePlanName || m.externalRatePlanId}
                  </span>
                  <ActionForm action={deleteRateMappingAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmSubmit name="x" value="1" label="Remove" message="Remove this mapping?" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
    </ReadOnly>
  );
}
