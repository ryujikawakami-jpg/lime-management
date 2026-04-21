"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2 } from "lucide-react";

interface PreviewRow {
  companyName: string;
  destinationType: string;
  durationSeconds: number;
  cost: number;
  callDate: string;
  phoneNumber: string;
}

interface ImportResult {
  success: number;
  unmatched: string[];
  errors: string[];
}

export function ImportForm() {
  const [yearMonth, setYearMonth] = useState("");
  const [adjustOneFile, setAdjustOneFile] = useState<File | null>(null);
  const [proDelightFile, setProDelightFile] = useState<File | null>(null);
  const [adjustOnePreview, setAdjustOnePreview] = useState<PreviewRow[]>([]);
  const [proDelightPreview, setProDelightPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ adjustOne?: ImportResult; proDelight?: ImportResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseAdjustOneCsv = (text: string): PreviewRow[] => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1, 11).map((line) => {
      const cols = line.split(",");
      return {
        companyName: cols[16]?.trim() ?? "",
        destinationType: cols[7]?.trim().includes("携帯") ? "携帯" : "固定",
        durationSeconds: parseInt(cols[13]?.trim() ?? "0", 10) || 0,
        cost: parseFloat(cols[14]?.trim() ?? "0") || 0,
        callDate: cols[9]?.trim() ?? "",
        phoneNumber: cols[5]?.trim() ?? "",
      };
    });
  };

  const parseProDelightCsv = (text: string): PreviewRow[] => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1, 11).map((line) => {
      const cols = line.split(",");
      return {
        companyName: cols[3]?.trim() ?? "", // 発信番号で後で照合
        destinationType: cols[5]?.trim().includes("携帯") ? "携帯" : "固定",
        durationSeconds: parseInt(cols[7]?.trim() ?? "0", 10) || 0,
        cost: parseFloat(cols[8]?.trim() ?? "0") || 0,
        callDate: (cols[6]?.trim() ?? "").split(" ")[0] ?? "",
        phoneNumber: cols[3]?.trim() ?? "",
      };
    });
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "adjustOne" | "proDelight"
  ) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const preview =
        source === "adjustOne"
          ? parseAdjustOneCsv(text)
          : parseProDelightCsv(text);
      if (source === "adjustOne") {
        setAdjustOneFile(file);
        setAdjustOnePreview(preview);
      } else {
        setProDelightFile(file);
        setProDelightPreview(preview);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleImport = async () => {
    if (!yearMonth) {
      setError("対象年月を入力してください");
      return;
    }
    if (!adjustOneFile && !proDelightFile) {
      setError("CSVファイルを選択してください");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("yearMonth", yearMonth);
      if (adjustOneFile) formData.append("adjustOne", adjustOneFile);
      if (proDelightFile) formData.append("proDelight", proDelightFile);

      const res = await fetch("/api/billing/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "インポートに失敗しました");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Year Month */}
      <Card>
        <CardHeader>
          <CardTitle>対象年月</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="yearMonth">年月 *</Label>
            <Input
              id="yearMonth"
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              required
            />
          </div>
        </CardContent>
      </Card>

      {/* File Upload Areas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              AdjustOne CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-6 w-6 text-gray-400 mb-1" />
              <span className="text-sm text-gray-500">
                {adjustOneFile ? adjustOneFile.name : "クリックしてファイルを選択"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFileChange(e, "adjustOne")}
              />
            </label>
            {adjustOnePreview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">プレビュー（最初の10行）</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 text-gray-500">会社名</th>
                        <th className="text-left py-1 text-gray-500">種別</th>
                        <th className="text-right py-1 text-gray-500">秒数</th>
                        <th className="text-right py-1 text-gray-500">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustOnePreview.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-1 truncate max-w-24">{row.companyName}</td>
                          <td className="py-1">{row.destinationType}</td>
                          <td className="py-1 text-right">{row.durationSeconds}s</td>
                          <td className="py-1 text-right">¥{row.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              ProDelight CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-6 w-6 text-gray-400 mb-1" />
              <span className="text-sm text-gray-500">
                {proDelightFile ? proDelightFile.name : "クリックしてファイルを選択"}
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFileChange(e, "proDelight")}
              />
            </label>
            {proDelightPreview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">プレビュー（最初の10行）</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 text-gray-500">発信番号</th>
                        <th className="text-left py-1 text-gray-500">種別</th>
                        <th className="text-right py-1 text-gray-500">秒数</th>
                        <th className="text-right py-1 text-gray-500">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proDelightPreview.map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-1 font-mono">{row.phoneNumber}</td>
                          <td className="py-1">{row.destinationType}</td>
                          <td className="py-1 text-right">{row.durationSeconds}s</td>
                          <td className="py-1 text-right">¥{row.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>インポート結果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.adjustOne && (
              <div>
                <p className="text-sm font-medium mb-1">AdjustOne</p>
                <div className="flex gap-3">
                  <Badge variant="default">成功: {result.adjustOne.success}件</Badge>
                  {result.adjustOne.unmatched.length > 0 && (
                    <Badge variant="secondary">未照合: {result.adjustOne.unmatched.length}件</Badge>
                  )}
                </div>
                {result.adjustOne.unmatched.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-amber-700 mb-1">未照合一覧（{result.adjustOne.unmatched.length}件）:</p>
                    <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2">
                      {result.adjustOne.unmatched.map((u, i) => (
                        <p key={i} className="text-xs text-amber-800 font-mono">{u}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {result.proDelight && (
              <div>
                <p className="text-sm font-medium mb-1">ProDelight</p>
                <div className="flex gap-3">
                  <Badge variant="default">成功: {result.proDelight.success}件</Badge>
                  {result.proDelight.unmatched.length > 0 && (
                    <Badge variant="secondary">未照合: {result.proDelight.unmatched.length}件</Badge>
                  )}
                </div>
                {result.proDelight.unmatched.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-amber-700 mb-1">未照合一覧（{result.proDelight.unmatched.length}件）:</p>
                    <div className="max-h-32 overflow-y-auto bg-amber-50 border border-amber-200 rounded p-2">
                      {result.proDelight.unmatched.map((u, i) => (
                        <p key={i} className="text-xs text-amber-800 font-mono">{u}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <Button onClick={handleImport} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          インポート実行
        </Button>
      </div>
    </div>
  );
}
