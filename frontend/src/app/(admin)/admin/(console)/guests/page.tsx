import Link from "next/link";
import { can, requirePagePermission } from "@/server/auth/session";
import { listGuests } from "@/server/services/reservation-query.service";
import { deleteGuestAction } from "@/app/(admin)/admin/actions/ops";
import { PageHeader, Pager } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmSubmit } from "@/components/admin/form-status";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { adminMessages } from "@/i18n/admin";
import { fmt } from "@/i18n/dictionary";

export default async function GuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePagePermission("guests.view");
  const t = adminMessages(user.locale === "ar" || user.locale === "bn" ? user.locale : "en");
  const q = await searchParams;
  const query = typeof q.q === "string" ? q.q : undefined;
  const page = Number(typeof q.page === "string" ? q.page : 1);
  const data = await listGuests({ q: query, page });

  return (
    <>
      <PageHeader title={t.guests} description={t.guestsIntro} />
      <form method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={query} placeholder="Name, email or phone" />
        <button className={buttonVariants({ size: "sm" })} type="submit">
          Search
        </button>
      </form>
      <DataTable
        rows={data.rows}
        rowKey={(g) => g.id}
        empty={<EmptyState title="No guests match." />}
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (g) => (
              <Link href={`/admin/guests/${g.id}`} className="font-medium text-brand-800 hover:underline">
                {g.firstName} {g.lastName}
                {g.isDemo ? <span className="ms-2 text-xs text-ink-400">DEMO</span> : null}
              </Link>
            ),
          },
          { key: "email", header: "Email", cell: (g) => g.email ?? "—" },
          { key: "phone", header: "Phone", cell: (g) => g.phone ?? "—" },
          { key: "nat", header: "Nationality", cell: (g) => g.nationality ?? "—", hideOnMobile: true },
          { key: "stays", header: "Stays", align: "end", cell: (g) => g._count.reservations },
          {
            key: "delete",
            header: "",
            cell: (g) =>
              can(user, "guests.delete") ? (
                <ActionForm action={deleteGuestAction}>
                  <input type="hidden" name="guestId" value={g.id} />
                  <ConfirmSubmit name="go" value="1" label={t.delete} message={fmt(t.deleteGuestConfirm, { n: `${g.firstName} ${g.lastName}` })} />
                </ActionForm>
              ) : null,
          },
        ]}
      />
      <Pager page={data.page} pages={data.pages} href={(p) => `/admin/guests?q=${encodeURIComponent(query ?? "")}&page=${p}`} />
    </>
  );
}
