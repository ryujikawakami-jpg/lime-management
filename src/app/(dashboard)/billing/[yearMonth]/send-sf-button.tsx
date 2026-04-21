"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  tenants: { tenantId: string; companyName: string }[];
  yearMonth: string;
  bulk?: boolean;
}

export function SendSfButton({ tenants, yearMonth, bulk }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      for (const t of tenants) {
        const res = await fetch("/api/billing/send-sf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: t.tenantId, yearMonth }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `${t.companyName}: 送信失敗`);
        }
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={bulk ? "default" : "outline"}
        size="sm"
        onClick={handleSend}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {bulk ? `一括SF送信 (${tenants.length}件)` : "SF送信"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
