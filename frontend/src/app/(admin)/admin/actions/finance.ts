"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/server/auth/action";
import { recordBankReceipt, markPayoutPaid, runReconciliation, saveReconciliation, reconcileReservation } from "@/server/services/ota-finance.service";
import { toDate } from "@/lib/dates";
import { opt, str } from "./form";

export async function runReconciliationAction(formData: FormData) {
  return adminAction("reconciliation.manage", async (user) => {
    const from = str(formData, "from");
    const to = str(formData, "to");
    const result = await runReconciliation({ from: toDate(from), to: toDate(to), userId: user.id });
    revalidatePath("/admin/finance/reconciliation");
    revalidatePath("/admin/finance");
    return result;
  });
}

export async function reconcileOneAction(formData: FormData) {
  return adminAction("reconciliation.manage", async (user) => {
    const r = await reconcileReservation(str(formData, "reservationId"));
    await saveReconciliation(r, user.id);
    revalidatePath("/admin/finance/reconciliation");
    return r;
  });
}

export async function recordBankReceiptAction(formData: FormData) {
  return adminAction("finance.manage", async (user) => {
    await recordBankReceipt({
      payoutId: opt(formData, "payoutId") ?? null,
      amount: str(formData, "amount"),
      receivedOn: str(formData, "receivedOn"),
      reference: opt(formData, "reference"),
      bankName: opt(formData, "bankName"),
      notes: opt(formData, "notes"),
      userId: user.id,
    });
    revalidatePath("/admin/finance");
    revalidatePath("/admin/finance/reconciliation");
  });
}

export async function markPayoutPaidAction(formData: FormData) {
  return adminAction("finance.manage", async (user) => {
    await markPayoutPaid(str(formData, "payoutId"), { payoutDate: str(formData, "payoutDate"), userId: user.id });
    revalidatePath("/admin/finance");
    revalidatePath("/admin/finance/reconciliation");
  });
}
