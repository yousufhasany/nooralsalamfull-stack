import { redirect } from "next/navigation";

export default function InventoryStockRedirect() {
  redirect("/admin/inventory");
}
