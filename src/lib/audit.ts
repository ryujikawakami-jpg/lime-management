import "server-only";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { randomUUID } from "crypto";

export async function logActivity(params: {
  userId?: string | null;
  actionType: string;
  message: string;
  targetTable?: string;
  targetId?: string;
  afterJson?: object;
}) {
  try {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      userId: params.userId ?? null,
      actionType: params.actionType,
      message: params.message,
      targetTable: params.targetTable ?? null,
      targetId: params.targetId ?? null,
      beforeJson: null,
      afterJson: params.afterJson ? JSON.stringify(params.afterJson) : null,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // ログ失敗でメイン処理を止めない
  }
}
