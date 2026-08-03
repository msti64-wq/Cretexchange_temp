import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/notification_test";
process.env.FINANCIAL_EXECUTION_ENABLED = "false";

type Handler = (req: any, res: any) => Promise<unknown>;

function registry() {
  const gets = new Map<string, Handler>();
  const posts = new Map<string, Handler>();
  const puts = new Map<string, Handler>();
  const app = {
    get(path: string, ...handlers: Handler[]) { gets.set(path, handlers.at(-1)!); },
    post(path: string, ...handlers: Handler[]) { posts.set(path, handlers.at(-1)!); },
    put(path: string, ...handlers: Handler[]) { puts.set(path, handlers.at(-1)!); },
    patch() {}, delete() {}, use() {},
  };
  return { app, gets, posts, puts };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test("Notification Center binds list, read, and archive operations to the authenticated recipient", { concurrency: false }, async () => {
  const { registerRoutes } = await import("../server/routes");
  const { notificationService } = await import("../server/notificationService");
  const { app, gets, posts, puts } = registry();
  await registerRoutes(app as never);
  const originalList = notificationService.list;
  const originalArchive = notificationService.archive;
  const originalMark = notificationService.markRead;
  const originalMarkAll = notificationService.markAllRead;
  try {
    let listUser = "";
    let archiveUser = "";
    let readUser = "";
    let readAllUser = "";
    notificationService.list = async (userId: string) => {
      listUser = userId;
      return { items: [], pagination: { page: 1, pageSize: 25, total: 0, hasMore: false } };
    };
    notificationService.archive = async (userId: string) => { archiveUser = userId; return true; };
    notificationService.markRead = async (userId: string, _id: string) => {
      readUser = userId;
      return { id: "n1", isRead: true, readAt: new Date("2026-08-03T12:00:00Z"), idempotencyKey: "must-not-leak" } as never;
    };
    notificationService.markAllRead = async (userId: string) => { readAllUser = userId; return 2; };

    const listRes = response();
    await gets.get("/api/notifications/center")!({ user: { id: "driver-one" }, query: {} }, listRes);
    const archiveRes = response();
    await posts.get("/api/notifications/:id/archive")!({ user: { id: "owner-one" }, params: { id: "n1" } }, archiveRes);
    const readRes = response();
    await puts.get("/api/notifications/:id/read")!({ user: { id: "admin-one" }, params: { id: "n1" } }, readRes);
    const readAllRes = response();
    await puts.get("/api/notifications/read-all")!({ user: { id: "driver-one" } }, readAllRes);

    assert.equal(listRes.statusCode, 200);
    assert.equal(archiveRes.statusCode, 200);
    assert.equal(readRes.statusCode, 200);
    assert.deepEqual(readRes.body, { id: "n1", isRead: true, readAt: new Date("2026-08-03T12:00:00Z") });
    assert.deepEqual(readAllRes.body, { success: true, updated: 2 });
    assert.equal(listUser, "driver-one");
    assert.equal(archiveUser, "owner-one");
    assert.equal(readUser, "admin-one");
    assert.equal(readAllUser, "driver-one");
  } finally {
    notificationService.list = originalList;
    notificationService.archive = originalArchive;
    notificationService.markRead = originalMark;
    notificationService.markAllRead = originalMarkAll;
  }
});

test("governed announcements deny non-Admins and allow role-targeted Admin delivery", { concurrency: false }, async () => {
  const { registerRoutes } = await import("../server/routes");
  const { storage } = await import("../server/storage");
  const { notificationService } = await import("../server/notificationService");
  const { app, posts } = registry();
  await registerRoutes(app as never);
  const route = posts.get("/api/admin/notifications/announcements")!;
  const originalUser = storage.getUser;
  const originalCreate = notificationService.createForRole;
  try {
    storage.getUser = async (id: string) => ({ id, role: id === "admin" ? "admin" : "driver" }) as never;
    let targetRole = "";
    notificationService.createForRole = async (input: any) => { targetRole = input.recipientRole; return []; };
    const denied = response();
    await route({ user: { id: "driver" }, body: { recipientRole: "driver", title: "Notice", message: "Text" } }, denied);
    assert.equal(denied.statusCode, 403);
    const allowed = response();
    await route({ user: { id: "admin" }, body: { recipientRole: "owner", title: "Notice", message: "Text", deepLink: "/dashboard" } }, allowed);
    assert.equal(allowed.statusCode, 201);
    assert.equal(targetRole, "owner");
  } finally {
    storage.getUser = originalUser;
    notificationService.createForRole = originalCreate;
  }
});
