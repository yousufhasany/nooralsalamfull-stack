import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/server/auth/session";
import { isReportKind, runReport, reportToCsv } from "@/server/services/report.service";
import { isDateStr } from "@/lib/dates";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isReportKind(kind) || !isDateStr(from) || !isDateStr(to)) {
    return NextResponse.json({ error: "Invalid report request." }, { status: 400 });
  }
  const report = await runReport(kind, from, to);
  return new NextResponse(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${from}-${to}.csv"`,
    },
  });
}
