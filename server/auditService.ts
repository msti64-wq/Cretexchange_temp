import { db } from "./db";
import { auditLogs, type InsertAuditLog } from "@shared/schema";

/**
 * Audit logging service for tracking all critical data modifications
 * Provides accountability and recovery capabilities
 */

export interface AuditContext {
  userId?: string;
  username?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export interface AuditLogData {
  entityType: "user" | "driver" | "owner" | "location" | "washout" | "payment" | "wallet" | "withdrawal" | "debit_card" | "billing";
  entityId: string;
  action: "create" | "update" | "delete" | "soft_delete" | "restore";
  oldData?: any;
  newData?: any;
  changes?: any;
  context?: AuditContext;
}

/**
 * Log an audit trail for a data modification
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    const auditEntry: InsertAuditLog = {
      userId: data.context?.userId,
      username: data.context?.username,
      userRole: data.context?.userRole,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      oldData: data.oldData ? JSON.parse(JSON.stringify(data.oldData)) : null,
      newData: data.newData ? JSON.parse(JSON.stringify(data.newData)) : null,
      changes: data.changes ? JSON.parse(JSON.stringify(data.changes)) : null,
      reason: data.context?.reason,
      ipAddress: data.context?.ipAddress,
      userAgent: data.context?.userAgent,
    };

    await db.insert(auditLogs).values(auditEntry);
  } catch (error) {
    // Log error but don't throw - audit failures shouldn't break operations
    console.error("[AUDIT ERROR] Failed to log audit trail:", error);
  }
}

/**
 * Calculate what changed between old and new data
 */
export function calculateChanges(oldData: any, newData: any): Record<string, { from: any; to: any }> {
  const changes: Record<string, { from: any; to: any }> = {};
  
  if (!oldData || !newData) {
    return changes;
  }

  // Compare all keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  
  for (const key of allKeys) {
    // Skip system fields that always change
    if (key === 'updatedAt' || key === 'updated_at') {
      continue;
    }
    
    const oldValue = oldData[key];
    const newValue = newData[key];
    
    // Only log actual changes
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { from: oldValue, to: newValue };
    }
  }
  
  return changes;
}

/**
 * Helper to extract audit context from Express request
 */
export function getAuditContextFromRequest(req: any): AuditContext {
  return {
    userId: req.user?.id,
    username: req.user?.username,
    userRole: req.user?.role,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers?.['user-agent'],
  };
}
