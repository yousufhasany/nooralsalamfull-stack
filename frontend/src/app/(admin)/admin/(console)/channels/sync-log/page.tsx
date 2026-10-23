import { can, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ReadOnly } from "@/components/admin/read-only";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/form-status";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/dates";
import { retryInboundAction, retryJobAction } from "@/app/(admin)/admin/actions/channels";
import { adminMessages } from "@/i18n/admin";

const tone: Record<string, "green" | "red" | "amber" | "neutral"> = {
  SUCCESS: "green",
  FAILED: "red",
  PARTIAL: "amber",
  PENDING: "neutral",
  SUCCEEDED: "green",
  RUNNING: "amber",
};

export default async function SyncLogPage() {
  const user = await requirePagePermission("channels.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const [logs, jobs, events] = await Promise.all([
    db.channelSyncLog.findMany({ include: { channel: true }, orderBy: { startedAt: "desc" }, take: 80 }),
    db.syncJob.findMany({ include: { channel: true }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.channelWebhookEvent.findMany({ include: { channel: true }, orderBy: { receivedAt: "desc" }, take: 40 }),
  ]);

  return (
    <ReadOnly locked={!can(user, "channels.manage")} notice={t.viewOnly}>
    <>
      <PageHeader title="Channel sync log" description="Failed jobs retry with exponential backoff. They are never silently ignored." />
      <h2 className="mb-2 font-semibold">Work queue</h2>
      <DataTable
        rows={jobs}
        rowKey={(j) => j.id}
        columns={[
          { key: "ch", header: "Channel", cell: (j) => j.channel.name },
          { key: "op", header: "Operation", cell: (j) => j.operation },
          { key: "st", header: "Status", cell: (j) => <Badge tone={tone[j.status]}>{j.status}</Badge> },
          { key: "att", header: "Attempts", cell: (j) => `${j.attempts}/${j.maxAttempts}` },
          { key: "err", header: "Error", cell: (j) => j.lastError ?? "—" },
          {
            key: "retry",
            header: "",
            cell: (j) =>
              j.status === "FAILED" ? (
                <ActionForm action={retryJobAction}>
                  <input type="hidden" name="jobId" value={j.id} />
                  <SubmitButton variant="outline">Retry</SubmitButton>
                </ActionForm>
              ) : null,
          },
        ]}
      />
      <h2 className="mb-2 mt-8 font-semibold">Sync history</h2>
      <DataTable
        rows={logs}
        rowKey={(l) => l.id}
        columns={[
          { key: "ch", header: "Channel", cell: (l) => l.channel.name },
          { key: "op", header: "Operation", cell: (l) => l.operation },
          { key: "st", header: "Status", cell: (l) => <Badge tone={tone[l.status]}>{l.status}</Badge> },
          { key: "n", header: "Records", cell: (l) => l.recordCount },
          { key: "when", header: "Started", cell: (l) => formatDateTime(l.startedAt) },
          { key: "err", header: "Error", cell: (l) => l.error ?? "—" },
        ]}
      />
      <h2 className="mb-2 mt-8 font-semibold">Inbound events (idempotent)</h2>
      <DataTable
        rows={events}
        rowKey={(e) => e.id}
        columns={[
          { key: "ch", header: "Channel", cell: (e) => e.channel.name },
          { key: "id", header: "External event", cell: (e) => e.externalEventId },
          { key: "type", header: "Type", cell: (e) => e.eventType },
          { key: "st", header: "Status", cell: (e) => <Badge tone={tone[e.status] ?? "neutral"}>{e.status}</Badge> },
          { key: "sig", header: "Signature", cell: (e) => (e.signatureValid ? "Valid" : "Rejected / unsigned") },
          {
            key: "retry",
            header: "",
            cell: (e) =>
              e.status === "FAILED" ? (
                <ActionForm action={retryInboundAction}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <SubmitButton variant="outline">Retry</SubmitButton>
                </ActionForm>
              ) : null,
          },
        ]}
      />
    </>
    </ReadOnly>
  );
}
