import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLogs, monthlyUsages, tenants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape), ...rows.map((r) => r.map(escape))].join("\n");
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const yearMonth = searchParams.get("yearMonth");
  const tenantId = searchParams.get("tenantId");

  if (!yearMonth) {
    return NextResponse.json({ error: "yearMonth is required" }, { status: 400 });
  }

  if (tenantId) {
    // Individual tenant: export call logs
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const logs = await db
      .select()
      .from(callLogs)
      .where(and(eq(callLogs.tenantId, tenantId), eq(callLogs.yearMonth, yearMonth)))
      .orderBy(callLogs.callDate);

    const headers = ["通話日", "発信番号", "着信番号", "種別", "通話時間(秒)", "金額(円)", "データソース"];
    const rows = logs.map((l) => [
      l.callDate ?? "",
      l.phoneNumber ?? "",
      l.destinationNumber ?? "",
      l.destinationType,
      String(l.durationSeconds),
      String(l.cost),
      l.source,
    ]);

    const csv = toCSV(headers, rows);
    const filename = `billing_${yearMonth}_${tenant.slug}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } else {
    // All tenants: export monthly summary
    const rows = await db
      .select({
        companyName: tenants.companyName,
        sfOpportunityId: tenants.sfOpportunityId,
        totalPackPrice: monthlyUsages.totalPackPrice,
        totalCredit: monthlyUsages.totalCredit,
        ipCallCharge: monthlyUsages.ipCallCharge,
        overageFixed: monthlyUsages.overageFixed,
        overageMobile: monthlyUsages.overageMobile,
        overageCharge: monthlyUsages.overageCharge,
        rawCost: monthlyUsages.rawCost,
        grossProfit: monthlyUsages.grossProfit,
        sfStatus: monthlyUsages.sfStatus,
      })
      .from(monthlyUsages)
      .innerJoin(tenants, eq(monthlyUsages.tenantId, tenants.id))
      .where(eq(monthlyUsages.yearMonth, yearMonth))
      .orderBy(tenants.companyName);

    const headers = [
      "会社名", "SF商談ID", "パック料金", "クレジット", "IP通話料",
      "超過(固定)", "超過(携帯)", "超過合計", "原価", "粗利", "SFステータス",
    ];
    const csvRows = rows.map((r) => [
      r.companyName,
      r.sfOpportunityId ?? "",
      String(r.totalPackPrice),
      String(r.totalCredit),
      String(r.ipCallCharge),
      String(r.overageFixed),
      String(r.overageMobile),
      String(r.overageCharge),
      String(r.rawCost),
      String(r.grossProfit),
      r.sfStatus,
    ]);

    const csv = toCSV(headers, csvRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="billing_${yearMonth}_all.csv"`,
      },
    });
  }
}
