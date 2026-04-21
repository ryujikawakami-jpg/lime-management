import { redirect } from "next/navigation";

export default function BillingPage() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  redirect(`/billing/${ym}`);
}
