/**
 * migrate-sf-customers.ts — SF顧客CSVからテナント・パック・ch数をインポート
 *
 * 実行方法:
 *   npm run db:migrate-sf-customers
 *
 * 入力: docs/ip_customer.csv (Shift-JIS)
 *   列: 取引先名, 商談ID, フェーズ, 商品名, 数量, 販売価格, 商品コード, 有効商品, 請求開始日, 請求終了日, WidsleyCS担当者
 *
 * 処理:
 *   1. テナントを upsert（取引先名 + 商談ID + 担当者）
 *   2. IP_Channel行からch数を集計 → tenant更新用
 *   3. IP_Pack行からパック設定を登録
 *   4. チャンネルグループとテナントの自動リンク
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  tenants,
  users,
  tenantPacks,
  packs,
  channelGroups,
} from "./schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { Buffer } from "buffer";

// ============================================================
// DB setup
// ============================================================
const dbPath = path.resolve(
  process.cwd(),
  process.env.DATABASE_URL ?? "lime.db"
);
if (!fs.existsSync(dbPath)) {
  console.error(`❌ DB が見つかりません: ${dbPath}`);
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

// ============================================================
// Decode Shift-JIS
// ============================================================
function decodeShiftJIS(buf: Buffer): string {
  const decoder = new TextDecoder("shift_jis");
  return decoder.decode(buf);
}

// ============================================================
// CSV parser
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
// Slugify
// ============================================================
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "-")
    .replace(/[（()）【】]/g, "")
    .replace(/[株式会社]/g, "")
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || randomUUID().slice(0, 8);
}

// ============================================================
// Parse date (YYYY/MM/DD → YYYY-MM)
// ============================================================
function parseMonth(s: string): string | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{4})[\/\-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

// ============================================================
// Main
// ============================================================
interface SfRow {
  companyName: string;
  sfOpportunityId: string;
  phase: string;
  productName: string;
  quantity: number;
  price: number;
  productCode: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  assigneeName: string;
}

async function main() {
  const csvPath = path.resolve(process.cwd(), "docs/ip_customer.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV が見つかりません: ${csvPath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(csvPath);
  const text = decodeShiftJIS(buf);
  const rows = parseCsv(text);

  if (rows.length < 2) {
    console.error("❌ データなし");
    process.exit(1);
  }

  const dataRows: SfRow[] = rows.slice(1).map((r) => ({
    companyName: (r[0] ?? "").trim(),
    sfOpportunityId: (r[1] ?? "").trim(),
    phase: (r[2] ?? "").trim(),
    productName: (r[3] ?? "").trim(),
    quantity: parseFloat((r[4] ?? "0").trim()) || 0,
    price: parseFloat((r[5] ?? "0").trim()) || 0,
    productCode: (r[6] ?? "").trim(),
    isActive: (r[7] ?? "").trim() === "1",
    startDate: (r[8] ?? "").trim(),
    endDate: (r[9] ?? "").trim(),
    assigneeName: (r[10] ?? "").trim(),
  }));

  console.log(`📋 CSV読み込み: ${dataRows.length} 行`);

  // ============================================================
  // Build user name → id map
  // ============================================================
  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const userByName = new Map<string, string>();
  for (const u of allUsers) {
    userByName.set(u.name.trim(), u.id);
    // Also map without spaces: "森 諒太" → "森諒太"
    userByName.set(u.name.replace(/\s/g, ""), u.id);
  }

  // ============================================================
  // Build pack sfProductCode → id map
  // ============================================================
  const allPacks = await db.select().from(packs);
  const packByCode = new Map<string, typeof allPacks[0]>();
  for (const p of allPacks) {
    packByCode.set(p.sfProductCode, p);
  }

  // ============================================================
  // Group rows by sfOpportunityId (= tenant)
  // ============================================================
  const tenantGroups = new Map<
    string,
    { companyName: string; sfOpportunityId: string; assigneeName: string; rows: SfRow[] }
  >();

  for (const r of dataRows) {
    if (!r.sfOpportunityId) continue;
    const key = r.sfOpportunityId;
    if (!tenantGroups.has(key)) {
      tenantGroups.set(key, {
        companyName: r.companyName,
        sfOpportunityId: r.sfOpportunityId,
        assigneeName: r.assigneeName,
        rows: [],
      });
    }
    tenantGroups.get(key)!.rows.push(r);
  }

  console.log(`  ユニーク商談: ${tenantGroups.size} 件`);

  // ============================================================
  // 1. Upsert tenants
  // ============================================================
  console.log("\n🏢 テナントを同期中...");
  const tenantIdMap = new Map<string, string>(); // sfOpportunityId → tenant id
  let tenantNew = 0;
  let tenantUpdated = 0;

  for (const [sfId, group] of tenantGroups) {
    // Find by sfOpportunityId first
    let existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.sfOpportunityId, sfId))
      .get();

    // Fallback: find by company name
    if (!existing) {
      existing = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.companyName, group.companyName))
        .get();
    }

    const assigneeId = userByName.get(group.assigneeName) ??
      userByName.get(group.assigneeName.replace(/\s/g, "")) ?? null;

    if (existing) {
      tenantIdMap.set(sfId, existing.id);
      await db.update(tenants).set({
        sfOpportunityId: sfId,
        assigneeId,
        updatedAt: new Date().toISOString(),
      }).where(eq(tenants.id, existing.id));
      tenantUpdated++;
    } else {
      const id = randomUUID();
      const slug = slugify(group.companyName);

      // Ensure unique slug
      const existingSlug = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .get();

      const finalSlug = existingSlug ? `${slug}-${sfId.slice(-4)}` : slug;

      await db.insert(tenants).values({
        id,
        slug: finalSlug,
        companyName: group.companyName,
        sfOpportunityId: sfId,
        assigneeId,
        status: "active",
      });
      tenantIdMap.set(sfId, id);
      tenantNew++;
    }
  }
  console.log(`  新規: ${tenantNew}件 / 更新: ${tenantUpdated}件`);

  // ============================================================
  // 2. Register packs (IP_Pack rows)
  // ============================================================
  console.log("\n📦 パック設定を同期中...");
  let packNew = 0;
  let packSkipped = 0;

  for (const [sfId, group] of tenantGroups) {
    const tenantId = tenantIdMap.get(sfId);
    if (!tenantId) continue;

    const packRows = group.rows.filter((r) => r.productCode.startsWith("IP_Pack"));

    for (const r of packRows) {
      const pack = packByCode.get(r.productCode);
      if (!pack) {
        console.log(`  ⚠️ 未知のパックコード: ${r.productCode} (${group.companyName})`);
        continue;
      }

      const startMonth = parseMonth(r.startDate);
      if (!startMonth) continue;
      const endMonth = parseMonth(r.endDate);
      const quantity = Math.round(r.quantity) || 1;

      // Check if already exists
      const existing = await db
        .select({ id: tenantPacks.id })
        .from(tenantPacks)
        .where(eq(tenantPacks.tenantId, tenantId))
        .get();

      // Simple check: if tenant already has packs, skip (avoid duplicates on re-run)
      if (existing) {
        packSkipped++;
        continue;
      }

      await db.insert(tenantPacks).values({
        id: randomUUID(),
        tenantId,
        packId: pack.id,
        quantity,
        startMonth,
        endMonth,
      });
      packNew++;
    }
  }
  console.log(`  新規: ${packNew}件 / スキップ: ${packSkipped}件`);

  // ============================================================
  // 3. Auto-link channel groups to tenants
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
  let alreadyLinked = 0;

  for (const g of allGroups) {
    if (g.tenantId) {
      alreadyLinked++;
      continue;
    }

    // Try exact match
    let tenantId = tenantByName.get(g.label.trim());

    // Try partial match: label contains company name or vice versa
    if (!tenantId) {
      for (const [name, id] of tenantByName) {
        if (g.label.includes(name) || name.includes(g.label.trim())) {
          tenantId = id;
          break;
        }
      }
    }

    if (tenantId) {
      await db
        .update(channelGroups)
        .set({ tenantId, updatedAt: new Date().toISOString() })
        .where(eq(channelGroups.id, g.id));
      linked++;
    }
  }
  console.log(`  新規リンク: ${linked}件 / リンク済み: ${alreadyLinked}件 / 未リンク: ${allGroups.length - linked - alreadyLinked}件`);

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n✅ 同期完了");

  // Show ch summary per tenant
  console.log("\n📊 テナント別IP_Channel数量:");
  for (const [sfId, group] of tenantGroups) {
    const chRows = group.rows.filter((r) => r.productCode === "IP_Channel");
    const totalCh = chRows.reduce((s, r) => s + Math.round(r.quantity), 0);
    if (totalCh > 0) {
      console.log(`  ${group.companyName}: ${totalCh}ch`);
    }
  }
}

main().catch(console.error).finally(() => sqlite.close());
