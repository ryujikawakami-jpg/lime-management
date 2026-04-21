"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/sortable-header";
import { Network, Search } from "lucide-react";

type BillingAccountRow = {
  id: string;
  billingCode: string;
  name: string;
  ipAddress: string;
  status: string;
  groupCount: number;
  phoneCount: number;
  totalContractCh: number;
};

export function BillingAccountsTable({ rows }: { rows: BillingAccountRow[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("billingCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = rows.filter(
      (r) =>
        !q ||
        r.billingCode.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.ipAddress.toLowerCase().includes(q)
    );
    arr = [...arr].sort((a, b) => {
      let av: string | number =
        (a as Record<string, unknown>)[sortCol] as string | number ?? "";
      let bv: string | number =
        (b as Record<string, unknown>)[sortCol] as string | number ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, search, sortCol, sortDir]);

  const thCls = "text-left px-4 py-3 font-medium text-gray-600";

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="請求ID・アカウント名・IPアドレスで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 h-9 rounded-lg border border-input bg-background text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <SortableHeader
                label="請求ID"
                column="billingCode"
                currentSort={sortCol}
                currentDir={sortDir}
                onSort={handleSort}
                className={thCls}
              />
              <SortableHeader
                label="アカウント名"
                column="name"
                currentSort={sortCol}
                currentDir={sortDir}
                onSort={handleSort}
                className={thCls}
              />
              <th className={thCls}>IPアドレス</th>
              <SortableHeader
                label="グループ数"
                column="groupCount"
                currentSort={sortCol}
                currentDir={sortDir}
                onSort={handleSort}
                className={`${thCls} text-right`}
              />
              <SortableHeader
                label="番号数"
                column="phoneCount"
                currentSort={sortCol}
                currentDir={sortDir}
                onSort={handleSort}
                className={`${thCls} text-right`}
              />
              <SortableHeader
                label="契約ch合計"
                column="totalContractCh"
                currentSort={sortCol}
                currentDir={sortDir}
                onSort={handleSort}
                className={`${thCls} text-right`}
              />
              <th className={thCls}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {search
                    ? "該当する請求アカウントがありません"
                    : "請求アカウントデータがありません"}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/billing-accounts/${r.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {r.billingCode}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {r.ipAddress || "—"}
                </td>
                <td className="px-4 py-3 text-right">{r.groupCount}</td>
                <td className="px-4 py-3 text-right">{r.phoneCount}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {r.totalContractCh} ch
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={r.status === "active" ? "default" : "secondary"}
                  >
                    {r.status === "active" ? "有効" : "アーカイブ"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 px-4 py-2">
            {filtered.length}件表示
          </p>
        )}
      </div>
    </>
  );
}
