import { requirePagePermission, can } from "@/server/auth/session";
import { listChannelsForAdmin } from "@/server/services/channel.service";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/admin/form-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/form";
import { label } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import {
  connectChannelAction,
  disconnectChannelAction,
  importReservationsAction,
  saveChannelConfigAction,
  syncChannelAction,
  testChannelAction,
} from "@/app/(admin)/admin/actions/channels";

const statusTone: Record<string, "green" | "red" | "amber" | "gray" | "neutral"> = {
  CONNECTED: "green",
  ERROR: "red",
  NOT_CONNECTED: "neutral",
  DISCONNECTED: "gray",
};

export default async function ChannelsPage() {
  const user = await requirePagePermission("channels.view");
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const channels = await listChannelsForAdmin();
  const manage = can(user, "channels.manage");

  return (
    <>
      <PageHeader
        title="Channels"
        description="A channel is only shown as Connected after a successful provider test. No fake Booking.com / Agoda / Trip.com / Expedia APIs are used."
      />
      <div className="space-y-6">
        {channels.map((ch) => {
          const st = ch.connection?.status ?? "NOT_CONNECTED";
          return (
            <Card key={ch.id}>
              <CardHeader
                title={ch.name}
                description={ch.provider.isSimulation ? "DEVELOPMENT ONLY — never used in production." : ch.provider.requirements.summary}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone[st]}>{label.connection(st, locale)}</Badge>
                    {ch.provider.isImplemented ? <Badge tone="green">Connector ready</Badge> : <Badge>Architecture only</Badge>}
                  </div>
                }
              />
              <CardBody className="space-y-4 text-sm">
                {ch.connection?.inventoryNeedsVerification ? (
                  <p className="rounded-lg bg-warn-50 px-3 py-2 text-warn-600">
                    Channel synchronization issue — inventory requires verification. Last error: {ch.connection.lastError ?? "unknown"}
                  </p>
                ) : null}
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-500">Last sync</dt>
                    <dd>{ch.connection?.lastSyncAt ? formatDateTime(ch.connection.lastSyncAt, locale) : "Never"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Last successful sync</dt>
                    <dd>{ch.connection?.lastSuccessfulSyncAt ? formatDateTime(ch.connection.lastSuccessfulSyncAt, locale) : "Never"}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Last test</dt>
                    <dd>
                      {ch.connection?.lastTestAt ? formatDateTime(ch.connection.lastTestAt, locale) : "Never"}
                      {ch.connection?.lastTestMessage ? ` — ${ch.connection.lastTestMessage}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Mappings / reservations</dt>
                    <dd>
                      {ch.counts.roomMappings} rooms · {ch.counts.rateMappings} rates · {ch.counts.reservations} bookings
                    </dd>
                  </div>
                </dl>
                <details className="rounded-xl bg-sand-50 p-3">
                  <summary className="cursor-pointer font-medium">Setup required</summary>
                  <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-600">
                    {ch.provider.requirements.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="mt-2">
                    <a className="text-brand-800 underline" href={ch.provider.requirements.docsUrl} target="_blank" rel="noreferrer">
                      Official documentation
                    </a>
                  </p>
                </details>
                {manage ? (
                  <div className="space-y-3 border-t border-sand-200 pt-4">
                    <ActionForm action={saveChannelConfigAction} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="channelId" value={ch.id} />
                      <Field label="Hotel / property ID at the provider" htmlFor={`hid-${ch.id}`} className="sm:col-span-2">
                        <Input id={`hid-${ch.id}`} name="hotelExternalId" defaultValue={ch.connection?.hotelExternalId ?? ""} />
                      </Field>
                      {ch.provider.requirements.credentialFields.map((f) => (
                        <Field key={f.key} label={f.label} htmlFor={`${ch.id}-${f.key}`} hint={f.secret ? "Leave blank to keep the stored secret." : undefined}>
                          <Input
                            id={`${ch.id}-${f.key}`}
                            name={`cred:${f.key}`}
                            type={f.secret ? "password" : "text"}
                            autoComplete="off"
                            placeholder={f.secret && ch.connection?.hasCredentials ? "•••• stored" : ""}
                          />
                        </Field>
                      ))}
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input type="checkbox" name="rotateWebhookSecret" /> Rotate webhook secret (shown once after save)
                      </label>
                      <SubmitButton variant="outline">Save configuration</SubmitButton>
                    </ActionForm>
                    <div className="flex flex-wrap gap-2">
                      <ActionForm action={testChannelAction}>
                        <input type="hidden" name="channelId" value={ch.id} />
                        <SubmitButton variant="outline">Test connection</SubmitButton>
                      </ActionForm>
                      <ActionForm action={connectChannelAction}>
                        <input type="hidden" name="channelId" value={ch.id} />
                        <SubmitButton>Connect</SubmitButton>
                      </ActionForm>
                      <ActionForm action={disconnectChannelAction}>
                        <input type="hidden" name="channelId" value={ch.id} />
                        <ConfirmSubmit name="x" value="1" label="Disconnect" message="Disconnect this channel?" />
                      </ActionForm>
                      <ActionForm action={syncChannelAction}>
                        <input type="hidden" name="channelId" value={ch.id} />
                        <SubmitButton variant="outline">Sync now</SubmitButton>
                      </ActionForm>
                      <ActionForm action={importReservationsAction}>
                        <input type="hidden" name="channelId" value={ch.id} />
                        <SubmitButton variant="outline">Import existing reservations</SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
