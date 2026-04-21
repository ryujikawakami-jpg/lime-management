import "server-only";
import { db } from "@/lib/db";
import {
  callLogs,
  tenantPacks,
  packs,
  monthlyUsages,
  tenants,
} from "@/lib/db/schema";
import { eq, and, sum, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Tariff constants
const FIXED_SELL_RATE = 0.06; // ¥/sec
const MOBILE_SELL_RATE = 0.25; // ¥/sec

/**
 * Calculate monthly billing for a tenant and upsert monthly_usages record.
 */
export async function calculateMonthlyBilling(
  tenantId: string,
  yearMonth: string
): Promise<void> {
  // Aggregate call_logs
  const [agg] = await db
    .select({
      fixedSeconds: sql<number>`coalesce(sum(case when ${callLogs.destinationType} = '固定' then ${callLogs.durationSeconds} else 0 end), 0)`,
      mobileSeconds: sql<number>`coalesce(sum(case when ${callLogs.destinationType} = '携帯' then ${callLogs.durationSeconds} else 0 end), 0)`,
      rawCost: sql<number>`coalesce(sum(${callLogs.cost}), 0)`,
      sources: sql<string>`group_concat(distinct ${callLogs.source})`,
    })
    .from(callLogs)
    .where(
      and(eq(callLogs.tenantId, tenantId), eq(callLogs.yearMonth, yearMonth))
    );

  const fixedSeconds = Number(agg?.fixedSeconds ?? 0);
  const mobileSeconds = Number(agg?.mobileSeconds ?? 0);
  const rawCost = Number(agg?.rawCost ?? 0);
  const sourcesRaw = agg?.sources ?? "";

  // Determine data source label
  const sourceParts = sourcesRaw ? sourcesRaw.split(",") : [];
  let dataSource: string;
  if (sourceParts.length === 0) dataSource = "手入力";
  else if (sourceParts.length === 2) dataSource = "両社";
  else dataSource = sourceParts[0];

  // Sell-price calculation
  const fixedCallCharge = fixedSeconds * FIXED_SELL_RATE;
  const mobileCallCharge = mobileSeconds * MOBILE_SELL_RATE;
  const ipCallCharge = fixedCallCharge + mobileCallCharge;

  // Pack credit for this month
  const tenantPackRows = await db
    .select({
      quantity: tenantPacks.quantity,
      credit: packs.credit,
      price: packs.price,
      startMonth: tenantPacks.startMonth,
      endMonth: tenantPacks.endMonth,
    })
    .from(tenantPacks)
    .innerJoin(packs, eq(tenantPacks.packId, packs.id))
    .where(eq(tenantPacks.tenantId, tenantId));

  // Filter packs active in this yearMonth
  const activePacks = tenantPackRows.filter((p) => {
    if (p.startMonth > yearMonth) return false;
    if (p.endMonth && p.endMonth < yearMonth) return false;
    return true;
  });

  const totalPackPrice = activePacks.reduce(
    (s, p) => s + p.price * p.quantity,
    0
  );
  const totalCredit = activePacks.reduce(
    (s, p) => s + p.credit * p.quantity,
    0
  );

  // Overage calculation
  const usedCredit = Math.min(totalCredit, ipCallCharge);
  const overage = Math.max(0, ipCallCharge - totalCredit);

  // Split overage by ratio
  let overageFixed = 0;
  let overageMobile = 0;
  if (overage > 0 && ipCallCharge > 0) {
    overageFixed = overage * (fixedCallCharge / ipCallCharge);
    overageMobile = overage * (mobileCallCharge / ipCallCharge);
  }

  // Gross profit = pack revenue + overage - raw cost
  const grossProfit = totalPackPrice + overage - rawCost;

  // Determine SF status
  let sfStatus: "未送信" | "超過なし" | "対応不要";
  if (overage > 0) {
    sfStatus = "未送信";
  } else if (totalPackPrice > 0) {
    sfStatus = "超過なし";
  } else {
    sfStatus = "対応不要";
  }

  const now = new Date().toISOString();

  // Upsert monthly_usages
  const existing = await db
    .select({ id: monthlyUsages.id, sfStatus: monthlyUsages.sfStatus })
    .from(monthlyUsages)
    .where(
      and(
        eq(monthlyUsages.tenantId, tenantId),
        eq(monthlyUsages.yearMonth, yearMonth)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const currentSfStatus = existing[0].sfStatus;
    // Don't downgrade sfStatus if already sent
    const newSfStatus =
      currentSfStatus === "送信済" ? "送信済" : sfStatus;

    await db
      .update(monthlyUsages)
      .set({
        fixedSeconds,
        mobileSeconds,
        rawCost,
        ipCallCharge,
        fixedCallCharge,
        mobileCallCharge,
        totalPackPrice,
        totalCredit,
        usedCredit,
        overageCharge: overage,
        overageFixed,
        overageMobile,
        grossProfit,
        sfStatus: newSfStatus,
        dataSource,
        importedAt: now,
        updatedAt: now,
      })
      .where(eq(monthlyUsages.id, existing[0].id));
  } else {
    await db.insert(monthlyUsages).values({
      id: randomUUID(),
      tenantId,
      yearMonth,
      fixedSeconds,
      mobileSeconds,
      rawCost,
      ipCallCharge,
      fixedCallCharge,
      mobileCallCharge,
      totalPackPrice,
      totalCredit,
      usedCredit,
      overageCharge: overage,
      overageFixed,
      overageMobile,
      grossProfit,
      sfStatus,
      dataSource,
      importedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}
