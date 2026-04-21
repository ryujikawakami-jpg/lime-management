import { db } from "@/lib/db";
import { billingAccounts } from "@/lib/db/schema";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

async function createBillingAccount(formData: FormData) {
  "use server";

  const billingCode = formData.get("billingCode") as string;
  const name = formData.get("name") as string;
  const ipAddress = (formData.get("ipAddress") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!billingCode || !name) {
    throw new Error("必須項目を入力してください");
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(billingAccounts).values({
    id,
    billingCode,
    name,
    ipAddress,
    notes,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  redirect(`/billing-accounts/${id}`);
}

export default function NewBillingAccountPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/billing-accounts" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">請求アカウント新規登録</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>請求アカウント情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createBillingAccount} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="billingCode">請求ID *</Label>
                <Input id="billingCode" name="billingCode" placeholder="K202100009" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">請求アカウント名 *</Label>
                <Input id="name" name="name" placeholder="株式会社○○" required />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ipAddress">AD1 IPアドレス</Label>
              <Input id="ipAddress" name="ipAddress" placeholder="59.139.31.99" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">備考</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit">登録する</Button>
              <Link
                href="/billing-accounts"
                className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted"
              >
                キャンセル
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
