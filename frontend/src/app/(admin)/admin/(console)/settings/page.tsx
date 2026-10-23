import { can, requirePagePermission } from "@/server/auth/session";
import { getAllSettings, getHotel } from "@/server/services/settings.service";
import { saveHotelProfileAction, saveSettingsGroupAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { adminMessages } from "@/i18n/admin";

export default async function SettingsPage() {
  const user = await requirePagePermission("settings.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const hotel = await getHotel();
  const settings = await getAllSettings(hotel.id);

  return (
    <ReadOnly locked={!can(user, "settings.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title={t.settings} description={t.settingsIntro} />

      <Card className="mb-6">
        <CardHeader title={t.hotelProfile} />
        <CardBody>
          <ActionForm action={saveHotelProfileAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name (EN)" htmlFor="nameEn">
              <Input id="nameEn" name="nameEn" defaultValue={hotel.nameEn} required />
            </Field>
            <Field label="الاسم" htmlFor="nameAr">
              <Input id="nameAr" name="nameAr" defaultValue={hotel.nameAr} required />
            </Field>
            <Field label="নাম" htmlFor="nameBn">
              <Input id="nameBn" name="nameBn" defaultValue={hotel.nameBn} required />
            </Field>
            <Field label="Tagline EN" htmlFor="taglineEn">
              <Input id="taglineEn" name="taglineEn" defaultValue={hotel.taglineEn} />
            </Field>
            <Field label="الشعار" htmlFor="taglineAr">
              <Input id="taglineAr" name="taglineAr" defaultValue={hotel.taglineAr} />
            </Field>
            <Field label="ট্যাগলাইন" htmlFor="taglineBn">
              <Input id="taglineBn" name="taglineBn" defaultValue={hotel.taglineBn} />
            </Field>
            <Field label="Description EN" htmlFor="descriptionEn" className="sm:col-span-2">
              <Textarea id="descriptionEn" name="descriptionEn" defaultValue={hotel.descriptionEn} />
            </Field>
            <Field label="الوصف" htmlFor="descriptionAr" className="sm:col-span-2">
              <Textarea id="descriptionAr" name="descriptionAr" defaultValue={hotel.descriptionAr} />
            </Field>
            <Field label="বিবরণ" htmlFor="descriptionBn" className="sm:col-span-2">
              <Textarea id="descriptionBn" name="descriptionBn" defaultValue={hotel.descriptionBn} />
            </Field>
            <Field label="Address EN" htmlFor="addressEn" className="sm:col-span-2">
              <Input id="addressEn" name="addressEn" defaultValue={hotel.addressEn} />
            </Field>
            <Field label="العنوان" htmlFor="addressAr">
              <Input id="addressAr" name="addressAr" defaultValue={hotel.addressAr} />
            </Field>
            <Field label="ঠিকানা" htmlFor="addressBn">
              <Input id="addressBn" name="addressBn" defaultValue={hotel.addressBn} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue={hotel.city} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={hotel.phone} />
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp" hint="Digits only, with country code. Leave empty if not configured.">
              <Input id="whatsapp" name="whatsapp" defaultValue={hotel.whatsapp} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" defaultValue={hotel.email} />
            </Field>
            <Field label="Logo URL" htmlFor="logoUrl">
              <Input id="logoUrl" name="logoUrl" defaultValue={hotel.logoUrl} />
            </Field>
            <Field label="Hero image URL" htmlFor="heroImageUrl">
              <Input id="heroImageUrl" name="heroImageUrl" defaultValue={hotel.heroImageUrl} />
            </Field>
            <Field label="Map embed URL" htmlFor="mapEmbedUrl" hint="Leave empty until the hotel location is confirmed.">
              <Input id="mapEmbedUrl" name="mapEmbedUrl" defaultValue={hotel.mapEmbedUrl} />
            </Field>
            <Field label="Contact hours EN" htmlFor="contactHoursEn">
              <Input id="contactHoursEn" name="contactHoursEn" defaultValue={hotel.contactHoursEn} />
            </Field>
            <Field label="ساعات التواصل" htmlFor="contactHoursAr">
              <Input id="contactHoursAr" name="contactHoursAr" defaultValue={hotel.contactHoursAr} />
            </Field>
            <Field label="যোগাযোগের সময়" htmlFor="contactHoursBn">
              <Input id="contactHoursBn" name="contactHoursBn" defaultValue={hotel.contactHoursBn} />
            </Field>
            <Field label="Check-in time" htmlFor="checkInTime">
              <Input id="checkInTime" name="checkInTime" defaultValue={hotel.checkInTime} />
            </Field>
            <Field label="Check-out time" htmlFor="checkOutTime">
              <Input id="checkOutTime" name="checkOutTime" defaultValue={hotel.checkOutTime} />
            </Field>
            <Field label="VAT number" htmlFor="vatNumber">
              <Input id="vatNumber" name="vatNumber" defaultValue={hotel.vatNumber} />
            </Field>
            <Field label="Commercial registration" htmlFor="commercialReg">
              <Input id="commercialReg" name="commercialReg" defaultValue={hotel.commercialReg} />
            </Field>
            <Field label="Latitude" htmlFor="latitude">
              <Input id="latitude" name="latitude" defaultValue={hotel.latitude?.toString() ?? ""} />
            </Field>
            <Field label="Longitude" htmlFor="longitude">
              <Input id="longitude" name="longitude" defaultValue={hotel.longitude?.toString() ?? ""} />
            </Field>
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Booking rules" />
        <CardBody>
          <ActionForm action={saveSettingsGroupAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="group" value="booking" />
            <input type="hidden" name="sameDayTurnover__bool" value="1" />
            <input type="hidden" name="payAtHotelEnabled__bool" value="1" />
            <input type="hidden" name="autoConfirmDirect__bool" value="1" />
            <input type="hidden" name="guestSelfCancelEnabled__bool" value="1" />
            <input type="hidden" name="guestModificationRequestEnabled__bool" value="1" />
            <Field label="Min stay" htmlFor="minStay">
              <Input id="minStay" name="minStay" type="number" defaultValue={settings.booking.minStay} />
            </Field>
            <Field label="Max stay" htmlFor="maxStay">
              <Input id="maxStay" name="maxStay" type="number" defaultValue={settings.booking.maxStay} />
            </Field>
            <Field label="Max rooms / booking" htmlFor="maxRoomsPerBooking">
              <Input id="maxRoomsPerBooking" name="maxRoomsPerBooking" type="number" defaultValue={settings.booking.maxRoomsPerBooking} />
            </Field>
            <Field label="Max advance days" htmlFor="maxAdvanceDays">
              <Input id="maxAdvanceDays" name="maxAdvanceDays" type="number" defaultValue={settings.booking.maxAdvanceDays} />
            </Field>
            <Field label="Hold minutes (online payment)" htmlFor="holdMinutes">
              <Input id="holdMinutes" name="holdMinutes" type="number" defaultValue={settings.booking.holdMinutes} />
            </Field>
            <Field label="Free cancellation days" htmlFor="cancellationFreeDays">
              <Input id="cancellationFreeDays" name="cancellationFreeDays" type="number" defaultValue={settings.booking.cancellationFreeDays} />
            </Field>
            <Field label="Cancellation policy EN" htmlFor="cancellationPolicyEn" className="sm:col-span-3">
              <Textarea id="cancellationPolicyEn" name="cancellationPolicyEn" defaultValue={settings.booking.cancellationPolicyEn} />
            </Field>
            <Field label="سياسة الإلغاء" htmlFor="cancellationPolicyAr" className="sm:col-span-3">
              <Textarea id="cancellationPolicyAr" name="cancellationPolicyAr" defaultValue={settings.booking.cancellationPolicyAr} />
            </Field>
            <Field label="বাতিল নীতি" htmlFor="cancellationPolicyBn" className="sm:col-span-3">
              <Textarea id="cancellationPolicyBn" name="cancellationPolicyBn" defaultValue={settings.booking.cancellationPolicyBn} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sameDayTurnover" defaultChecked={settings.booking.sameDayTurnover} /> Same-day turnover
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="payAtHotelEnabled" defaultChecked={settings.booking.payAtHotelEnabled} /> Pay at hotel
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="autoConfirmDirect" defaultChecked={settings.booking.autoConfirmDirect} /> Auto-confirm direct bookings
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="guestSelfCancelEnabled" defaultChecked={settings.booking.guestSelfCancelEnabled} /> Guest self-cancel
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="guestModificationRequestEnabled" defaultChecked={settings.booking.guestModificationRequestEnabled} /> Guest modification requests
            </label>
            <SubmitButton>Save booking</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Tax / VAT" description="Never hardcoded. Enter the rate the hotel actually charges." />
        <CardBody>
          <ActionForm action={saveSettingsGroupAction} className="space-y-3">
            <input type="hidden" name="group" value="tax" />
            <input type="hidden" name="pricesIncludeTax__bool" value="1" />
            <Field label="Tax rules JSON" htmlFor="rules" hint='Example: [{"code":"VAT","nameEn":"VAT","nameAr":"ضريبة القيمة المضافة","nameBn":"ভ্যাট","rate":"15","enabled":true}]'>
              <Textarea id="rules" name="rules" defaultValue={JSON.stringify(settings.tax.rules, null, 2)} className="min-h-40 font-mono text-xs" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pricesIncludeTax" defaultChecked={settings.tax.pricesIncludeTax} /> Displayed prices include tax
            </label>
            <SubmitButton>Save tax</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Payments" description="Online providers are only offered when a real adapter is configured. With none, only pay-at-hotel is available." />
        <CardBody>
          <ActionForm action={saveSettingsGroupAction} className="space-y-3">
            <input type="hidden" name="group" value="payments" />
            <Field label="Provider" htmlFor="provider">
              <Select id="provider" name="provider" defaultValue={settings.payments.provider}>
                <option value="none">None (pay at hotel only)</option>
              </Select>
            </Field>
            <SubmitButton>Save payments</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notifications" />
        <CardBody>
          <ActionForm action={saveSettingsGroupAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="group" value="notifications" />
            <input type="hidden" name="emailEnabled__bool" value="1" />
            <input type="hidden" name="smsEnabled__bool" value="1" />
            <input type="hidden" name="whatsappEnabled__bool" value="1" />
            <Field label="Staff alert email" htmlFor="staffAlertEmail" className="sm:col-span-2">
              <Input id="staffAlertEmail" name="staffAlertEmail" defaultValue={settings.notifications.staffAlertEmail} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="emailEnabled" defaultChecked={settings.notifications.emailEnabled} /> Email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="smsEnabled" defaultChecked={settings.notifications.smsEnabled} /> SMS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="whatsappEnabled" defaultChecked={settings.notifications.whatsappEnabled} /> WhatsApp messages
            </label>
            <SubmitButton>Save notifications</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
    </ReadOnly>
  );
}
