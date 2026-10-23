import Link from "next/link";
import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { ensureInventoryDefaults } from "@/server/services/inventory.service";
import { savePhotoCategoryAction } from "@/app/(admin)/admin/actions/housekeeping";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { adminMessages } from "@/i18n/admin";

export default async function InspectionsPage() {
  const user = await requirePagePermission("housekeeping.inspect");
  const hotel = await getHotel();
  await ensureInventoryDefaults(hotel.id);
  const [tasks, categories] = await Promise.all([
    db.housekeepingTask.findMany({
      where: { status: "AWAITING_INSPECTION", room: { hotelId: hotel.id } },
      include: { room: true, assignedTo: true, photos: true, inspections: { orderBy: { attempt: "desc" } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.housekeepingPhotoCategory.findMany({ where: { hotelId: hotel.id }, orderBy: { sortOrder: "asc" } }),
  ]);
  const locale = user.locale === "ar" ? "ar" : "en";
  return (
    <>
      <PageHeader title="Housekeeping inspections" description="A room becomes ready only after approval, and only when it is dirty or being cleaned. Occupied, reserved, maintenance, and out-of-order rooms stay as they are." />
      <ul className="space-y-3">
        {tasks.map((task) => {
          const previous = task.inspections.find((i) => i.status === "REJECTED");
          return (
            <li key={task.id} className="rounded-2xl border border-sand-200 bg-white p-4 text-sm">
              <p className="font-medium">Room {task.room.number} · floor {task.room.floor} · {task.assignedTo?.name ?? "Unassigned"}</p>
              <p className="text-ink-500">Submitted {task.submittedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "—"} · {task.photos.length} photographs · attempt {task.inspections.length}</p>
              {previous ? <p className="text-warn-600">Previous rejection: {previous.reason}</p> : null}
              <Link href={`/admin/housekeeping/tasks/${task.id}`} className="mt-2 inline-block text-brand-800 underline">Review photographs</Link>
            </li>
          );
        })}
        {tasks.length === 0 ? <li className="text-sm text-ink-500">No rooms are waiting for inspection.</li> : null}
      </ul>
      <ReadOnly locked={!can(user, "housekeeping.inspect")} notice={adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en").viewOnly}>
      <Card className="mt-6">
        <CardBody className="space-y-4">
          <h2 className="font-medium">Photograph categories</h2>
          {categories.map((category) => (
            <ActionForm key={category.id} action={savePhotoCategoryAction} className="grid gap-2 border-t border-sand-100 pt-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={category.id} />
              <Field label="English" htmlFor={`en-${category.id}`}><Input id={`en-${category.id}`} name="nameEn" defaultValue={category.nameEn} required /></Field>
              <Field label="العربية" htmlFor={`ar-${category.id}`}><Input id={`ar-${category.id}`} name="nameAr" defaultValue={category.nameAr} required dir="rtl" /></Field>
              <Field label="বাংলা" htmlFor={`bn-${category.id}`}><Input id={`bn-${category.id}`} name="nameBn" defaultValue={category.nameBn} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mandatory" defaultChecked={category.mandatory} /> Mandatory</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={category.isActive} /> Active</label>
              <SubmitButton variant="outline">{`Save ${locale === "ar" ? category.nameAr : category.nameEn}`}</SubmitButton>
            </ActionForm>
          ))}
        </CardBody>
      </Card>
      </ReadOnly>
    </>
  );
}
