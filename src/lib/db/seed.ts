/**
 * seed.ts — 初期データ投入
 * npx tsx src/lib/db/seed.ts で実行
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { users, packs } from "./schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

// Run migrations first
migrate(db, { migrationsFolder: "./drizzle/migrations" });

async function seed() {
  console.log("🌱 Seeding database...");

  // ============================================================
  // Users（初期アカウント）
  // ============================================================
  const initialUsers = [
    { email: "ryuji.kawakami@widsley.com",    name: "川上 隆司",   role: "admin"  as const },
    { email: "hirotaka.takahashi@widsley.com", name: "髙橋 弘孝",  role: "admin"  as const },
    { email: "hitomi.nishimura@widsley.com",  name: "西村 仁美",   role: "leader" as const },
    { email: "kazuya.yamaguchi@widsley.com",  name: "山口 和也",   role: "leader" as const },
    { email: "paruko.asai@widsley.com",       name: "浅井 巴留子", role: "member" as const },
    { email: "ryota.mori@widsley.com",        name: "森 諒太",     role: "member" as const },
    { email: "haruka.kagoshima@widsley.com",  name: "駕籠島 晴香", role: "member" as const },
  ];

  // 初回パスワード: "Widsley2024!" — 初回ログイン後に変更を促す
  const defaultPassword = "Widsley2024!";
  const hash = await bcrypt.hash(defaultPassword, 12);

  for (const u of initialUsers) {
    await db
      .insert(users)
      .values({ id: randomUUID(), ...u, passwordHash: hash })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${initialUsers.length} users created`);

  // ============================================================
  // Packs（パックマスタ）
  // ============================================================
  const packData = [
    {
      id: randomUUID(),
      name: "IP 20,000",
      sfProductCode: "IP_Pack20000",
      price: 20000,
      credit: 20500,
      bonusRate: 0.025,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: randomUUID(),
      name: "IP 50,000",
      sfProductCode: "IP_Pack50000",
      price: 50000,
      credit: 55000,
      bonusRate: 0.10,
      isActive: true,
      sortOrder: 2,
    },
    {
      id: randomUUID(),
      name: "IP 100,000",
      sfProductCode: "IP_Pack100000",
      price: 100000,
      credit: 115000,
      bonusRate: 0.15,
      isActive: true,
      sortOrder: 3,
    },
    {
      id: randomUUID(),
      name: "IP 500,000",
      sfProductCode: "IP_Pack500000",
      price: 500000,
      credit: 600000,
      bonusRate: 0.20,
      isActive: true,
      sortOrder: 4,
    },
    // 旧パック（移行済み・非アクティブ）
    {
      id: randomUUID(),
      name: "IP 1,000,000",
      sfProductCode: "IP_Pack1000000",
      price: 1000000,
      credit: 1150000,
      bonusRate: 0.15,
      isActive: false,
      sortOrder: 10,
    },
  ];

  for (const p of packData) {
    await db.insert(packs).values(p).onConflictDoNothing();
  }
  console.log(`  ✓ ${packData.length} packs created`);

  console.log("\n✅ Seed complete");
  console.log(`\n📋 Initial password for all users: "${defaultPassword}"`);
  console.log("   Please ask users to change their password on first login.\n");
}

seed().catch(console.error).finally(() => sqlite.close());
