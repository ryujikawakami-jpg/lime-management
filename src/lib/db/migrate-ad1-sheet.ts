/**
 * migrate-ad1-sheet.ts — アジャストワン「※竹上修正完了」シートCSVからDB同期
 *
 * 実行方法:
 *   npm run db:migrate-ad1
 *
 * 事前条件:
 *   - db:migrate / db:seed が完了済み
 *   - docs/ad1-channels.csv が存在すること
 *     （Googleスプレッドシートの「※竹上修正完了」シートをCSVエクスポートしたもの）
 *
 * CSV列 (A〜O):
 *   A: 契約コード（削除予定）→ スキップ
 *   B: AD1回線             → スキップ
 *   C: AD1IPアドレス       → billingAccounts.ipAddress
 *   D: 請求ID（新管理コード）→ billingAccounts.billingCode
 *   E: 請求アカウント名     → billingAccounts.name
 *   F: 企業名              → channelGroups.label
 *   G: 契約ステータス       → phoneNumbers.contractStatus
 *   H: 番号種別            → phoneNumbers.category
 *   I: 03.06.050番号       → phoneNumbers.number
 *   J: フリーコール         → phoneNumbers.freeCall
 *   K: 適用日              → phoneNumbers.applyDate
 *   L: 解約日              → phoneNumbers.cancelDate
 *   M: 契約ch数            → channelGroups.contractCh
 *   N: ch制御              → phoneNumbers.chControl
 *   O: 備考                → phoneNumbers.notes
 *
 * セル結合対策: 前方充填（forward fill）を適用
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  billingAccounts,
  channelGroups,
  phoneNumbers,
  tenants,
  tenantAssignments,
} from "./schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

// ============================================================
// DB setup
// ============================================================
const dbPath = path.resolve(
  process.cwd(),
  process.env.DATABASE_URL ?? "lime.db"
);
if (!fs.existsSync(dbPath)) {
  console.error(`❌ DB が見つかりません: ${dbPath}`);
  console.error("   先に db:migrate と db:seed を実行してください。");
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

// ============================================================
// CSV parser (handles quoted fields, newlines in quotes)
// ============================================================
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuote && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\r" || ch === "\n") && !inQuote) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim())) rows.push(row);
  }
  return rows;
}

// ============================================================
// Parse ch number from string (e.g. "57", "90→57chに削減" → 57)
// ============================================================
function parseChNumber(s: string): number {
  if (!s.trim()) return 0;
  const nums = s.replace(/,/g, "").match(/\d+/g);
  if (!nums) return 0;
  if (s.includes("→")) return parseInt(nums[nums.length - 1], 10);
  return parseInt(nums[0], 10);
}

// ============================================================
// Normalize phone number: remove hyphens
// ============================================================
function normalizePhone(s: string): string {
  return s.replace(/-/g, "").replace(/\s/g, "").trim();
}

// ============================================================
// Slugify company name for tenant slug
// ============================================================
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "-")
    .replace(/[（()）]/g, "")
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef-]/g, "")
    .slice(0, 80);
}

// ============================================================
// Main
// ============================================================
interface ParsedRow {
  // Billing account level (forward-filled)
  ipAddress: string;
  billingCode: string;
  billingName: string;
  // Channel group level (forward-filled)
  groupLabel: string;
  contractCh: number;
  // Phone number level (per row)
  contractStatus: string;
  category: string;
  number: string;
  freeCall: string;
  applyDate: string;
  cancelDate: string;
  chControl: number;
  notes: string;
}

async function main() {
  const csvPath = path.resolve(process.cwd(), "docs/ad1-channels.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV が見つかりません: ${csvPath}`);
    console.error(
      '   Googleスプレッドシートの「※竹上修正完了」シートをCSVエクスポートし、'
    );
    console.error("   docs/ad1-channels.csv として保存してください。");
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);

  if (rows.length < 2) {
    console.error("❌ CSVにデータ行がありません");
    process.exit(1);
  }

  // Skip header row(s) - find first data row
  // Header detection: D列に「請求ID」を含む行をヘッダーとみなす
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const d = (rows[i][3] ?? "").trim();
    if (d.includes("請求") || d.includes("管理コード")) {
      headerIdx = i;
      break;
    }
  }
  const dataRows = rows.slice(headerIdx + 1);

  console.log(`📋 CSV読み込み: ${dataRows.length} データ行`);

  // ============================================================
  // Forward fill & parse
  // ============================================================
  const parsed: ParsedRow[] = [];
  let ffIpAddress = "";
  let ffBillingCode = "";
  let ffBillingName = "";
  let ffGroupLabel = "";
  let ffContractCh = 0;

  for (const row of dataRows) {
    const colC = (row[2] ?? "").trim(); // AD1IPアドレス
    const colD = (row[3] ?? "").trim(); // 請求ID
    const colE = (row[4] ?? "").trim(); // 請求アカウント名
    const colF = (row[5] ?? "").trim(); // 企業名
    const colG = (row[6] ?? "").trim(); // 契約ステータス
    const colH = (row[7] ?? "").trim(); // 番号種別
    const colI = (row[8] ?? "").trim(); // 電話番号
    const colJ = (row[9] ?? "").trim(); // フリーコール
    const colK = (row[10] ?? "").trim(); // 適用日
    const colL = (row[11] ?? "").trim(); // 解約日
    const colM = (row[12] ?? "").trim(); // 契約ch数
    const colN = (row[13] ?? "").trim(); // ch制御
    const colO = (row[14] ?? "").trim(); // 備考

    // Forward fill: billing account level
    if (colC) ffIpAddress = colC;
    if (colD) ffBillingCode = colD;
    if (colE) ffBillingName = colE;

    // Forward fill: channel group level
    if (colF) ffGroupLabel = colF;
    if (colM) ffContractCh = parseChNumber(colM);

    // Skip rows without a phone number
    const phone = normalizePhone(colI);
    if (!phone || !/^\d{8,11}$/.test(phone)) continue;

    // Skip rows without billing code
    if (!ffBillingCode) continue;

    parsed.push({
      ipAddress: ffIpAddress,
      billingCode: ffBillingCode,
      billingName: ffBillingName,
      groupLabel: ffGroupLabel || ffBillingName, // fallback
      contractCh: ffContractCh,
      contractStatus: colG || "契約中",
      category: colH === "基本番号" ? "基本番号" : "追加番号",
      number: phone,
      freeCall: colJ === "-" || colJ === "－" ? "" : colJ.replace(/-/g, ""),
      applyDate: colK,
      cancelDate: colL,
      chControl: parseChNumber(colN),
      notes: colO,
    });
  }

  console.log(`  解析済み: ${parsed.length} 件の電話番号`);

  // ============================================================
  // 1. Upsert billing accounts
  // ============================================================
  console.log("\n💳 請求アカウントを同期中...");
  const billingMap = new Map<string, string>(); // billingCode → id
  const uniqueBillings = new Map<
    string,
    { billingCode: string; name: string; ipAddress: string }
  >();

  for (const r of parsed) {
    if (!uniqueBillings.has(r.billingCode)) {
      uniqueBillings.set(r.billingCode, {
        billingCode: r.billingCode,
        name: r.billingName,
        ipAddress: r.ipAddress,
      });
    }
  }

  let billingNew = 0;
  let billingUpdated = 0;

  for (const b of uniqueBillings.values()) {
    const existing = await db
      .select({ id: billingAccounts.id })
      .from(billingAccounts)
      .where(eq(billingAccounts.billingCode, b.billingCode))
      .get();

    if (existing) {
      billingMap.set(b.billingCode, existing.id);
      await db
        .update(billingAccounts)
        .set({
          name: b.name,
          ipAddress: b.ipAddress,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(billingAccounts.id, existing.id));
      billingUpdated++;
    } else {
      const id = randomUUID();
      await db.insert(billingAccounts).values({
        id,
        billingCode: b.billingCode,
        name: b.name,
        ipAddress: b.ipAddress,
        status: "active",
      });
      billingMap.set(b.billingCode, id);
      billingNew++;
      console.log(`  ✓ 新規: ${b.billingCode} (${b.name})`);
    }
  }
  console.log(`  新規: ${billingNew}件 / 更新: ${billingUpdated}件`);

  // ============================================================
  // 2. Upsert channel groups
  // ============================================================
  console.log("\n📦 チャンネルグループを同期中...");
  const groupMap = new Map<string, string>(); // "billingCode|label" → id
  const uniqueGroups = new Map<
    string,
    { billingCode: string; label: string; contractCh: number }
  >();

  for (const r of parsed) {
    const key = `${r.billingCode}|${r.groupLabel}`;
    if (!uniqueGroups.has(key)) {
      uniqueGroups.set(key, {
        billingCode: r.billingCode,
        label: r.groupLabel,
        contractCh: r.contractCh,
      });
    }
  }

  let groupNew = 0;
  let groupUpdated = 0;

  for (const [key, g] of uniqueGroups) {
    const billingId = billingMap.get(g.billingCode);
    if (!billingId) continue;

    const existing = await db
      .select({ id: channelGroups.id })
      .from(channelGroups)
      .where(
        and(
          eq(channelGroups.billingAccountId, billingId),
          eq(channelGroups.label, g.label)
        )
      )
      .get();

    if (existing) {
      groupMap.set(key, existing.id);
      await db
        .update(channelGroups)
        .set({
          contractCh: g.contractCh,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(channelGroups.id, existing.id));
      groupUpdated++;
    } else {
      const id = randomUUID();
      await db.insert(channelGroups).values({
        id,
        billingAccountId: billingId,
        label: g.label,
        contractCh: g.contractCh,
        status: "active",
      });
      groupMap.set(key, id);
      groupNew++;
    }
  }
  console.log(`  新規: ${groupNew}件 / 更新: ${groupUpdated}件`);

  // ============================================================
  // 3. Upsert phone numbers
  // ============================================================
  console.log("\n📞 電話番号を同期中...");
  let phoneNew = 0;
  let phoneUpdated = 0;
  let phoneSkipped = 0;

  for (const r of parsed) {
    const groupKey = `${r.billingCode}|${r.groupLabel}`;
    const groupId = groupMap.get(groupKey);
    if (!groupId) {
      phoneSkipped++;
      continue;
    }

    const existing = await db
      .select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, r.number))
      .get();

    if (existing) {
      await db
        .update(phoneNumbers)
        .set({
          channelGroupId: groupId,
          freeCall: r.freeCall || null,
          category: r.category as "基本番号" | "追加番号",
          contractStatus: (r.contractStatus === "解約済" ? "解約済" : "契約中") as
            | "契約中"
            | "解約済",
          applyDate: r.applyDate || null,
          cancelDate: r.cancelDate || null,
          chControl: r.chControl || null,
          notes: r.notes || null,
        })
        .where(eq(phoneNumbers.id, existing.id));
      phoneUpdated++;
    } else {
      await db.insert(phoneNumbers).values({
        id: randomUUID(),
        channelGroupId: groupId,
        number: r.number,
        freeCall: r.freeCall || null,
        category: r.category as "基本番号" | "追加番号",
        contractStatus: (r.contractStatus === "解約済" ? "解約済" : "契約中") as
          | "契約中"
          | "解約済",
        applyDate: r.applyDate || null,
        cancelDate: r.cancelDate || null,
        chControl: r.chControl || null,
        notes: r.notes || null,
      });
      phoneNew++;
    }
  }
  console.log(
    `  新規: ${phoneNew}件 / 更新: ${phoneUpdated}件 / スキップ: ${phoneSkipped}件`
  );

  // ============================================================
  // 4. Auto-link channel groups to tenants (best-effort matching)
  // ============================================================
  console.log("\n🔗 チャンネルグループ → テナント自動リンク中...");
  const allTenants = await db
    .select({ id: tenants.id, companyName: tenants.companyName })
    .from(tenants);

  const tenantByName = new Map<string, string>();
  for (const t of allTenants) {
    tenantByName.set(t.companyName.trim(), t.id);
  }

  const allGroups = await db
    .select({ id: channelGroups.id, label: channelGroups.label, tenantId: channelGroups.tenantId })
    .from(channelGroups);

  let linked = 0;
  for (const g of allGroups) {
    if (g.tenantId) continue; // already linked

    // Try exact match on label
    const tenantId = tenantByName.get(g.label.trim());
    if (tenantId) {
      await db
        .update(channelGroups)
        .set({ tenantId, updatedAt: new Date().toISOString() })
        .where(eq(channelGroups.id, g.id));
      linked++;
    }
  }
  console.log(`  自動リンク: ${linked}件 / 未リンク: ${allGroups.length - linked}件`);

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n✅ 同期完了");
  console.log(`  請求アカウント: ${uniqueBillings.size}件`);
  console.log(`  チャンネルグループ: ${uniqueGroups.size}件`);
  console.log(`  電話番号: ${parsed.length}件`);
  console.log("\n💡 次のステップ:");
  console.log("  - テナントとチャンネルグループの手動リンクが必要な場合はUIから設定");
  console.log("  - テナント割り当て（tenant_assignments）は請求CSVインポート時に自動生成");
}

main().catch(console.error).finally(() => sqlite.close());
