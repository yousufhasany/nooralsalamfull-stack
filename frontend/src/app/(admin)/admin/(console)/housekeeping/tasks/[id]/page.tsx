import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { ensureInventoryDefaults, onHand } from "@/server/services/inventory.service";
import { reviewCleaningAction, saveSupplyAction, startCleaningAction, submitCleaningAction, uploadCleaningPhotoAction } from "@/app/(admin)/admin/actions/housekeeping";
import { ActionForm } from "@/components/admin/action-form";
import { PhotoField } from "@/components/admin/photo-field";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export default async function HousekeepingTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("housekeeping.view");
  const { id } = await params;
  const hotel = await getHotel();
  await ensureInventoryDefaults(hotel.id);
  const task = await db.housekeepingTask.findUnique({
    where: { id },
    include: {
      room: { include: { roomType: true } },
      assignedTo: true,
      photos: { include: { category: true, uploadedBy: true }, orderBy: { createdAt: "asc" } },
      supplyLines: { include: { item: true } },
      inspections: { include: { reviewedBy: true }, orderBy: { attempt: "asc" } },
    },
  });
  if (!task || task.room.hotelId !== hotel.id) notFound();
  const manage = can(user, "housekeeping.inspect");
  if (!manage && task.assignedToId && task.assignedToId !== user.id) redirect("/admin/forbidden");
  const [categories, items] = await Promise.all([
    db.housekeepingPhotoCategory.findMany({ where: { hotelId: hotel.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.inventoryItem.findMany({ where: { hotelId: hotel.id, deletedAt: null, isActive: true }, orderBy: { nameEn: "asc" } }),
  ]);
  const editable = can(user, "housekeeping.update") && ["OPEN", "IN_PROGRESS", "REJECTED"].includes(task.status) && !task.suppliesDeducted;
  const canUpload = can(user, "housekeeping.update") && ["OPEN", "IN_PROGRESS", "REJECTED"].includes(task.status);
  const canStart = can(user, "housekeeping.update") && ["OPEN", "REJECTED"].includes(task.status);
  const stored = task.photos.filter((p) => !p.storageKey.startsWith("pending/"));
  const missing = categories.filter((c) => c.mandatory && !stored.some((p) => p.categoryId === c.id));
  const latestRejection = [...task.inspections].reverse().find((i) => i.status === "REJECTED");
  const stocks = await Promise.all(items.map(async (item) => ({ id: item.id, qty: await onHand(db, item.id, item.locationId) })));
  const stockOf = new Map(stocks.map((s) => [s.id, s.qty]));
  const locale = user.locale === "ar" ? "ar" : "en";
  const catName = (c: { nameEn: string; nameAr: string }) => (locale === "ar" ? c.nameAr : c.nameEn);

  return (
    <>
      <PageHeader
        title={`Room ${task.room.number}`}
        description={`Floor ${task.room.floor} · ${task.room.roomType.nameEn} · ${task.status}`}
        action={<Link href="/admin/housekeeping" className="text-sm text-brand-800 underline">All rooms</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <p>Assigned {task.createdAt.toISOString().slice(0, 16).replace("T", " ")}{task.assignedTo ? ` · ${task.assignedTo.name}` : ""}</p>
              <p>Started {task.startedAt ? task.startedAt.toISOString().slice(0, 16).replace("T", " ") : "—"} · Submitted {task.submittedAt ? task.submittedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}</p>
              {task.notes ? <p>Note: {task.notes}</p> : null}
              {latestRejection ? (
                <p className="rounded-lg bg-warn-50 px-3 py-2 text-warn-600">
                  Rejected: {latestRejection.reason}
                  {latestRejection.areas ? ` · ${latestRejection.areas}` : ""}
                </p>
              ) : null}
              {canStart ? (
                <ActionForm action={startCleaningAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <SubmitButton>Start cleaning</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="font-medium text-brand-900">Photographs</h2>
              <p className="mt-1 text-sm text-ink-500">One photograph is required for each mandatory area before this room can be submitted.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {categories.map((category) => {
                  const photos = stored.filter((p) => p.categoryId === category.id);
                  return (
                    <div key={category.id} className="rounded-xl border border-sand-200 p-3">
                      <p className="font-medium">{catName(category)}{category.mandatory ? " *" : ""}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {photos.map((photo) => (
                          <figure key={photo.id}>
                            {/* Authenticated private delivery. Next/Image cannot attach the session cookie to an optimizer request. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/housekeeping/photos/${photo.id}`} alt={catName(category)} className="h-28 w-full rounded-lg object-cover" />
                            <figcaption className="mt-1 text-xs text-ink-500">{photo.createdAt.toISOString().slice(0, 16).replace("T", " ")}{photo.note ? ` · ${photo.note}` : ""}</figcaption>
                          </figure>
                        ))}
                      </div>
                      {canUpload ? (
                        <ActionForm action={uploadCleaningPhotoAction} className="mt-3 space-y-2">
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="categoryId" value={category.id} />
                          <PhotoField id={`photo-${category.id}`} camera />
                          <Input name="note" placeholder="Short note" aria-label={`Note for ${catName(category)}`} />
                          <SubmitButton variant="outline">Upload</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
          {task.inspections.length > 0 ? (
            <Card>
              <CardBody>
                <h2 className="font-medium">Inspection history</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {task.inspections.map((row) => (
                    <li key={row.id}>Attempt {row.attempt}: {row.status}{row.reason ? ` · ${row.reason}` : ""}{row.reviewedBy ? ` · ${row.reviewedBy.name}` : ""}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="font-medium">Products for cleaning</h2>
              <p className="mt-1 text-sm text-ink-500">Record each product used and the quantity this room needs. Stock is reduced when the room is submitted.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {task.supplyLines.map((line) => <li key={line.id}>{line.item.nameEn} · {line.quantity.toString()}</li>)}
                {task.supplyLines.length === 0 ? <li className="text-ink-500">None recorded.</li> : null}
              </ul>
              {editable ? (
                <ActionForm action={saveSupplyAction} className="mt-3 space-y-2">
                  <input type="hidden" name="taskId" value={task.id} />
                  <Field label="Product name" htmlFor="supply-item">
                    <Select id="supply-item" name="itemId">
                      {items.map((item) => <option key={item.id} value={item.id}>{item.nameEn} · {stockOf.get(item.id)?.toFixed(3) ?? "0"} on hand</option>)}
                    </Select>
                  </Field>
                  <Field label="Quantity" htmlFor="supply-qty"><Input id="supply-qty" name="quantity" inputMode="decimal" required /></Field>
                  <SubmitButton variant="outline">Save</SubmitButton>
                </ActionForm>
              ) : null}
              {task.suppliesDeducted ? <p className="mt-2 text-xs text-ink-500">These supplies were posted once. A rejection does not post them again.</p> : null}
            </CardBody>
          </Card>
          {can(user, "housekeeping.update") && ["IN_PROGRESS", "REJECTED"].includes(task.status) ? (
            <Card>
              <CardBody>
                <h2 className="font-medium">Submit for inspection</h2>
                {missing.length > 0 ? <p className="mt-2 text-sm text-warn-600">Still needed: {missing.map((c) => catName(c)).join(", ")}</p> : <p className="mt-2 text-sm text-ink-500">All required photographs are uploaded.</p>}
                <ActionForm action={submitCleaningAction} className="mt-3 space-y-2">
                  <input type="hidden" name="taskId" value={task.id} />
                  <Field label="Note for the manager" htmlFor="submit-note"><Textarea id="submit-note" name="note" /></Field>
                  <ConfirmSubmit name="confirm" value="yes" label="Submit" message="Submit this room for inspection? Supplies will be deducted once." variant="primary" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {manage && task.status === "AWAITING_INSPECTION" ? (
            <Card>
              <CardBody>
                <h2 className="font-medium">Inspection</h2>
                <ActionForm action={reviewCleaningAction} className="mt-3 space-y-2">
                  <input type="hidden" name="taskId" value={task.id} />
                  <Field label="Reason (required to reject)" htmlFor="reason"><Textarea id="reason" name="reason" /></Field>
                  <Field label="Areas to reclean" htmlFor="areas"><Input id="areas" name="areas" /></Field>
                  <div className="flex gap-2">
                    <ConfirmSubmit name="decision" value="approve" label="Approve" message="Approve this cleaning and mark the room ready if its current status allows it?" variant="primary" />
                    <ConfirmSubmit name="decision" value="reject" label="Reject" message="Return this room for recleaning?" />
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
