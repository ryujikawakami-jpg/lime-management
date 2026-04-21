import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLogs, tenants, phoneNumbers, tenantAssignments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { calculateMonthlyBilling } from "@/lib/billing";
import { logActivity } from "@/lib/audit";

interface ImportResult {
  success: number;
  unmatched: string[];
  errors: string[];
}

// Parse AdjustOne CSV
// 請求アカウント,請求アカウント名称,請求月,利用月,部署名,ご利用番号,関連契約番号,通話種別名称,着信番号,通話開始年月日,通話開始時間,通話先電話番号,通話先地域,通話時間,通話料金,利用番号,利用顧客
async function importAdjustOne(
  text: string,
  yearMonth: string
): Promise<ImportResult> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { success: 0, unmatched: [], errors: [] };

  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants);

  const tenantMap = new Map(allTenants.map((t) => [t.companyName.trim(), t.id]));

  const now = new Date().toISOString();
  let success = 0;
  const unmatched = new Set<string>();
  const errors: string[] = [];
  const affectedTenants = new Set<string>();

  const dataLines = lines.slice(1);
  const batchSize = 100;

  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const inserts = [];

    for (const line of batch) {
      const cols = parseCsvLine(line);
      if (cols.length < 17) continue;

      const callTypeName = cols[7]?.trim() ?? "";
      const destinationType: "固定" | "携帯" = callTypeName.includes("携帯") ? "携帯" : "固定";
      const durationSeconds = parseInt(cols[13]?.trim() ?? "0", 10) || 0;
      const cost = parseFloat(cols[14]?.trim() ?? "0") || 0;
      const callDate = cols[9]?.trim() ?? "";
      const phoneNumber = cols[5]?.trim() ?? "";
      const destinationNumber = cols[8]?.trim() ?? "";
      const companyName = cols[16]?.trim() ?? "";

      if (!companyName) continue;

      const tenantId = tenantMap.get(companyName);
      if (!tenantId) {
        unmatched.add(companyName);
        continue;
      }

      inserts.push({
        id: randomUUID(),
        tenantId,
        yearMonth,
        callDate,
        phoneNumber,
        destinationNumber,
        destinationType,
        durationSeconds,
        cost,
        source: "AdjustOne" as const,
        importedAt: now,
      });
      affectedTenants.add(tenantId);
      success++;
    }

    if (inserts.length > 0) {
      await db.insert(callLogs).values(inserts);
    }
  }

  // Recalculate billing for affected tenants
  for (const tenantId of affectedTenants) {
    await calculateMonthlyBilling(tenantId, yearMonth);
  }

  await logActivity({
    actionType: "import",
    message: `AdjustOne CSVインポート完了: 成功${success}件、未照合${unmatched.size}件`,
    afterJson: { success, unmatched: Array.from(unmatched), yearMonth },
  });

  return { success, unmatched: Array.from(unmatched), errors };
}

// Parse ProDelight CSV
// 請求月,発着信,請求名,発信番号,着信番号,通話種類,発信日時,通話時間,金額
async function importProDelight(
  text: string,
  yearMonth: string
): Promise<ImportResult> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { success: 0, unmatched: [], errors: [] };

  // Build phone number to tenant map
  const phoneRows = await db
    .select({
      number: phoneNumbers.number,
      tenantId: sql<string>`ta.tenant_id`,
    })
    .from(phoneNumbers)
    .innerJoin(
      sql`tenant_assignments ta`,
      sql`ta.phone_number_id = ${phoneNumbers.id} AND ta.end_month IS NULL`
    );

  const phoneToTenant = new Map<string, string>();
  for (const row of phoneRows) {
    if (row.tenantId) {
      // Normalize: remove hyphens
      const normalized = row.number.replace(/-/g, "");
      phoneToTenant.set(normalized, row.tenantId);
    }
  }

  const now = new Date().toISOString();
  let success = 0;
  const unmatched = new Set<string>();
  const errors: string[] = [];
  const affectedTenants = new Set<string>();

  const dataLines = lines.slice(1);
  const batchSize = 100;

  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    const inserts = [];

    for (const line of batch) {
      const cols = parseCsvLine(line);
      if (cols.length < 9) continue;

      const callType = cols[5]?.trim() ?? "";
      const destinationType: "固定" | "携帯" = callType.includes("携帯") ? "携帯" : "固定";
      const durationSeconds = parseInt(cols[7]?.trim() ?? "0", 10) || 0;
      const cost = parseFloat(cols[8]?.trim() ?? "0") || 0;
      const callDatetime = cols[6]?.trim() ?? "";
      const callDate = callDatetime.split(" ")[0] ?? "";
      const rawPhoneNumber = cols[3]?.trim() ?? "";
      const destinationNumber = cols[4]?.trim() ?? "";

      if (!rawPhoneNumber) continue;

      // Strip hyphens, prepend 0 if missing (ProDelight drops leading 0)
      let normalized = rawPhoneNumber.replace(/-/g, "");
      if (normalized && !normalized.startsWith("0")) normalized = "0" + normalized;
      const tenantId = phoneToTenant.get(normalized);

      if (!tenantId) {
        unmatched.add(rawPhoneNumber);
        continue;
      }

      inserts.push({
        id: randomUUID(),
        tenantId,
        yearMonth,
        callDate,
        phoneNumber: normalized,
        destinationNumber,
        destinationType,
        durationSeconds,
        cost,
        source: "ProDelight" as const,
        importedAt: now,
      });
      affectedTenants.add(tenantId);
      success++;
    }

    if (inserts.length > 0) {
      await db.insert(callLogs).values(inserts);
    }
  }

  for (const tenantId of affectedTenants) {
    await calculateMonthlyBilling(tenantId, yearMonth);
  }

  await logActivity({
    actionType: "import",
    message: `ProDelight CSVインポート完了: 成功${success}件、未照合${unmatched.size}件`,
    afterJson: { success, unmatched: Array.from(unmatched), yearMonth },
  });

  return { success, unmatched: Array.from(unmatched), errors };
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const yearMonth = formData.get("yearMonth") as string;

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: "年月の形式が不正です (YYYY-MM)" }, { status: 400 });
    }

    const adjustOneFile = formData.get("adjustOne") as File | null;
    const proDelightFile = formData.get("proDelight") as File | null;

    const result: Record<string, ImportResult> = {};

    if (adjustOneFile) {
      const text = await adjustOneFile.text();
      result.adjustOne = await importAdjustOne(text, yearMonth);
    }

    if (proDelightFile) {
      const text = await proDelightFile.text();
      result.proDelight = await importProDelight(text, yearMonth);
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
