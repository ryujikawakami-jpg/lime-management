"use client";
import { useRouter } from "next/navigation";

export function BillingDetailNav({ yearMonth, tenantId }: { yearMonth: string; tenantId: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      defaultValue={yearMonth}
      onChange={(e) => {
        if (e.target.value) router.push(`/billing/${e.target.value}/${tenantId}`);
      }}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}
