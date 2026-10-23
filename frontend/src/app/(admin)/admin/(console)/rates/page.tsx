import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getHotel } from "@/server/services/settings.service";
import { deletePricingRuleAction, deleteRoomRateAction, savePricingRuleAction, savePromotionAction, saveRatePlanAction, saveRoomRateAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { fromDate } from "@/lib/dates";
import { adminMessages } from "@/i18n/admin";

export default async function RatesPage() {
  const user = await requirePagePermission("rates.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const hotel = await getHotel();
  const [plans, rates, rules, promos, types] = await Promise.all([
    db.ratePlan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.roomRate.findMany({ include: { roomType: true, ratePlan: true }, orderBy: { startDate: "desc" }, take: 50 }),
    db.pricingRule.findMany({ orderBy: { priority: "desc" } }),
    db.promotion.findMany({ orderBy: { createdAt: "desc" } }),
    db.roomType.findMany({ where: { hotelId: hotel.id, deletedAt: null }, orderBy: { nameEn: "asc" } }),
  ]);

  return (
    <ReadOnly locked={!can(user, "rates.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title="Rates & promotions" description="All prices are calculated server-side. Channel markups use pricing rules, not hardcoded percentages." />

      <Card className="mb-6">
        <CardHeader title="Rate plans" />
        <CardBody className="space-y-6">
          <ActionForm action={saveRatePlanAction} className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" htmlFor="code">
              <Input id="code" name="code" placeholder="STANDARD" required />
            </Field>
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue="STANDARD">
                {["STANDARD", "NON_REFUNDABLE", "BREAKFAST_INCLUDED", "HALF_BOARD", "FULL_BOARD", "CORPORATE", "PROMOTIONAL"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Name EN" htmlFor="nameEn">
              <Input id="nameEn" name="nameEn" required />
            </Field>
            <Field label="Name AR" htmlFor="nameAr">
              <Input id="nameAr" name="nameAr" required />
            </Field>
            <Field label="Name BN" htmlFor="nameBn">
              <Input id="nameBn" name="nameBn" required />
            </Field>
            <Field label="Adjustment" htmlFor="adjustmentValue">
              <Input id="adjustmentValue" name="adjustmentValue" defaultValue="0" />
            </Field>
            <Field label="Adjustment type" htmlFor="adjustmentType">
              <Select id="adjustmentType" name="adjustmentType" defaultValue="FIXED">
                <option value="FIXED">Fixed SAR</option>
                <option value="PERCENT">Percent</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isRefundable" defaultChecked /> Refundable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublic" defaultChecked /> Public
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add plan</SubmitButton>
          </ActionForm>
          <ul className="text-sm">
            {plans.map((p) => (
              <li key={p.id} className="border-b border-sand-100 py-2">
                <strong>{p.code}</strong> · {p.nameEn} / {p.nameAr} · {p.type}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Seasonal / date rates" />
        <CardBody>
          <ActionForm action={saveRoomRateAction} className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label="Room type" htmlFor="roomTypeId">
              <Select id="roomTypeId" name="roomTypeId" required>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rate plan" htmlFor="ratePlanId">
              <Select id="ratePlanId" name="ratePlanId">
                <option value="">Any</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Label" htmlFor="label">
              <Input id="label" name="label" />
            </Field>
            <Field label="From" htmlFor="startDate">
              <Input id="startDate" name="startDate" type="date" required />
            </Field>
            <Field label="To" htmlFor="endDate">
              <Input id="endDate" name="endDate" type="date" required />
            </Field>
            <Field label="Price" htmlFor="price">
              <Input id="price" name="price" required />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add rate</SubmitButton>
          </ActionForm>
          <ul className="text-sm">
            {rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 py-2">
                <span>
                  {r.roomType.nameEn} · {fromDate(r.startDate)} → {fromDate(r.endDate)} · {formatMoney(r.price, hotel.currency)} {r.label}
                </span>
                <ActionForm action={deleteRoomRateAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit name="x" value="1" label="Delete" message="Delete this date rate?" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Pricing rules (long-stay, channel markup, corporate)" />
        <CardBody>
          <ActionForm action={savePricingRuleAction} className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required />
            </Field>
            <Field label="Type" htmlFor="ruleType">
              <Select id="ruleType" name="type">
                <option value="CHANNEL_ADJUSTMENT">Channel adjustment</option>
                <option value="LONG_STAY_DISCOUNT">Long stay</option>
                <option value="CORPORATE">Corporate</option>
                <option value="PROMOTIONAL">Promotional</option>
              </Select>
            </Field>
            <Field label="Channel" htmlFor="source">
              <Select id="source" name="source">
                <option value="">All</option>
                {["DIRECT_WEBSITE", "BOOKING_COM", "AGODA", "TRIP_COM", "EXPEDIA", "PHONE", "WALK_IN", "OTHER"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Room type" htmlFor="ruleRoom">
              <Select id="ruleRoom" name="roomTypeId">
                <option value="">All</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Adjustment type" htmlFor="adjt">
              <Select id="adjt" name="adjustmentType" defaultValue="PERCENT">
                <option value="PERCENT">Percent</option>
                <option value="FIXED">Fixed</option>
              </Select>
            </Field>
            <Field label="Value (+ markup / − discount)" htmlFor="adjv">
              <Input id="adjv" name="adjustmentValue" required />
            </Field>
            <Field label="Min nights" htmlFor="minNights">
              <Input id="minNights" name="minNights" type="number" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add rule</SubmitButton>
          </ActionForm>
          <ul className="text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 border-b border-sand-100 py-2">
                <span>
                  {r.name} · {r.type} · {r.adjustmentType} {r.adjustmentValue.toString()} {r.source ?? ""}
                </span>
                <ActionForm action={deletePricingRuleAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit name="x" value="1" label="Delete" message="Delete this rule?" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Promotions" />
        <CardBody>
          <ActionForm action={savePromotionAction} className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" htmlFor="promo-code">
              <Input id="promo-code" name="code" required />
            </Field>
            <Field label="Name EN" htmlFor="promo-en">
              <Input id="promo-en" name="nameEn" required />
            </Field>
            <Field label="Name AR" htmlFor="promo-ar">
              <Input id="promo-ar" name="nameAr" required />
            </Field>
            <Field label="Name BN" htmlFor="promo-bn">
              <Input id="promo-bn" name="nameBn" required />
            </Field>
            <Field label="Type" htmlFor="discountType">
              <Select id="discountType" name="discountType">
                <option value="PERCENT">Percent</option>
                <option value="FIXED">Fixed SAR</option>
              </Select>
            </Field>
            <Field label="Amount" htmlFor="amount">
              <Input id="amount" name="amount" required />
            </Field>
            <Field label="From" htmlFor="promo-from">
              <Input id="promo-from" name="startDate" type="date" required />
            </Field>
            <Field label="To" htmlFor="promo-to">
              <Input id="promo-to" name="endDate" type="date" required />
            </Field>
            <Field label="Usage limit" htmlFor="usageLimit">
              <Input id="usageLimit" name="usageLimit" type="number" />
            </Field>
            <fieldset className="sm:col-span-3">
              <legend className="mb-1 text-sm">Applicable room types (empty = all)</legend>
              <div className="flex flex-wrap gap-3">
                {types.map((t) => (
                  <label key={t.id} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="roomTypeIds" value={t.id} /> {t.nameEn}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Add promotion</SubmitButton>
          </ActionForm>
          <ul className="mt-4 text-sm">
            {promos.map((p) => (
              <li key={p.id} className="border-b border-sand-100 py-2">
                {p.code} · {p.nameEn} · {p.discountType} {p.amount.toString()} · used {p.usedCount}
                {p.isActive ? "" : " (inactive)"}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
    </ReadOnly>
  );
}
