import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertTemplateForRole,
  isSafeNotificationDeepLink,
  notificationCategories,
  notificationTemplateDefinitions,
  sanitizeNotificationMetadata,
} from "../shared/notifications";
import { translate, translations } from "../client/src/lib/i18n";
import { localizeCenterNotification } from "../client/src/lib/notificationLocalization";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("notification taxonomy is stable, role-scoped, and non-financial", () => {
  assert.deepEqual(notificationCategories, ["operational", "achievement", "competition", "administrative", "system", "announcement"]);
  assert.deepEqual(notificationTemplateDefinitions.activity_submitted.roles, ["driver"]);
  assert.deepEqual(notificationTemplateDefinitions.owner_pending_review.roles, ["owner"]);
  assert.throws(() => assertTemplateForRole("owner_pending_review", "driver"));
  assert.equal(JSON.stringify(notificationTemplateDefinitions).match(/payment|wallet|stripe|payout|amount/i), null);
});

test("metadata projection excludes private and financial fields", () => {
  assert.deepEqual(sanitizeNotificationMetadata({
    facilityName: "Revel Patio Grill",
    status: "verified",
    password: "secret",
    latitude: "12.3",
    storagePath: "private/photo.jpg",
    paymentAmount: "$10",
    reason: "unnecessary free-form text",
    extra: "not allowlisted",
  }), { facilityName: "Revel Patio Grill", status: "verified" });
});

test("deep links are same-origin and role governed", () => {
  assert.equal(isSafeNotificationDeepLink("driver", "/activity"), true);
  assert.equal(isSafeNotificationDeepLink("owner", "/intelligence?facilityId=1367c68a-e12b-46a4-a417-6f21febe5640"), true);
  assert.equal(isSafeNotificationDeepLink("admin", "/admin/photo-review"), true);
  assert.equal(isSafeNotificationDeepLink("driver", "/admin/photo-review"), false);
  assert.equal(isSafeNotificationDeepLink("owner", "https://example.com"), false);
  assert.equal(isSafeNotificationDeepLink("owner", "//example.com"), false);
});

test("structured notifications localize in English and Spanish with legacy fallback", () => {
  const item = { id: "n", title: "fallback", message: "fallback", type: "activity_verified", category: "operational", templateKey: "activity_verified", isRead: false, deepLink: "/activity", priority: "normal", metadata: { facilityName: "Revel" }, createdAt: null };
  assert.equal(localizeCenterNotification(item, "en", (key, values) => translate(key, "en", values)).message, "Revel verified your Material Recovery Activity.");
  assert.equal(localizeCenterNotification(item, "es", (key, values) => translate(key, "es", values)).message, "Revel verificó tu Actividad de Recuperación de Materiales.");
  assert.deepEqual(localizeCenterNotification({ ...item, templateKey: null, title: "Legacy", message: "Preserved" }, "es", (key, values) => translate(key, "es", values)), { title: "Legacy", message: "Preserved" });
  assert.deepEqual(localizeCenterNotification({ ...item, templateKey: "system_announcement", title: "Authored", message: "Keep exact" }, "es", (key, values) => translate(key, "es", values)), { title: "Authored", message: "Keep exact" });
  const english = Object.keys(translations.en).filter((key) => key.startsWith("notification.")).sort();
  const spanish = Object.keys(translations.es).filter((key) => key.startsWith("notification.")).sort();
  assert.deepEqual(spanish, english);
});

test("migration is additive, indexed, constrained, and idempotent", async () => {
  const migration = await source("migrations/0039_extend_notifications_for_communication_center.sql");
  assert.match(migration, /ALTER TABLE notifications/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS recipient_role/);
  assert.match(migration, /notifications_idempotency_key_unique/);
  assert.match(migration, /notifications_user_read_archived_idx/);
  assert.match(migration, /notifications_category_valid/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i);
});

test("service enforces recipient scope, bounded pagination, idempotency, archive, and count-only unread", async () => {
  const service = await source("server/notificationService.ts");
  assert.match(service, /onConflictDoNothing\(\{ target: notifications\.idempotencyKey \}\)/);
  assert.match(service, /eq\(notifications\.userId, userId\)/);
  assert.match(service, /isNull\(notifications\.archivedAt\)/);
  assert.match(service, /\.limit\(pageSize\)\.offset/);
  assert.match(service, /async unreadCount/);
  assert.match(service, /select\(\{ value: count\(\) \}\)/);
  assert.doesNotMatch(service, /stripe|wallet|payment|payout/i);
});

test("routes preserve legacy reads and protect governed Admin announcements", async () => {
  const routes = await source("server/routes.ts");
  assert.match(routes, /app\.get\('\/api\/notifications\/center', isAuthenticated/);
  assert.match(routes, /app\.get\('\/api\/notifications', isAuthenticated/);
  assert.match(routes, /app\.post\('\/api\/notifications\/:id\/archive', isAuthenticated/);
  assert.match(routes, /app\.post\('\/api\/admin\/notifications\/announcements', isAuthenticated/);
  assert.match(routes, /actor\.role !== 'admin' && actor\.role !== 'super_admin'/);
  assert.match(routes, /notificationService\.archive\(req\.user\.id, req\.params\.id\)/);
  assert.match(routes, /notificationService\.markRead\(req\.user\.id, id\)/);
  assert.match(routes, /notificationService\.markAllRead\(userId\)/);
  assert.match(routes, /res\.json\(\{ id: notification\.id, isRead: notification\.isRead, readAt: notification\.readAt \}\)/);
});

test("canonical lifecycle hooks cover Driver, Owner, Admin, achievement, competition, and photo review", async () => {
  const routes = await source("server/routes.ts");
  for (const template of ["activity_submitted", "activity_verified", "activity_rejected", "owner_pending_review", "owner_review_approved", "owner_review_rejected", "admin_review_requested", "admin_review_attention", "admin_review_updated", "achievement_earned", "competition_milestone", "photo_review_required"]) {
    assert.match(routes, new RegExp(`templateKey: '${template}'`), `${template} producer missing`);
  }
  assert.match(routes, /buildDriverAchievementProjection\(db, verifiedDriver\.id\)/);
});

test("shared center provides role routes, category filters, explicit read/archive controls, and accessible states", async () => {
  const [center, app, nav] = await Promise.all([
    source("client/src/components/notifications/NotificationCenter.tsx"),
    source("client/src/App.tsx"),
    source("client/src/components/MobileNav.tsx"),
  ]);
  assert.match(center, /useInfiniteQuery/);
  assert.match(center, /aria-live="polite"/);
  assert.match(center, /<time dateTime=/);
  assert.match(center, /role="alert"/);
  assert.match(center, /notification\.center\.archive/);
  assert.match(center, /notification\.center\.markAll/);
  assert.match(app, /path="\/messages" component=\{DriverNotifications\}/);
  assert.match(app, /path="\/notifications" component=\{AdminNotifications\}/);
  assert.equal((nav.match(/path: "\/notifications", icon: Bell/g) || []).length >= 3, true);
  assert.match(nav, /notification\.center\.unreadCount/);
});

test("controlled migration runners allowlist and catalog-verify 0039", async () => {
  const [production, staging] = await Promise.all([
    source("scripts/controlled-production-migrations.ts"),
    source("scripts/controlled-staging-migrations.ts"),
  ]);
  for (const script of [production, staging]) {
    assert.match(script, /id: "0039"/);
    assert.match(script, /0039_extend_notifications_for_communication_center\.sql/);
    assert.match(script, /notifications_idempotency_key_unique/);
    assert.match(script, /notifications_schema_version_positive/);
  }
});
