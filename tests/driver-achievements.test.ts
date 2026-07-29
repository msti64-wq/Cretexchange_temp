import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  calculateDriverAchievements,
  DRIVER_ACHIEVEMENT_DEFINITIONS,
  type DriverAchievementEvent,
} from "../server/driverAchievements";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

function event(
  eventType: DriverAchievementEvent["eventType"],
  occurredAt: string,
  extra: Partial<DriverAchievementEvent> = {},
): DriverAchievementEvent {
  return { eventType, occurredAt: new Date(occurredAt), ...extra };
}

test("achievement engine calculates verified, consistency, quality, and participation milestones", () => {
  const events: DriverAchievementEvent[] = [
    event("activity.submitted", "2026-07-01T08:00:00.000Z", { locationId: "facility-1" }),
    event("activity.submitted", "2026-07-02T08:00:00.000Z", { locationId: "facility-2" }),
    event("activity.submitted", "2026-07-03T08:00:00.000Z", { locationId: "facility-3" }),
    event("activity.submitted", "2026-07-05T08:00:00.000Z", { locationId: "facility-4" }),
    event("activity.submitted", "2026-07-06T08:00:00.000Z", { locationId: "facility-5" }),
  ];
  for (let index = 0; index < 25; index += 1) {
    events.push(event("activity.verified", `2026-07-10T00:00:${String(index).padStart(2, "0")}.000Z`, { activityId: `verified-${index}` }));
  }

  const result = calculateDriverAchievements(events);
  assert.deepEqual(result.earnedAchievements.map((item) => item.id), [
    "verified_washouts_1",
    "verified_washouts_10",
    "verified_washouts_25",
    "active_day_streak_3",
    "verified_without_rejection_25",
    "facilities_visited_1",
    "facilities_visited_5",
  ]);
  assert.equal(result.progress.find((item) => item.id === "active_day_streak_3")?.earnedAt, "2026-07-03T00:00:00.000Z");
  assert.equal(result.progress.find((item) => item.id === "facilities_visited_5")?.earnedAt, "2026-07-06T08:00:00.000Z");
  assert.equal(result.visibility, "private_driver");
});

test("quality milestones use the longest verified sequence and reset on rejection", () => {
  const events: DriverAchievementEvent[] = [];
  for (let index = 0; index < 20; index += 1) {
    events.push(event("activity.verified", `2026-07-01T00:00:${String(index).padStart(2, "0")}.000Z`));
  }
  events.push(event("activity.rejected", "2026-07-01T00:01:00.000Z"));
  for (let index = 0; index < 25; index += 1) {
    events.push(event("activity.verified", `2026-07-01T00:02:${String(index).padStart(2, "0")}.000Z`));
  }

  const quality25 = calculateDriverAchievements(events).progress.find((item) => item.id === "verified_without_rejection_25");
  assert.equal(quality25?.earned, true);
  assert.equal(quality25?.current, 25);
  assert.equal(quality25?.earnedAt, "2026-07-01T00:02:24.000Z");
  assert.equal(calculateDriverAchievements([
    ...events.slice(0, 20),
    event("activity.rejected", "2026-07-01T00:01:00.000Z"),
    ...events.slice(21, 45),
  ]).progress.find((item) => item.id === "verified_without_rejection_25")?.earned, false);
});

test("milestone progression selects the nearest next achievement without inventing points", () => {
  const fortyNineVerified = Array.from({ length: 49 }, (_, index) =>
    event("activity.verified", new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString()));
  const before = calculateDriverAchievements(fortyNineVerified);
  assert.equal(before.nextAchievement?.id, "verified_washouts_50");
  assert.equal(before.nextAchievement?.current, 49);
  assert.equal(before.nextAchievement?.remaining, 1);
  assert.equal(before.progress.some((item) => /point|reward|rank/i.test(`${item.unit} ${item.description}`)), false);

  const after = calculateDriverAchievements([
    ...fortyNineVerified,
    event("activity.verified", "2026-07-01T00:01:00.000Z"),
  ]);
  assert.equal(after.progress.find((item) => item.id === "verified_washouts_50")?.earned, true);
  assert.equal(after.nextMilestones.find((item) => item.category === "verified_washouts")?.id, "verified_washouts_100");
  assert.equal(DRIVER_ACHIEVEMENT_DEFINITIONS.length, 15);
});

test("achievement API denies non-Drivers before querying achievement data", async () => {
  const gets = new Map<string, Function>();
  const app = { get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); }, post() {}, put() {}, delete() {}, patch() {}, use() {} };
  await registerRoutes(app as never);
  const achievementRoute = gets.get("/api/drivers/achievements");
  assert.equal(typeof achievementRoute, "function");
  const originalGetUser = storage.getUser;
  try {
    (storage as any).getUser = async () => ({ id: "owner-user", role: "owner" });
    let statusCode = 200;
    let payload: unknown;
    const response = { status(code: number) { statusCode = code; return this; }, json(value: unknown) { payload = value; return this; } };
    await achievementRoute!({ user: { id: "owner-user" }, query: {}, params: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Driver achievement access required" });
  } finally {
    (storage as any).getUser = originalGetUser;
  }
});

test("achievement route binds projection identity to the authenticated Driver profile", async () => {
  const route = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  const block = route.match(/app\.get\("\/api\/drivers\/achievements"[\s\S]{0,950}/)?.[0] || "";
  assert.match(block, /storage\.getUser\(req\.user\.id\)/);
  assert.match(block, /storage\.getDriver\(user\.id\)/);
  assert.match(block, /buildDriverAchievementProjection\(db, driver\.id\)/);
  assert.doesNotMatch(block, /req\.params|req\.query/);
});
