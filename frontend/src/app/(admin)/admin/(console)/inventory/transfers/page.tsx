import { redirect } from "next/navigation";

export default function InventoryTransfersRedirect() {
  redirect("/admin/inventory");
}
