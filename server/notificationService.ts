import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { notifications, users, type Notification } from "../shared/schema";
import {
  assertTemplateForRole,
  isSafeNotificationDeepLink,
  notificationTemplateDefinitions,
  sanitizeNotificationMetadata,
  type NotificationCategory,
  type NotificationRole,
  type NotificationTemplateKey,
} from "../shared/notifications";

export type CreateStructuredNotification = {
  userId: string;
  recipientRole: NotificationRole;
  templateKey: NotificationTemplateKey;
  title: string;
  message: string;
  deepLink?: string;
  metadata?: unknown;
  sourceEntityType?: string;
  sourceEntityId?: string;
  idempotencyKey: string;
  priority?: "normal" | "high";
};

export type NotificationCenterItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  recipientRole: string | null;
  category: string;
  templateKey: string | null;
  templateVersion: string;
  isRead: boolean;
  readAt: Date | null;
  deepLink: string | null;
  priority: string;
  metadata: Record<string, string>;
  data: Record<string, string>;
  createdAt: Date | null;
};

function toItem(row: Notification): NotificationCenterItem {
  const rawData = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
  const metadata = sanitizeNotificationMetadata({ ...rawData, authored: rawData.sentBy ? true : undefined });
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    recipientRole: row.recipientRole,
    category: row.category,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    isRead: row.isRead,
    readAt: row.readAt,
    deepLink: row.deepLink,
    priority: row.priority,
    metadata,
    data: metadata,
    createdAt: row.createdAt,
  };
}

export class NotificationService {
  async create(input: CreateStructuredNotification): Promise<NotificationCenterItem | null> {
    assertTemplateForRole(input.templateKey, input.recipientRole);
    const definition = notificationTemplateDefinitions[input.templateKey];
    const deepLink = isSafeNotificationDeepLink(input.recipientRole, input.deepLink) ? input.deepLink : null;
    const [created] = await db.insert(notifications).values({
      userId: input.userId,
      recipientRole: input.recipientRole,
      category: definition.category,
      templateKey: input.templateKey,
      templateVersion: "1",
      title: input.title,
      message: input.message,
      type: input.templateKey,
      deepLink,
      data: sanitizeNotificationMetadata(input.metadata),
      sourceEntityType: input.sourceEntityType?.slice(0, 80),
      sourceEntityId: input.sourceEntityId?.slice(0, 128),
      idempotencyKey: input.idempotencyKey.slice(0, 240),
      priority: input.priority ?? "normal",
      deliveryState: "delivered",
      schemaVersion: 1,
    }).onConflictDoNothing({ target: notifications.idempotencyKey }).returning();
    return created ? toItem(created) : null;
  }

  async createForRole(input: Omit<CreateStructuredNotification, "userId" | "recipientRole"> & { recipientRole: NotificationRole }) {
    const recipients = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, input.recipientRole), eq(users.isActive, true)));
    return Promise.all(recipients.map(({ id }) => this.create({
      ...input,
      userId: id,
      idempotencyKey: `${input.idempotencyKey}:${id}`,
    })));
  }

  async list(userId: string, page: number, pageSize: number, category?: NotificationCategory) {
    const filters = [eq(notifications.userId, userId), isNull(notifications.archivedAt)];
    if (category) filters.push(eq(notifications.category, category));
    const where = and(...filters);
    const [rows, totalRows] = await Promise.all([
      db.select().from(notifications).where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(notifications).where(where),
    ]);
    const total = Number(totalRows[0]?.value ?? 0);
    return { items: rows.map(toItem), pagination: { page, pageSize, total, hasMore: page * pageSize < total } };
  }

  async unreadCount(userId: string): Promise<number> {
    const [result] = await db.select({ value: count() }).from(notifications).where(and(
      eq(notifications.userId, userId), eq(notifications.isRead, false), isNull(notifications.archivedAt),
    ));
    return Number(result?.value ?? 0);
  }

  async markRead(userId: string, notificationId: string) {
    const now = new Date();
    const [row] = await db.update(notifications).set({ isRead: true, readAt: now, updatedAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.archivedAt))).returning();
    return row ? toItem(row) : null;
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const result = await db.update(notifications).set({ isRead: true, readAt: now, updatedAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false), isNull(notifications.archivedAt))).returning({ id: notifications.id });
    return result.length;
  }

  async archive(userId: string, notificationId: string) {
    const now = new Date();
    const [row] = await db.update(notifications).set({ archivedAt: now, updatedAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.archivedAt))).returning({ id: notifications.id });
    return !!row;
  }
}

export const notificationService = new NotificationService();

export async function emitNotificationBestEffort(input: CreateStructuredNotification): Promise<void> {
  try {
    await notificationService.create(input);
  } catch (error) {
    console.error("[NOTIFICATION_DELIVERY_FAILED]", {
      templateKey: input.templateKey,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      errorCategory: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function emitRoleNotificationBestEffort(input: Omit<CreateStructuredNotification, "userId" | "recipientRole"> & { recipientRole: NotificationRole }): Promise<void> {
  try {
    await notificationService.createForRole(input);
  } catch (error) {
    console.error("[ROLE_NOTIFICATION_DELIVERY_FAILED]", {
      templateKey: input.templateKey,
      recipientRole: input.recipientRole,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      errorCategory: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
