import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Driver Intelligence is dashboard-scoped, self-service, and operational only", async () => {
  const [page, dashboard, route, analytics] = await Promise.all([
    readFile(new URL("../client/src/components/driver/DriverIntelligenceSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/platformAnalytics.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /<DriverIntelligenceSummary enabled=\{Boolean\(dashboardData\)\} \/>/);
  assert.match(page, /\/api\/drivers\/intelligence\/dashboard/);
  assert.match(page, /Lifetime verified/);
  assert.match(page, /Check-In → Upload/);
  assert.match(page, /Activity trends/);
  assert.doesNotMatch(page, /wallet|stripe|payout|payment/i);
  assert.match(route, /app\.get\("\/api\/drivers\/intelligence\/dashboard"/);
  assert.match(route, /user\.role !== "driver"/);
  assert.match(route, /storage\.getDriver\(user\.id\)/);
  assert.doesNotMatch(route.match(/app\.get\("\/api\/drivers\/intelligence\/dashboard"[\s\S]{0,900}/)?.[0] || "", /req\.params\.driver/);
  assert.match(analytics, /export async function buildDriverIntelligenceDashboard/);
  assert.match(analytics, /calculateDriverActivityStreaks/);
  assert.match(analytics, /deriveDriverJourneyMetrics/);
});
