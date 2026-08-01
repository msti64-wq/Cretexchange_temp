import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translate } from "../client/src/lib/i18n";
import {
  ownerFacilityIntelligenceQueryKey,
  ownerFacilityIntelligenceQueryPrefix,
  ownerFacilityIntelligenceRequest,
} from "../client/src/lib/ownerFacilityIntelligenceQuery";

const pageUrl = new URL("../client/src/pages/owner/facility-intelligence.tsx", import.meta.url);
const dashboardUrl = new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url);
const navUrl = new URL("../client/src/components/MobileNav.tsx", import.meta.url);
const headerUrl = new URL("../client/src/components/OwnerHeader.tsx", import.meta.url);
const storageUrl = new URL("../server/storage.ts", import.meta.url);
const analyticsUrl = new URL("../server/platformAnalytics.ts", import.meta.url);

test("Facility Intelligence has complete English and Spanish shared-catalog coverage", () => {
  const required = [
    "nav", "eyebrow", "title", "description", "facilityAria", "selectFacility", "dateRangeAria",
    "last30", "last90", "noFacility", "loading", "refreshing", "error", "retryAria", "overviewAria",
    "verifiedActivities", "submittedActivities", "rejectedActivities", "administrativeReviews", "activeDrivers",
    "repeatDrivers", "operationalTrends", "trendPeriodAria", "daily", "weekly", "monthly", "trendChartAria",
    "facilityHealth", "healthScoreAria", "indicatorsAria", "driverIntelligence", "facilityOperations",
    "dropoff", "driverJourney", "recoveryJourney", "conversion", "abandonment", "averageDuration",
    "medianDuration", "journeyStagesAria", "volumeChartAria", "noTrendData", "noVolumeData",
  ];
  for (const suffix of required) {
    const key = `owner.intelligence.${suffix}`;
    const english = translate(key, "en");
    const spanish = translate(key, "es");
    assert.notEqual(english, key, `missing English ${key}`);
    assert.notEqual(spanish, key, `missing Spanish ${key}`);
    assert.notEqual(spanish, english, `Spanish should differ for ${key}`);
  }
  assert.equal(translate("owner.intelligence.verifiedActivities", "es"), "Actividades de recuperación verificadas");
  assert.equal(translate("owner.intelligence.stage.check_in", "es"), "Registro de llegada");
});

test("Owner Intelligence page and navigation consume localization without hard-coded defect copy", async () => {
  const [page, nav, header] = await Promise.all([readFile(pageUrl, "utf8"), readFile(navUrl, "utf8"), readFile(headerUrl, "utf8")]);
  assert.match(page, /const \{ t \} = useLanguage\(\)/);
  assert.match(page, /owner\.intelligence\.trendChartAria/);
  assert.match(page, /owner\.intelligence\.retryAria/);
  assert.match(page, /owner\.intelligence\.stage\.\$\{stage\.key\}/);
  assert.match(nav, /label: t\("owner\.intelligence\.nav"\)/);
  assert.match(header, /\{t\("owner\.intelligence\.nav"\)\}/);
  for (const legacyLiteral of [
    "Operational insight for your facility",
    "Verified recovery activities",
    "Facility intelligence could not be loaded",
    "No submitted driver activity in this period",
    "Drop-off intelligence",
  ]) assert.doesNotMatch(page, new RegExp(legacyLiteral, "i"));

  const staticKeys = [...`${page}\n${nav}\n${header}`.matchAll(/t\("(owner\.intelligence\.[^"]+)"/g)].map((match) => match[1]);
  for (const key of staticKeys) {
    assert.notEqual(translate(key, "en"), key, `raw English key ${key}`);
    assert.notEqual(translate(key, "es"), key, `raw Spanish key ${key}`);
  }
});

test("Facility Intelligence request windows are fresh and query keys are facility-scoped", () => {
  const firstEnd = new Date("2026-08-01T12:00:00.000Z");
  const secondEnd = new Date("2026-08-01T12:05:00.000Z");
  const first = ownerFacilityIntelligenceRequest("facility-a", "30", firstEnd);
  const second = ownerFacilityIntelligenceRequest("facility-a", "30", secondEnd);
  assert.notEqual(first, second);
  assert.match(first, /\/api\/owners\/facilities\/facility-a\/intelligence\/dashboard/);
  assert.deepEqual(ownerFacilityIntelligenceQueryPrefix("facility-a"), ["owner-facility-intelligence", "facility-a"]);
  assert.deepEqual(ownerFacilityIntelligenceQueryKey("facility-a", "90"), ["owner-facility-intelligence", "facility-a", "90"]);
  assert.notDeepEqual(ownerFacilityIntelligenceQueryPrefix("facility-a"), ownerFacilityIntelligenceQueryPrefix("facility-b"));
});

test("Owner approval invalidates only the approved facility Intelligence scope", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");
  const approval = dashboard.slice(dashboard.indexOf("const approveMutation"), dashboard.indexOf("const rejectMutation"));
  assert.match(approval, /if \(data\?\.locationId\)/);
  assert.match(approval, /ownerFacilityIntelligenceQueryPrefix\(String\(data\.locationId\)\)/);
  assert.doesNotMatch(approval, /queryClient\.clear\(\)/);
  assert.doesNotMatch(approval, /removeQueries\([^)]*owner-facility-intelligence/);
});

test("canonical approval persists one facility-attributed verified event inside the transaction", async () => {
  const storage = await readFile(storageUrl, "utf8");
  const transition = storage.slice(storage.indexOf("async verifyWashoutActivityWithApprovalIntent"), storage.indexOf("async rejectPendingWashoutActivityForOwner"));
  const verifiedWrites = [...transition.matchAll(/eventType: "activity\.verified"/g)];
  assert.equal(verifiedWrites.length, 1);
  assert.match(transition, /return db\.transaction/);
  assert.match(transition, /eq\(washoutActivities\.status, "pending"\)/);
  assert.match(transition, /sourceEventKey: `activity:\$\{activity\.id\}:verified:/);
  assert.match(transition, /locationId: activity\.locationId/);
  assert.match(transition, /\.onConflictDoNothing|recordPlatformAnalyticsEvent/);
});

test("Facility Intelligence aggregation remains event-derived and facility-scoped", async () => {
  const analytics = await readFile(analyticsUrl, "utf8");
  const projection = analytics.slice(analytics.indexOf("export async function buildFacilityIntelligenceDashboard"), analytics.indexOf("type DriverTrendRow"));
  assert.match(projection, /facilityEventWindow\(locationId, query\.start, query\.end\)/);
  assert.match(projection, /eventType} = 'activity\.verified'/);
  assert.match(projection, /verifiedCount \/ finalDecisionCount/);
  assert.match(projection, /calculateFacilityHealthScore/);
  assert.doesNotMatch(projection, /stripe|wallet|payout|payment/i);
});
