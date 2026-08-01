import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseDriverCompetitionQuery,
  privacySafeDriverDisplayName,
  rankDriverCompetitionCandidates,
  resolveNextVerifiedMilestone,
  resolveVerifiedMilestone,
  type DriverCompetitionCandidate,
} from "../server/driverCompetition";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";

const current = { driverId: "driver-current", firstName: "Ava", lastName: "Driver" };
const candidate = (driverId: string, verifiedCount: number, attainedAt: string, firstName = driverId, lastName = "Driver"): DriverCompetitionCandidate => ({
  driverId, firstName, lastName, verifiedCount, attainedAt: new Date(attainedAt),
});

test("weekly, monthly, yearly, and all-time periods use explicit UTC boundaries", () => {
  const now = new Date("2026-08-05T17:30:00.000Z");
  assert.equal(parseDriverCompetitionQuery({ period: "week" }, now).start?.toISOString(), "2026-08-03T00:00:00.000Z");
  assert.equal(parseDriverCompetitionQuery({ period: "month" }, now).start?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(parseDriverCompetitionQuery({ period: "year" }, now).start?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(parseDriverCompetitionQuery({ period: "all_time" }, now).start, null);
  assert.throws(() => parseDriverCompetitionQuery({ period: "rolling" }, now), /Unsupported/);
});

test("filters and pagination are normalized, bounded, and reject unsafe input", () => {
  const parsed = parseDriverCompetitionQuery({ period: "month", state: "tx", facilityId: "facility_1", page: "99999", pageSize: "999" });
  assert.deepEqual({ state: parsed.state, facilityId: parsed.facilityId, page: parsed.page, pageSize: parsed.pageSize }, { state: "TX", facilityId: "facility_1", page: 10_000, pageSize: 25 });
  assert.throws(() => parseDriverCompetitionQuery({ state: "Texas" }), /Invalid state/);
  assert.throws(() => parseDriverCompetitionQuery({ facilityId: "facility/id" }), /Invalid facility/);
});

test("verified totals rank descending with shared deterministic ties", () => {
  const result = rankDriverCompetitionCandidates([
    candidate("d-late", 8, "2026-08-03T12:00:00Z", "Late", "Driver"),
    candidate("d-first", 10, "2026-08-04T12:00:00Z", "First", "Driver"),
    candidate("d-early", 8, "2026-08-02T12:00:00Z", "Early", "Driver"),
  ], current);
  assert.deepEqual(result.rows.map((row) => [row.rank, row.displayName, row.verifiedCount]), [
    [1, "First D.", 10], [2, "Early D.", 8], [2, "Late D.", 8],
  ]);
});

test("current Driver rank, nearby rows, and distance to the next distinct rank are correct", () => {
  const result = rankDriverCompetitionCandidates([
    candidate("d1", 12, "2026-08-01T00:00:00Z"),
    candidate("d2", 9, "2026-08-01T00:00:00Z"),
    candidate(current.driverId, 7, "2026-08-01T00:00:00Z", current.firstName, current.lastName),
    candidate("d4", 6, "2026-08-01T00:00:00Z"),
    candidate("d5", 4, "2026-08-01T00:00:00Z"),
  ], current);
  assert.equal(result.current.rank, 3);
  assert.equal(result.current.verifiedCount, 7);
  assert.equal(result.current.countToNextRank, 3);
  assert.deepEqual(result.nearbyRows.map((row) => row.verifiedCount), [12, 9, 6, 4]);
  assert.equal(result.totalRankedDrivers, 5);
});

test("a leading Driver has no next-rank distance", () => {
  const result = rankDriverCompetitionCandidates([
    candidate(current.driverId, 10, "2026-08-01T00:00:00Z", current.firstName, current.lastName),
    candidate("d2", 5, "2026-08-01T00:00:00Z"),
  ], current);
  assert.equal(result.current.rank, 1);
  assert.equal(result.current.countToNextRank, null);
});

test("zero-activity Drivers remain unranked with a positive path to participation", () => {
  const result = rankDriverCompetitionCandidates([
    candidate("zero", 0, "2026-08-01T00:00:00Z"),
    candidate("d1", 2, "2026-08-01T00:00:00Z"),
  ], current);
  assert.equal(result.current.rank, null);
  assert.equal(result.current.verifiedCount, 0);
  assert.equal(result.current.countToNextRank, 1);
  assert.equal(result.totalRankedDrivers, 1);
  assert.equal(result.state, "insufficient_data");
});

test("pagination uses stable server ordering and preserves the separate current position", () => {
  const candidates = Array.from({ length: 30 }, (_, index) => candidate(`d-${String(index).padStart(2, "0")}`, 30 - index, `2026-08-01T00:00:${String(index).padStart(2, "0")}Z`));
  candidates.push(candidate(current.driverId, 1, "2026-08-02T00:00:00Z", current.firstName, current.lastName));
  const result = rankDriverCompetitionCandidates(candidates, current, 2, 10);
  assert.equal(result.rows.length, 10);
  assert.equal(result.rows[0].position, 11);
  assert.equal(result.current.isCurrentDriver, true);
  assert.equal(result.current.position, 31);
  assert.equal(result.pagination.totalPages, 4);
});

test("display names expose only first name and last initial", () => {
  assert.equal(privacySafeDriverDisplayName(" Michael ", "Stiger"), "Michael S.");
  assert.equal(privacySafeDriverDisplayName("Ana", ""), "Ana");
  assert.equal(privacySafeDriverDisplayName("", "Private"), "Driver");
  assert.doesNotMatch(privacySafeDriverDisplayName("Ana", "Lopez"), /Lopez|@|\d{3}/);
});

test("achievement integration exposes only verified milestone thresholds", () => {
  assert.deepEqual(resolveVerifiedMilestone(25), { id: "verified_washouts_25", threshold: 25 });
  assert.equal(resolveVerifiedMilestone(0), null);
  assert.deepEqual(resolveNextVerifiedMilestone(25), { id: "verified_washouts_50", threshold: 50, current: 25, remaining: 25 });
});

test("canonical query is verified-only, duplicate-safe, eligible-account scoped, and Facility-attributed", async () => {
  const source = await readFile(new URL("../server/driverCompetition.ts", import.meta.url), "utf8");
  assert.match(source, /PLATFORM_METRIC_REGISTRY_BY_KEY\.verified_activity/);
  assert.match(source, /eventType, VERIFIED_ACTIVITY_EVENT/);
  assert.match(source, /count\(distinct/);
  assert.match(source, /eq\(users\.isActive, true\)/);
  assert.match(source, /eq\(users\.role, "driver"\)/);
  assert.match(source, /innerJoin\(washoutLocations/);
  assert.match(source, /upper\(\$\{washoutLocations\.state\}\)/);
  const queryBlock = source.match(/const filters = \[[\s\S]*?const verifiedCount/)?.[0] || "";
  assert.doesNotMatch(queryBlock, /activity\.submitted|activity\.rejected|admin_review|photo\.uploaded|payment|wallet|stripe/i);
});

test("competition API is authenticated, Driver-only, and binds identity to the session", async () => {
  const [{ registerRoutes }, { storage }, { isAuthenticated }] = await Promise.all([
    import("../server/routes"),
    import("../server/storage"),
    import("../server/tokenAuth"),
  ]);
  const gets = new Map<string, Function[]>();
  const app = { get(path: string, ...handlers: Function[]) { gets.set(path, handlers); }, post() {}, put() {}, delete() {}, patch() {}, use() {} };
  await registerRoutes(app as never);
  const handlers = gets.get("/api/drivers/competition/leaderboard");
  assert.equal(handlers?.[0], isAuthenticated);
  const route = handlers?.at(-1);
  assert.equal(typeof route, "function");

  let anonymousStatus = 200;
  let anonymousNext = false;
  await isAuthenticated(
    { method: "GET", path: "/api/drivers/competition/leaderboard", headers: {} } as never,
    { status(code: number) { anonymousStatus = code; return this; }, json() { return this; } } as never,
    () => { anonymousNext = true; },
  );
  assert.equal(anonymousStatus, 401);
  assert.equal(anonymousNext, false);

  const originalGetUser = storage.getUser;
  try {
    for (const role of ["owner", "admin", "super_admin"]) {
      (storage as any).getUser = async () => ({ id: `${role}-user`, role });
      let statusCode = 200;
      const response = { status(code: number) { statusCode = code; return this; }, json() { return this; } };
      await route!({ user: { id: `${role}-user` }, query: {} }, response);
      assert.equal(statusCode, 403);
    }
  } finally {
    (storage as any).getUser = originalGetUser;
  }
  const routeSource = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  const blockStart = routeSource.indexOf('app.get("/api/drivers/competition/leaderboard"');
  const blockEnd = routeSource.indexOf("\n  app.get(", blockStart + 1);
  const block = routeSource.slice(blockStart, blockEnd);
  assert.match(block, /isAuthenticated/);
  assert.match(block, /storage\.getUser\(req\.user\.id\)/);
  assert.match(block, /storage\.getDriver\(user\.id\)/);
  assert.doesNotMatch(block, /driverId.*req\.query|req\.params/);
});

test("competition UI is lazy, mobile-bounded, bilingual, accessible, and has all response states", async () => {
  const [app, page, nav, i18n] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/driver/competition.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /lazy\(\(\) => import\("@\/pages\/driver\/competition"\)\)/);
  assert.match(app, /path="\/driver\/competition"/);
  assert.match(nav, /t\("nav\.competition"\)/);
  assert.match(page, /max-w-\[100vw\] overflow-x-hidden/);
  assert.match(page, /<Table aria-label=/);
  assert.match(page, /competition-loading/);
  assert.match(page, /competition-error/);
  assert.match(page, /competition-empty/);
  assert.match(page, /competition-insufficient/);
  assert.match(i18n, /"competition\.title": "Driver Competition"/);
  assert.match(i18n, /"competition\.title": "Competencia de conductores"/);
});

test("competition response contract excludes private and financial fields", () => {
  const result = rankDriverCompetitionCandidates([candidate("d1", 4, "2026-08-01T00:00:00Z")], current);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /email|phone|license|gps|latitude|longitude|facilityHistory|storage|photo|payment|wallet|stripe|payout/i);
  assert.doesNotMatch(serialized, /driver-current|"driverId"/);
});
