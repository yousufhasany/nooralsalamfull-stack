import { redirect } from "next/navigation";

export default function InventoryItemsRedirect() {
  redirect("/admin/inventory");
}
