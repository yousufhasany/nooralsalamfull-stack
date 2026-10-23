import Link from "next/link";
import { redirect } from "next/navigation";
import { adminHomePath } from "@/server/auth/permissions";
import { can, requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard.service";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";
import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";
import { PageHeader } from "@/components/admin/page-header";
import { BarList, SparkBars } from "@/components/admin/charts";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!can(user, "dashboard.view")) redirect(adminHomePath(user.role));
  const locale = user.locale === "ar" || user.locale === "bn" ? user.locale : "en";
  const t = adminMessages(locale);
  const d = await getDashboard();
  const money = (v: string) => formatMoney(v, d.currency, locale);
  const showLedger = can(user, "finance.view");
  const showDeskMoney = showLedger || can(user, "payments.record");
  const showChannels = can(user, "channels.view");
  const attentionAllowed: Record<keyof typeof d.needsAttention, boolean> = {
    overbooked: can(user, "reservations.view"),
    channelsNeedingVerification: showChannels,
    failedSyncJobs: showChannels,
    failedInbound: showChannels,
    unmatchedReconciliation: showLedger,
    unreadMessages: can(user, "messages.view"),
    openModificationRequests: can(user, "reservations.view"),
    unknownPayment: showDeskMoney,
  };
  const attention = Object.entries(d.needsAttention).filter(([k, n]) => n > 0 && attentionAllowed[k as keyof typeof d.needsAttention]);

  return (
    <>
      <PageHeader title={t.dashboard} description={`${t.today}: ${d.today} · Asia/Riyadh`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t.arrivals} value={d.arrivalsToday} hint={<Link href="/admin/reservations?status=CONFIRMED" className="hover:underline">{t.openArrivals}</Link>} />
        <Stat label={t.departures} value={d.departuresToday} />
        <Stat label={t.inHouse} value={d.inHouse} />
        <Stat label={t.occupancy} value={`${d.occupancyTodayPct}%`} hint={fmt(t.roomsCount, { n: d.roomsTotal })} />
        <Stat label={t.dirty} value={d.dirtyRooms} tone={d.dirtyRooms ? "warn" : "default"} hint={t.dirtyHint} />
        <Stat label={t.cleaningRooms} value={d.cleaningRooms} tone={d.cleaningRooms ? "warn" : "default"} hint={t.cleaningHint} />
        {showDeskMoney ? <Stat label={t.paymentsToday} value={money(d.paymentsReceivedToday)} /> : null}
        {showDeskMoney ? <Stat label={t.outstanding} value={money(d.outstandingInHouse)} tone={Number(d.outstandingInHouse) > 0 ? "warn" : "default"} /> : null}
        {showLedger ? <Stat label={t.pendingPayouts} value={money(d.pendingPayouts.net)} hint={fmt(t.recordsCount, { n: d.pendingPayouts.count })} /> : null}
      </div>

      {attention.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title={t.needsAttention} description={t.liveCounts} />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {attention.map(([k, n]) => (
              <p key={k} className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-600">
                {t[k as keyof typeof t] ?? k}: <strong>{n}</strong>
              </p>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.occupancyNext} />
          <CardBody>
            <SparkBars label="Occupancy" points={d.occupancySeries.map((n) => ({ label: n.date, value: n.pct }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t.byChannel} />
          <CardBody>
            {d.bySource7d.length === 0 ? (
              <p className="text-sm text-ink-500">{t.none}</p>
            ) : (
              <BarList items={d.bySource7d.map((s) => ({ key: s.source, label: label.source(s.source, locale), value: s.count }))} />
            )}
          </CardBody>
        </Card>
        {showLedger ? <Card className="lg:col-span-2">
          <CardHeader title={t.revenueMtd} description={t.revenueNote} />
          <CardBody>
            {d.revenueMtd.length === 0 ? (
              <p className="text-sm text-ink-500">{t.none}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs uppercase text-ink-500">
                      <th className="py-2">{t.channel}</th>
                      <th className="py-2 text-end">{t.gross}</th>
                      <th className="py-2 text-end">{t.commission}</th>
                      <th className="py-2 text-end">{t.net}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.revenueMtd.map((r) => (
                      <tr key={r.source} className="border-t border-sand-200">
                        <td className="py-2">{label.source(r.source, locale)}</td>
                        <td className="py-2 text-end tabular-nums">{money(r.gross)}</td>
                        <td className="py-2 text-end tabular-nums">{money(r.commission)}</td>
                        <td className="py-2 text-end tabular-nums">{money(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card> : null}
      </div>
    </>
  );
}
