import { db } from "@/lib/db";
import { tenantAssignments, tenants, phoneNumbers, channelGroups, billingAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { UnitChTable } from "@/components/unit-ch-table";

async function updateAssignmentCh(formData: FormData) {
  "use server";
  const assignmentId = formData.get("assignmentId") as string;
  const allocatedCh = parseInt(formData.get("allocatedCh") as string, 10) || 0;
  const unitChStatus = formData.get("unitChStatus") as string;
  await db.update(tenantAssignments).set({
    allocatedCh,
    unitChStatus: unitChStatus as "不要" | "検討中" | "対応中" | "完了",
    updatedAt: new Date().toISOString(),
  }).where(eq(tenantAssignments.id, assignmentId));
  redirect("/unit-ch");
}

export default async function UnitChPage() {
  const rows = await db
    .select({
      id: tenantAssignments.id,
      tenantId: tenantAssignments.tenantId,
      companyName: tenants.companyName,
      phoneNumber: phoneNumbers.number,
      billingCode: billingAccounts.billingCode,
      allocatedCh: tenantAssignments.allocatedCh,
      freeCall: phoneNumbers.freeCall,
      startMonth: tenantAssignments.startMonth,
      endMonth: tenantAssignments.endMonth,
      unitChStatus: tenantAssignments.unitChStatus,
      unitChNotes: tenantAssignments.unitChNotes,
    })
    .from(tenantAssignments)
    .innerJoin(tenants, eq(tenantAssignments.tenantId, tenants.id))
    .innerJoin(phoneNumbers, eq(tenantAssignments.phoneNumberId, phoneNumbers.id))
    .innerJoin(channelGroups, eq(phoneNumbers.channelGroupId, channelGroups.id))
    .innerJoin(billingAccounts, eq(channelGroups.billingAccountId, billingAccounts.id))
    .orderBy(tenantAssignments.unitChStatus, tenants.companyName);

  const statusCounts = {
    検討中: rows.filter((r) => r.unitChStatus === "検討中").length,
    対応中: rows.filter((r) => r.unitChStatus === "対応中").length,
    完了: rows.filter((r) => r.unitChStatus === "完了").length,
    不要: rows.filter((r) => r.unitChStatus === "不要").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ユニットch管理</h1>
        <p className="text-sm text-gray-500 mt-1">番号割り当てのユニットチャネル対応状況</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Card key={status}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-sm text-gray-500">{status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <UnitChTable rows={rows} updateAction={updateAssignmentCh} />
        </CardContent>
      </Card>
    </div>
  );
}
