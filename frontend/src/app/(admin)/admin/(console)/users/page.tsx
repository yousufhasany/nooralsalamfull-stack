import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { saveUserAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { adminMessages } from "@/i18n/admin";

export default async function UsersPage() {
  const user = await requirePagePermission("users.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const users = await db.user.findMany({ where: { deletedAt: null }, include: { role: true }, orderBy: { createdAt: "asc" } });

  return (
    <ReadOnly locked={!can(user, "users.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title="Staff users" description="Role-based access is enforced on every server action, not only in the menu." />
      <Card className="mb-6">
        <CardHeader title="Add user" />
        <CardBody>
          <ActionForm action={saveUserAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 10 characters, upper, lower and a number.">
              <Input id="password" name="password" type="password" required />
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" defaultValue="RECEPTIONIST">
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.en}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <SubmitButton>Create user</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <div className="space-y-4">
        {users.map((u) => (
          <Card key={u.id}>
            <CardBody>
              <ActionForm action={saveUserAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={u.id} />
                <p className="sm:col-span-2 text-sm">
                  {u.email} {u.isDemo ? <Badge>DEMO</Badge> : null} {u.isActive ? null : <Badge tone="red">Inactive</Badge>}
                </p>
                <Field label="Name" htmlFor={`n-${u.id}`}>
                  <Input id={`n-${u.id}`} name="name" defaultValue={u.name} />
                </Field>
                <Field label="Email" htmlFor={`e-${u.id}`}>
                  <Input id={`e-${u.id}`} name="email" defaultValue={u.email} />
                </Field>
                <Field label="New password (optional)" htmlFor={`p-${u.id}`}>
                  <Input id={`p-${u.id}`} name="password" type="password" />
                </Field>
                <Field label="Role" htmlFor={`r-${u.id}`}>
                  <Select id={`r-${u.id}`} name="role" defaultValue={u.role.key}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.en}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={u.isActive} /> Active
                </label>
                <SubmitButton variant="outline">Save</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
    </ReadOnly>
  );
}
