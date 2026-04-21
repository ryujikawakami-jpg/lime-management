/**
 * link-channel-groups.ts — チャンネルグループとテナントの自動リンク（改善版）
 *
 * npm run db:link-groups
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { channelGroups, tenants } from "./schema";
import { eq, isNull } from "drizzle-orm";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

const allTenants = db.select({ id: tenants.id, companyName: tenants.companyName }).from(tenants).all();
const tenantByName = new Map<string, string>();
for (const t of allTenants) {
  tenantByName.set(t.companyName.trim(), t.id);
}

const unlinked = db
  .select({ id: channelGroups.id, label: channelGroups.label })
  .from(channelGroups)
  .where(isNull(channelGroups.tenantId))
  .all();

console.log(`未リンク: ${unlinked.length}件\n`);

let linked = 0;
const noMatch: string[] = [];

for (const g of unlinked) {
  const label = g.label.trim();
  let tenantId: string | undefined;

  // Strategy 1: exact match on full label
  tenantId = tenantByName.get(label);

  // Strategy 2: extract company name after ）： or ） or ：
  if (!tenantId) {
    const m = label.match(/[）\)][：:\s]*(.+)$/) || label.match(/[：:]\s*(.+)$/);
    if (m) {
      const extracted = m[1].trim();
      if (extracted && extracted !== "ー" && extracted.length > 1) {
        // Exact match on extracted
        tenantId = tenantByName.get(extracted);

        // SF name contains extracted, or extracted contains SF name
        if (!tenantId) {
          for (const [name, id] of tenantByName) {
            if (name.includes(extracted) || extracted.includes(name)) {
              tenantId = id;
              break;
            }
          }
        }
      }
    }
  }

  // Strategy 3: label contains SF company name (min 3 chars to avoid false matches)
  if (!tenantId) {
    for (const [name, id] of tenantByName) {
      if (name.length >= 3 && label.includes(name)) {
        tenantId = id;
        break;
      }
    }
  }

  // Strategy 4: for short labels not starting with 【, check if SF name contains label
  if (!tenantId && !label.startsWith("【") && label.length >= 3) {
    for (const [name, id] of tenantByName) {
      if (name.includes(label)) {
        tenantId = id;
        break;
      }
    }
  }

  if (tenantId) {
    db.update(channelGroups)
      .set({ tenantId, updatedAt: new Date().toISOString() })
      .where(eq(channelGroups.id, g.id))
      .run();
    linked++;
  } else {
    noMatch.push(label);
  }
}

console.log(`✅ リンク: ${linked}件 / 未リンク: ${noMatch.length}件\n`);
if (noMatch.length > 0) {
  console.log("❓ 未リンクのチャンネルグループ:");
  for (const n of noMatch) {
    console.log(`  - ${n}`);
  }
}

sqlite.close();
