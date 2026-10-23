import { requireUser } from "@/server/auth/session";
import { AdminShell } from "@/components/admin/shell";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
