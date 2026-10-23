import { can, requirePagePermission } from "@/server/auth/session";
import { ROLE_LABELS, type Permission } from "@/server/auth/permissions";
import { listAuditHistory } from "@/server/services/audit.service";
import { deleteAuditHistoryAction } from "@/app/(admin)/admin/actions/ops";
import { adminMessages } from "@/i18n/admin";
import { formatDateTime } from "@/lib/dates";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit } from "@/components/admin/form-status";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

function brief(value: unknown): string {
  if (value == null || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 6)
    .map(([key, v]) => `${key}: ${typeof v === "object" ? "…" : String(v)}`)
    .join(" · ");
}

export default async function HistoryPage() {
  const user = await requirePagePermission("audit.view" satisfies Permission);
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const rows = await listAuditHistory();
  const canDelete = can(user, "audit.delete");

  return (
    <>
      <PageHeader title={t.history} description={`${t.historyIntro} ${t.historyDeleteOnly}`} />
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        empty={t.none}
        columns={[
          {
            key: "when",
            header: t.when,
            cell: (row) => formatDateTime(row.createdAt, locale),
          },
          {
            key: "who",
            header: t.changedBy,
            cell: (row) => {
              const role = row.user?.role.key;
              const staff = role && role !== "SUPER_ADMIN";
              return (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{row.user?.name ?? t.system}</span>
                  {role ? <span className="text-ink-500">{ROLE_LABELS[role][locale]}</span> : null}
                  {staff ? <Badge tone="amber">{t.staffChange}</Badge> : null}
                </span>
              );
            },
          },
          { key: "action", header: t.action, cell: (row) => row.action.replaceAll("_", " ") },
          {
            key: "record",
            header: t.record,
            cell: (row) => (
              <span>
                {row.entity}
                {row.entityId ? <span className="text-ink-500"> · {row.entityId.slice(0, 8)}</span> : null}
              </span>
            ),
          },
          {
            key: "details",
            header: t.details,
            hideOnMobile: true,
            cell: (row) => {
              const before = brief(row.before);
              const after = brief(row.after);
              const text = before && after ? `${before} → ${after}` : after || before;
              return <span className="text-ink-600">{text || "—"}</span>;
            },
          },
          ...(canDelete
            ? [
                {
                  key: "delete",
                  header: "",
                  cell: (row: (typeof rows)[number]) => (
                    <ActionForm action={deleteAuditHistoryAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <ConfirmSubmit name="go" value="1" label={t.delete} message={t.deleteHistoryConfirm} />
                    </ActionForm>
                  ),
                } satisfies Column<(typeof rows)[number]>,
              ]
            : []),
        ]}
      />
    </>
  );
}
