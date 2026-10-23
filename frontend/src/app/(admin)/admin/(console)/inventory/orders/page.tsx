import { redirect } from "next/navigation";

export default function InventoryOrdersRedirect() {
  redirect("/admin/inventory");
}
