import { z } from "zod";

export const notificationRoles = ["driver", "owner", "admin", "super_admin"] as const;
export const notificationCategories = ["operational", "achievement", "competition", "administrative", "system", "announcement"] as const;
export type NotificationRole = (typeof notificationRoles)[number];
export type NotificationCategory = (typeof notificationCategories)[number];

export const notificationTemplateDefinitions = {
  activity_submitted: { category: "operational", roles: ["driver"] },
  activity_verified: { category: "operational", roles: ["driver"] },
  activity_rejected: { category: "operational", roles: ["driver"] },
  activity_integrity_review: { category: "operational", roles: ["driver"] },
  owner_pending_review: { category: "operational", roles: ["owner"] },
  owner_review_approved: { category: "operational", roles: ["owner"] },
  owner_review_rejected: { category: "operational", roles: ["owner"] },
  admin_review_requested: { category: "administrative", roles: ["admin", "super_admin"] },
  admin_review_attention: { category: "administrative", roles: ["owner"] },
  admin_review_updated: { category: "administrative", roles: ["driver", "owner"] },
  photo_review_required: { category: "administrative", roles: ["admin", "super_admin"] },
  achievement_earned: { category: "achievement", roles: ["driver"] },
  competition_milestone: { category: "competition", roles: ["driver"] },
  system_announcement: { category: "announcement", roles: notificationRoles },
} as const satisfies Record<string, { category: NotificationCategory; roles: readonly NotificationRole[] }>;

export type NotificationTemplateKey = keyof typeof notificationTemplateDefinitions;

const forbiddenMetadataKey = /(email|phone|password|token|secret|address|latitude|longitude|gps|storage|path|stripe|payment|amount|balance)/i;
const allowedMetadataKeys = new Set(["facilityName", "status", "achievementName", "milestoneName", "announcementText", "month", "year", "authored"]);

export function sanitizeNotificationMetadata(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input as Record<string, unknown>)
    .filter(([key, value]) => allowedMetadataKeys.has(key) && !forbiddenMetadataKey.test(key) && ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => [key, String(value).slice(0, 240)]));
}

const safePaths: Record<NotificationRole, RegExp[]> = {
  driver: [/^\/$/, /^\/dashboard$/, /^\/activity(?:\?.*)?$/, /^\/rewards$/, /^\/driver\/competition$/, /^\/messages$/, /^\/profile$/],
  owner: [/^\/$/, /^\/dashboard$/, /^\/intelligence(?:\?facilityId=[0-9a-f-]{36})?$/, /^\/notifications$/],
  admin: [/^\/$/, /^\/notifications$/, /^\/admin\/photo-review$/, /^\/network-intelligence$/, /^\/reports$/, /^\/admin\/administration-repository$/],
  super_admin: [/^\/$/, /^\/notifications$/, /^\/admin\/photo-review$/, /^\/network-intelligence$/, /^\/reports$/, /^\/admin\/administration-repository$/],
};

export function isSafeNotificationDeepLink(role: NotificationRole, value: string | null | undefined): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//") && safePaths[role].some((rule) => rule.test(value));
}

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  category: z.enum(notificationCategories).optional(),
});

export const announcementRequestSchema = z.object({
  recipientRole: z.enum(notificationRoles),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  deepLink: z.string().max(240).optional(),
});

export function assertTemplateForRole(templateKey: NotificationTemplateKey, role: NotificationRole) {
  if (!notificationTemplateDefinitions[templateKey].roles.includes(role as never)) {
    throw new Error(`Notification template ${templateKey} is not permitted for ${role}`);
  }
}
