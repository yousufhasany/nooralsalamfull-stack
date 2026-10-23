import { requirePagePermission } from "@/server/auth/session";
import { getHotel } from "@/server/services/settings.service";
import { isReportKind, REPORT_KINDS, runReport } from "@/server/services/report.service";
import { startOfMonth, todayIn } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("reports.view");
  const hotel = await getHotel();
  const q = await searchParams;
  const today = todayIn(hotel.timezone);
  const kind = typeof q.kind === "string" && isReportKind(q.kind) ? q.kind : "reservations";
  const from = typeof q.from === "string" ? q.from : startOfMonth(today);
  const to = typeof q.to === "string" ? q.to : today;
  const report = await runReport(kind, from, to).catch(() => null);

  return (
    <>
      <PageHeader title="Reports" description="All numbers are from live reservations, ledger rows and payments." />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="Report" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={kind}>
            {REPORT_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={to} />
        </Field>
        <button className={buttonVariants({ size: "sm" })} type="submit">
          Run
        </button>
        <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/admin/reports/export?kind=${kind}&from=${from}&to=${to}`}>
          Export CSV
        </a>
      </form>
      {report ? (
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold">{report.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase text-ink-500">
                    {report.columns.map((c) => (
                      <th key={c.key} className={c.numeric ? "text-end" : ""}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i} className="border-t border-sand-100">
                      {report.columns.map((c) => (
                        <td key={c.key} className={c.numeric ? "text-end tabular-nums" : ""}>
                          {row[c.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {report.totals ? (
                  <tfoot>
                    <tr className="border-t border-sand-300 font-medium">
                      {report.columns.map((c) => (
                        <td key={c.key} className={c.numeric ? "text-end tabular-nums" : ""}>
                          {report.totals?.[c.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="text-sm text-ink-500">Choose a valid date range of at most one year.</p>
      )}
    </>
  );
}
