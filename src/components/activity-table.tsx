"use client";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { SortableHeader } from "@/components/sortable-header";

type ActivityRow = {
  id: string;
  actionType: string;
  message: string | null;
  targetTable: string | null;
  createdAt: string;
  userName: string | null;
};

const ACTION_TYPE_LABELS: Record<string, string> = {
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
  circuit_create: "回線登録",
  circuit_update: "回線更新",
};

function actionTypeLabel(type: string) {
  return ACTION_TYPE_LABELS[type] ?? type;
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

export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter((r) =>
      !q ||
      actionTypeLabel(r.actionType).includes(q) ||
      (r.message ?? "").toLowerCase().includes(q) ||
      (r.userName ?? "").toLowerCase().includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string, bv: string;
      if (sortCol === "actionType") {
        av = actionTypeLabel(a.actionType);
        bv = actionTypeLabel(b.actionType);
      } else if (sortCol === "userName") {
        av = a.userName ?? "";
        bv = b.userName ?? "";
      } else if (sortCol === "message") {
        av = a.message ?? "";
        bv = b.message ?? "";
      } else {
        av = a.createdAt;
        bv = b.createdAt;
      }
      av = av.toLowerCase();
      bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600 text-sm";

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="種別・内容・実行者で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader label="種別" column="actionType" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="内容" column="message" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="実行者" column="userName" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
              <SortableHeader label="日時" column="createdAt" currentSort={sortCol} currentDir={sortDir} onSort={handleSort} className={thCls} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                  {search ? "該当データがありません" : "履歴がありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {actionTypeLabel(r.actionType)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800 max-w-md">
                  {r.message ?? `${actionTypeLabel(r.actionType)}が実行されました`}
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {r.userName ?? "システム"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  <span title={r.createdAt.replace("T", " ").slice(0, 16)}>
                    {relativeTime(r.createdAt)}
                  </span>
                  <span className="ml-2 opacity-70">{r.createdAt.replace("T", " ").slice(0, 16)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 px-4 py-2">{filtered.length}件表示</p>
        )}
      </div>
    </>
  );
}
