import Link from "next/link";
import { requirePagePermission, can } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { openRoomCleaningAction } from "@/app/(admin)/admin/actions/housekeeping";
import { setRoomStatusAction, startHousekeepingTaskAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { label } from "@/lib/labels";
import { pick } from "@/i18n/config";
import { adminMessages } from "@/i18n/admin";
import type { RoomStatus } from "@/generated/prisma/enums";

const groups: RoomStatus[] = ["DIRTY", "CLEANING", "AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "OUT_OF_ORDER"];
const next: Record<string, RoomStatus[]> = {
  AVAILABLE: ["DIRTY", "CLEANING", "MAINTENANCE", "OUT_OF_ORDER"],
  RESERVED: ["AVAILABLE", "DIRTY", "CLEANING", "MAINTENANCE", "OUT_OF_ORDER"],
  OCCUPIED: [],
  DIRTY: ["CLEANING", "MAINTENANCE", "OUT_OF_ORDER"],
  CLEANING: ["DIRTY", "MAINTENANCE", "OUT_OF_ORDER"],
  MAINTENANCE: ["AVAILABLE", "DIRTY", "CLEANING", "OUT_OF_ORDER"],
  OUT_OF_ORDER: ["AVAILABLE", "DIRTY", "CLEANING", "MAINTENANCE"],
};

export default async function HousekeepingPage() {
  const user = await requirePagePermission("housekeeping.view");
  const hotel = await getHotel();
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const [rooms, tasks] = await Promise.all([
    db.room.findMany({
      where: { hotelId: hotel.id, isActive: true, deletedAt: null },
      include: { roomType: true },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    }),
    db.housekeepingTask.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "AWAITING_INSPECTION", "REJECTED"] },
      },
      include: { room: true, assignedTo: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t.housekeeping}
        description={t.housekeepingIntro}
        action={
          can(user, "housekeeping.inspect") ? (
            <Link href="/admin/housekeeping/inspections" className="text-sm text-brand-800 underline">
              {t.inspections}
            </Link>
          ) : null
        }
      />
      {tasks.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title={t.openTasks} />
          <CardBody className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  {t.room} {task.room.number} · {task.status.replaceAll("_", " ")}
                  {task.assignedTo ? ` · ${task.assignedTo.name}` : ""}
                </p>
                {can(user, "housekeeping.update") ? (
                  <div className="flex gap-2">
                    {task.status === "OPEN" ? (
                      <ActionForm action={startHousekeepingTaskAction}>
                        <input type="hidden" name="id" value={task.id} />
                        <SubmitButton variant="outline">{t.start}</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <Link href={`/admin/housekeeping/tasks/${task.id}`} className="rounded-lg border border-sand-300 px-3 py-2 text-sm text-brand-800 hover:bg-sand-50">
                      {t.openTask}
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((status) => {
          const list = rooms.filter((r) => r.status === status);
          return (
            <Card key={status}>
              <CardHeader title={`${label.roomStatus(status, locale)} (${list.length})`} />
              <CardBody className="space-y-3">
                {list.length === 0 ? <p className="text-sm text-ink-500">{t.noneShort}</p> : null}
                {list.map((room) => (
                  <div key={room.id} className="rounded-xl border border-sand-200 p-3 text-sm">
                    <p className="font-medium">
                      {room.number} · {pick(room.roomType, "name", locale)}
                    </p>
                    {can(user, "housekeeping.update") && (status === "DIRTY" || status === "CLEANING" || status === "OCCUPIED") ? (
                      <ActionForm action={openRoomCleaningAction} className="mt-2">
                        <input type="hidden" name="roomId" value={room.id} />
                        <SubmitButton>{t.uploadPhotos}</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {can(user, "housekeeping.update") && next[status].length > 0 ? (
                      <ActionForm action={setRoomStatusAction} className="mt-2 flex gap-2">
                        <input type="hidden" name="roomId" value={room.id} />
                        <Select name="status" className="h-9">
                          {next[status].map((s) => (
                            <option key={s} value={s}>
                              {label.roomStatus(s, locale)}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton variant="outline">{t.update}</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {status === "OCCUPIED" ? <Badge tone="blue">{t.inHouseBadge}</Badge> : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
