import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { deleteFacilityAction, deleteGalleryAction, saveFacilityAction, saveGalleryAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { PhotoField } from "@/components/admin/photo-field";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { adminMessages } from "@/i18n/admin";

export default async function ContentPage() {
  const user = await requirePagePermission("content.view");
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const hotel = await getHotel();
  const [facilities, gallery] = await Promise.all([
    db.facility.findMany({ where: { hotelId: hotel.id }, orderBy: { sortOrder: "asc" } }),
    db.galleryImage.findMany({ where: { hotelId: hotel.id }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
  ]);

  return (
    <ReadOnly locked={!can(user, "content.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title={t.content} description={t.contentIntro} />
      <Card className="mb-6">
        <CardHeader title={t.facilitiesTitle} />
        <CardBody>
          <ActionForm action={saveFacilityAction} className="mb-6 grid gap-3 sm:grid-cols-2">
            <Field label="Slug" htmlFor="slug">
              <Input id="slug" name="slug" required />
            </Field>
            <Field label="Icon key" htmlFor="icon">
              <Input id="icon" name="icon" defaultValue="sparkles" />
            </Field>
            <Field label="Name EN" htmlFor="nameEn">
              <Input id="nameEn" name="nameEn" required />
            </Field>
            <Field label="الاسم" htmlFor="nameAr">
              <Input id="nameAr" name="nameAr" required />
            </Field>
            <Field label="নাম" htmlFor="nameBn">
              <Input id="nameBn" name="nameBn" required />
            </Field>
            <Field label="Sort" htmlFor="sortOrder">
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} />
            </Field>
            <Field label="Description EN" htmlFor="descriptionEn" className="sm:col-span-2">
              <Textarea id="descriptionEn" name="descriptionEn" />
            </Field>
            <Field label="الوصف" htmlFor="descriptionAr" className="sm:col-span-2">
              <Textarea id="descriptionAr" name="descriptionAr" />
            </Field>
            <Field label="বিবরণ" htmlFor="descriptionBn" className="sm:col-span-2">
              <Textarea id="descriptionBn" name="descriptionBn" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add facility</SubmitButton>
          </ActionForm>
          <ul className="text-sm">
            {facilities.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 border-b border-sand-100 py-2">
                <span>
                  {f.nameEn} / {f.nameAr} {f.isActive ? "" : "(hidden)"}
                </span>
                <ActionForm action={deleteFacilityAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <ConfirmSubmit name="x" value="1" label="Delete" message={`Delete ${f.nameEn}?`} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title={t.galleryTitle}
          description="Add your own Exterior, Lobby, Rooms, Facilities, and Hotel pictures. Every picture is shown in the Gallery. Room photos added under Room types are included under Rooms. The home page uses the first picture of each category."
        />
        <CardBody>
          <ActionForm action={saveGalleryAction} className="mb-6 space-y-3">
            <PhotoField id="gallery-photo" required={false} chooseLabel={t.photoChoose} hint={t.photoHint} />
            <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" htmlFor="category">
              <Select id="category" name="category" defaultValue="EXTERIOR">
                <option value="EXTERIOR">Exterior</option>
                <option value="LOBBY">Lobby</option>
                <option value="ROOMS">Rooms</option>
                <option value="FACILITIES">Facilities</option>
                <option value="HOTEL">Hotel</option>
                <option value="RESTAURANT">Restaurant</option>
              </Select>
            </Field>
            <Field label="Image link" htmlFor="url" hint="Optional when you choose a file. https:// is added if you leave it off.">
              <Input id="url" name="url" placeholder="https://example.com/room.jpg" />
            </Field>
            <Field label="Alt EN" htmlFor="altEn">
              <Input id="altEn" name="altEn" />
            </Field>
            <Field label="Alt AR" htmlFor="altAr">
              <Input id="altAr" name="altAr" />
            </Field>
            <Field label="Alt BN" htmlFor="altBn">
              <Input id="altBn" name="altBn" />
            </Field>
            <Field label="Sort" htmlFor="gsort">
              <Input id="gsort" name="sortOrder" type="number" defaultValue={0} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add image</SubmitButton>
            </div>
          </ActionForm>
          <ul className="space-y-3 text-sm">
            {gallery.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 border-b border-sand-100 py-2">
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.altEn || g.category} className="h-16 w-24 rounded-lg object-cover" />
                  <span>
                    {g.category} · {g.altEn || g.url}
                  </span>
                </span>
                <ActionForm action={deleteGalleryAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <ConfirmSubmit name="x" value="1" label="Delete" message="Delete this image?" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
    </ReadOnly>
  );
}
