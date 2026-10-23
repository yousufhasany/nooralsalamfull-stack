import { can, requirePagePermission } from "@/server/auth/session";
import { getHotel } from "@/server/services/settings.service";
import { listSimpleInventory } from "@/server/services/inventory.service";
import { recordCleaningUseAction, saveSimpleInventoryAction } from "@/app/(admin)/admin/actions/inventory";
import { todayIn, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

export default async function InventoryPage() {
  const user = await requirePagePermission("inventory.view");
  const hotel = await getHotel();
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const rows = await listSimpleInventory();
  const manage = can(user, "inventory.manage");
  const cleaning = can(user, "inventory.issue") && !manage;
  const money = (v: { toFixed(n: number): string }) => formatMoney(v.toFixed(2), hotel.currency, locale);
  const qty = (v: { toFixed(n: number): string }) => v.toFixed(3).replace(/\.?0+$/, "");

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          cleaning
            ? "Choose the product housekeeping uses and the quantity needed for cleaning. That quantity is taken off the stock."
            : "Each product is one row. Enter the same name again to update its date, quantity, and price."
        }
      />
      {cleaning ? (
        <Card className="mb-6">
          <CardBody>
            <h2 className="font-medium text-brand-900">Used for cleaning</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">No products yet. A manager adds them before housekeeping can record use.</p>
            ) : (
              <ActionForm action={recordCleaningUseAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
                <Field label="Product name" htmlFor="itemId">
                  <Select id="itemId" name="itemId" required>
                    {rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {qty(row.quantity)} on hand
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity" htmlFor="cleaning-qty">
                  <Input id="cleaning-qty" name="quantity" inputMode="decimal" required />
                </Field>
                <SubmitButton>Update stock</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      ) : null}
      {manage ? (
        <Card className="mb-6">
          <CardBody>
            <ActionForm action={saveSimpleInventoryAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <Field label="Date" htmlFor="date">
                <Input id="date" name="date" type="date" required defaultValue={todayIn(hotel.timezone)} />
              </Field>
              <Field label="Product name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Quantity" htmlFor="quantity">
                <Input id="quantity" name="quantity" inputMode="decimal" required />
              </Field>
              <Field label="Price" htmlFor="price">
                <Input id="price" name="price" inputMode="decimal" required />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs uppercase text-ink-500">
                <th className="py-2 text-start">Date</th>
                <th className="py-2 text-start">Product name</th>
                <th className="py-2 text-end">Quantity</th>
                <th className="py-2 text-end">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-sand-200">
                  <td className="py-2">{formatDate(row.date, locale)}</td>
                  <td className="py-2">{row.name}</td>
                  <td className="py-2 text-end tabular-nums">{qty(row.quantity)}</td>
                  <td className="py-2 text-end tabular-nums">{money(row.price)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-ink-500">
                    No products yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </>
  );
}
