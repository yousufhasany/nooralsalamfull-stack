import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { markMessageReadAction } from "@/app/(admin)/admin/actions/ops";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { adminMessages } from "@/i18n/admin";

export default async function MessagesPage() {
  const user = await requirePagePermission("messages.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const messages = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <>
      <PageHeader title="Contact messages" />
      <div className="space-y-3">
        {messages.length === 0 ? <p className="text-sm text-ink-500">No messages yet.</p> : null}
        {messages.map((m) => (
          <Card key={m.id} className={m.isRead ? "opacity-80" : ""}>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {m.name} · {m.email}
                    {m.phone ? ` · ${m.phone}` : ""}
                  </p>
                  <p className="text-xs text-ink-500">{formatDateTime(m.createdAt)}</p>
                  {m.subject ? <p className="mt-1 text-sm font-medium">{m.subject}</p> : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
                </div>
                {!m.isRead && can(user, "messages.view") ? (
                  <ActionForm action={markMessageReadAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton variant="outline">Mark read</SubmitButton>
                  </ActionForm>
                ) : (
                  <span className="text-xs text-ink-400">Read</span>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
