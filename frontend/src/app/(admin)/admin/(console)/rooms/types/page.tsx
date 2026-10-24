import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { addRoomImageAction, archiveRoomTypeAction, removeRoomImageAction, saveRoomTypeAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { PhotoField } from "@/components/admin/photo-field";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { pick } from "@/i18n/config";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";

export default async function RoomTypesPage() {
  const user = await requirePagePermission("roomtypes.view");
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const hotel = await getHotel();
  const [types, amenities] = await Promise.all([
    db.roomType.findMany({
      where: { hotelId: hotel.id, deletedAt: null },
      include: { amenities: true, images: { orderBy: { sortOrder: "asc" } }, _count: { select: { rooms: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.amenity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <ReadOnly locked={!can(user, "roomtypes.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title={t.roomTypes} description={t.roomTypesIntro} />
      <Card className="mb-8">
        <CardHeader title={t.addRoomType} />
        <CardBody>
          <RoomTypeForm amenities={amenities} t={t} locale={locale} />
        </CardBody>
      </Card>
      <div className="space-y-8">
        {types.map((rt) => (
          <Card key={rt.id}>
            <CardHeader title={pick(rt, "name", locale)} description={fmt(t.roomCountFrom, { n: rt._count.rooms, price: formatMoney(rt.basePrice, hotel.currency, locale) })} />
            <CardBody className="space-y-6">
              <RoomTypeForm amenities={amenities} existing={rt} t={t} locale={locale} />
              <ActionForm action={addRoomImageAction} className="space-y-3">
                <input type="hidden" name="roomTypeId" value={rt.id} />
                <PhotoField id={`room-photo-${rt.id}`} required={false} chooseLabel={t.photoChoose} hint={t.photoHint} />
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input name="url" placeholder={t.orPasteLink} className="sm:col-span-2" />
                  <Input name="altEn" placeholder={t.altText} />
                  <SubmitButton variant="outline">{t.addImage}</SubmitButton>
                </div>
                <input type="hidden" name="altAr" value="" />
                <input type="hidden" name="altBn" value="" />
              </ActionForm>
              {rt.images.length ? (
                <ul className="flex flex-wrap gap-3">
                  {rt.images.map((img) => (
                    <li key={img.id} className="w-36">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.altEn || rt.nameEn} className="h-24 w-full rounded-lg object-cover" />
                      <ActionForm action={removeRoomImageAction} className="mt-1">
                        <input type="hidden" name="id" value={img.id} />
                        <ConfirmSubmit name="x" value="1" label={t.remove} message={t.remove} variant="outline" />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={archiveRoomTypeAction}>
                <input type="hidden" name="id" value={rt.id} />
                <ConfirmSubmit name="x" value="1" label={t.archive} message={t.archive} />
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
    </ReadOnly>
  );
}

function RoomTypeForm({
  amenities,
  existing,
  t,
  locale,
}: {
  amenities: { id: string; nameEn: string; nameAr: string; nameBn: string }[];
  t: ReturnType<typeof adminMessages>;
  locale: "en" | "ar" | "bn";
  existing?: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string;
    nameBn: string;
    descriptionEn: string;
    descriptionAr: string;
    descriptionBn: string;
    bedType: string;
    bedTypeAr: string;
    bedTypeBn: string;
    sizeSqm: number | null;
    maxAdults: number;
    maxChildren: number;
    maxOccupancy: number;
    basePrice: { toString(): string };
    weekendPrice: { toString(): string } | null;
    sortOrder: number;
    isActive: boolean;
    amenities: { amenityId: string }[];
  };
}) {
  const selected = new Set(existing?.amenities.map((a) => a.amenityId) ?? []);
  return (
    <ActionForm action={saveRoomTypeAction} className="grid gap-3 sm:grid-cols-2">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <Field label={t.slug} htmlFor={`slug-${existing?.id ?? "new"}`}>
        <Input id={`slug-${existing?.id ?? "new"}`} name="slug" defaultValue={existing?.slug} required />
      </Field>
      <Field label={t.sort} htmlFor={`sort-${existing?.id ?? "new"}`}>
        <Input id={`sort-${existing?.id ?? "new"}`} name="sortOrder" type="number" defaultValue={existing?.sortOrder ?? 0} />
      </Field>
      <Field label={t.nameEn} htmlFor={`ne-${existing?.id ?? "new"}`}>
        <Input id={`ne-${existing?.id ?? "new"}`} name="nameEn" defaultValue={existing?.nameEn} required />
      </Field>
      <Field label="الاسم" htmlFor={`na-${existing?.id ?? "new"}`}>
        <Input id={`na-${existing?.id ?? "new"}`} name="nameAr" defaultValue={existing?.nameAr} required />
      </Field>
      <Field label="নাম (বাংলা)" htmlFor={`nb-${existing?.id ?? "new"}`}>
        <Input id={`nb-${existing?.id ?? "new"}`} name="nameBn" defaultValue={existing?.nameBn} required />
      </Field>
      <Field label={t.basePrice} htmlFor={`bp-${existing?.id ?? "new"}`}>
        <Input id={`bp-${existing?.id ?? "new"}`} name="basePrice" inputMode="decimal" defaultValue={existing?.basePrice.toString()} required />
      </Field>
      <Field label={t.weekendPrice} htmlFor={`wp-${existing?.id ?? "new"}`}>
        <Input id={`wp-${existing?.id ?? "new"}`} name="weekendPrice" inputMode="decimal" defaultValue={existing?.weekendPrice?.toString() ?? ""} />
      </Field>
      <Field label={t.sizeM2} htmlFor={`sz-${existing?.id ?? "new"}`}>
        <Input id={`sz-${existing?.id ?? "new"}`} name="sizeSqm" type="number" defaultValue={existing?.sizeSqm ?? ""} />
      </Field>
      <Field label={t.maxAdults} htmlFor={`ma-${existing?.id ?? "new"}`}>
        <Input id={`ma-${existing?.id ?? "new"}`} name="maxAdults" type="number" defaultValue={existing?.maxAdults ?? 2} />
      </Field>
      <Field label={t.maxChildren} htmlFor={`mc-${existing?.id ?? "new"}`}>
        <Input id={`mc-${existing?.id ?? "new"}`} name="maxChildren" type="number" defaultValue={existing?.maxChildren ?? 0} />
      </Field>
      <Field label={t.maxOccupancy} htmlFor={`mo-${existing?.id ?? "new"}`}>
        <Input id={`mo-${existing?.id ?? "new"}`} name="maxOccupancy" type="number" defaultValue={existing?.maxOccupancy ?? 2} />
      </Field>
      <Field label={t.bedEn} htmlFor={`be-${existing?.id ?? "new"}`}>
        <Input id={`be-${existing?.id ?? "new"}`} name="bedType" defaultValue={existing?.bedType} />
      </Field>
      <Field label="السرير" htmlFor={`ba-${existing?.id ?? "new"}`}>
        <Input id={`ba-${existing?.id ?? "new"}`} name="bedTypeAr" defaultValue={existing?.bedTypeAr} />
      </Field>
      <Field label="বিছানা" htmlFor={`bb-${existing?.id ?? "new"}`}>
        <Input id={`bb-${existing?.id ?? "new"}`} name="bedTypeBn" defaultValue={existing?.bedTypeBn} />
      </Field>
      <Field label={t.descriptionEn} htmlFor={`de-${existing?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`de-${existing?.id ?? "new"}`} name="descriptionEn" defaultValue={existing?.descriptionEn} />
      </Field>
      <Field label="الوصف" htmlFor={`da-${existing?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`da-${existing?.id ?? "new"}`} name="descriptionAr" defaultValue={existing?.descriptionAr} />
      </Field>
      <Field label="বিবরণ" htmlFor={`db-${existing?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`db-${existing?.id ?? "new"}`} name="descriptionBn" defaultValue={existing?.descriptionBn} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">{t.amenities}</legend>
        <div className="flex flex-wrap gap-3">
          {amenities.map((a) => (
            <label key={a.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="amenityIds" value={a.id} defaultChecked={selected.has(a.id)} />
              {pick(a, "name", locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={existing?.isActive ?? true} /> {t.active}
      </label>
      <div>
        <SubmitButton>{existing ? t.saveType : t.createType}</SubmitButton>
      </div>
    </ActionForm>
  );
}
