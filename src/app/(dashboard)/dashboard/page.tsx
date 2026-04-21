import { db } from "@/lib/db";
import { tenants, monthlyUsages, billingAccounts, channelGroups, auditLogs, users } from "@/lib/db/schema";
import { eq, sum, count, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Users,
  Network,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  History,
} from "lucide-react";
import { formatYen } from "@/lib/format";

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.floor(hr / 24)}日前`;
}

function actionTypeLabel(type: string) {
  const map: Record<string, string> = {
    tenant_create: "テナント登録",
    tenant_update: "テナント更新",
    user_create: "ユーザー追加",
    user_update: "ユーザー更新",
    user_delete: "ユーザー削除",
    pack_create: "パック追加",
    pack_update: "パック更新",
    pack_disable: "パック無効化",
    sf_send: "SF送信",
    import: "インポート",
    action_create: "アクション登録",
    action_update: "アクション更新",
    billing_account_create: "請求アカウント登録",
    billing_account_update: "請求アカウント更新",
  };
  return map[type] ?? type;
}

export default async function DashboardPage() {
  const ym = currentYearMonth();

  const [{ total: activeTenants }] = await db
    .select({ total: count() })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const usageStats = await db
    .select({
      sfStatus: monthlyUsages.sfStatus,
      cnt: count(),
      totalOverage: sum(monthlyUsages.overageCharge),
      totalPackPrice: sum(monthlyUsages.totalPackPrice),
      totalCost: sum(monthlyUsages.rawCost),
    })
    .from(monthlyUsages)
    .where(eq(monthlyUsages.yearMonth, ym))
    .groupBy(monthlyUsages.sfStatus);

  const inputDone = usageStats.reduce((s, r) => s + Number(r.cnt), 0);
  const sfPending = usageStats
    .filter((r) => r.sfStatus === "未送信")
    .reduce((s, r) => s + Number(r.cnt), 0);

  const totalRevenue = usageStats.reduce(
    (s, r) => s + Number(r.totalPackPrice ?? 0) + Number(r.totalOverage ?? 0),
    0
  );
  const totalCost = usageStats.reduce((s, r) => s + Number(r.totalCost ?? 0), 0);
  const grossProfit = totalRevenue - totalCost;

  const accountList = await db
    .select({
      id: billingAccounts.id,
      billingCode: billingAccounts.billingCode,
      name: billingAccounts.name,
      totalCh: sql<number>`coalesce(sum(${channelGroups.contractCh}), 0)`,
    })
    .from(billingAccounts)
    .leftJoin(channelGroups, eq(channelGroups.billingAccountId, billingAccounts.id))
    .where(eq(billingAccounts.status, "active"))
    .groupBy(billingAccounts.id)
    .orderBy(billingAccounts.billingCode);

  const recentLogs = await db
    .select({
      id: auditLogs.id,
      actionType: auditLogs.actionType,
      message: auditLogs.message,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">
          {ym.replace("-", "年")}月 — 請求管理状況
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4" />
              有効テナント
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeTenants}</p>
            <p className="text-xs text-gray-400 mt-1">社</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              使用量入力済み
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {inputDone}
              <span className="text-lg text-gray-400">/{activeTenants}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">テナント</p>
          </CardContent>
        </Card>

        <Card className={sfPending > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              SF送信待ち
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{sfPending}</p>
            <p className="text-xs text-gray-400 mt-1">件</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              当月推定粗利
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatYen(grossProfit)}</p>
            <p className="text-xs text-gray-400 mt-1">
              売上: {formatYen(totalRevenue)} / 原価: {formatYen(totalCost)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">SF送信待ち</CardTitle>
            <Link href={`/billing/${ym}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
              一覧へ <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {sfPending === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">送信待ちはありません</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-sm font-medium text-amber-800">
                    {ym.replace("-", "年")}月分
                  </span>
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {sfPending}件 未送信
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">請求アカウント ch状況</CardTitle>
            <Link href="/billing-accounts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
              一覧へ <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {accountList.slice(0, 5).map((a) => (
                <div key={a.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Link href={`/billing-accounts/${a.id}`} className="font-mono text-blue-600 hover:underline">
                      {a.billingCode}
                    </Link>
                    <span className="text-gray-500 text-xs truncate ml-2 max-w-[200px]">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{Number(a.totalCh)}ch</span>
                  </div>
                </div>
              ))}
              {accountList.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">請求アカウントデータがありません</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              更新履歴
            </CardTitle>
            <Link href="/activity" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
              もっと見る <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">履歴がありません</p>
            ) : (
              <ul className="space-y-3">
                {recentLogs.map((log) => (
                  <li key={log.id} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 whitespace-nowrap">
                      {actionTypeLabel(log.actionType)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 truncate">
                        {log.message ?? `${actionTypeLabel(log.actionType)}が実行されました`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {log.userName ?? "システム"} · {relativeTime(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
