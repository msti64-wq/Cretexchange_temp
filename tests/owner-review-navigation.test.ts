import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translate } from "../client/src/lib/i18n";
import { filterPendingWashoutApprovals } from "../shared/washoutApproval";

test("all-Facility review queue remains reachable when the selected Facility has zero pending reviews", () => {
  const selectedFacilityId = "facility-zero";
  const controlledActivities = Array.from({ length: 3 }, (_, index) => ({
    id: `revel-pending-${index + 1}`,
    status: "pending",
    locationId: "revel-facility",
    location: { id: "revel-facility", name: "Revel Patio Grill", ownerId: "owner-one" },
  }));

  const selectedFacilityPending = controlledActivities.filter(
    (activity) => activity.locationId === selectedFacilityId,
  ).length;
  const allPendingReviews = filterPendingWashoutApprovals(controlledActivities);

  assert.equal(selectedFacilityPending, 0);
  assert.equal(allPendingReviews.length, 3);
  assert.ok(allPendingReviews.every((activity) => activity.location.name === "Revel Patio Grill"));
});

test("desktop and mobile Owner navigation expose an always-enabled canonical review route", async () => {
  const [operationalDashboard, ownerHeader, mobileNav, app] = await Promise.all([
    readFile(new URL("../client/src/pages/owner/operational-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/OwnerHeader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<Route path="\/dashboard\/reviews" component=\{OwnerReviewDashboard\}/);
  assert.match(operationalDashboard, /data-testid="button-washout-reviews"/);
  assert.match(operationalDashboard, /setLocation\("\/dashboard\/reviews"\)/);
  assert.doesNotMatch(operationalDashboard, /disabled=\{attention\.pendingReviews === 0\}/);
  assert.match(ownerHeader, /data-testid="button-owner-washout-reviews"/);
  assert.match(ownerHeader, /aria-label=\{t\("owner\.reviews\.openAria"\)\}/);
  assert.match(mobileNav, /path: "\/dashboard\/reviews"/);
  assert.match(mobileNav, /testIdLabel: "washout-reviews"/);
});

test("review destination identifies its all-Facility scope, Facility on each item, and return action", async () => {
  const reviewDashboard = await readFile(
    new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(reviewDashboard, /owner\.reviews\.title/);
  assert.match(reviewDashboard, /owner\.reviews\.allFacilities/);
  assert.match(reviewDashboard, /queryKey: \['\/api\/owners\/activities\?dateRange=all'\]/);
  assert.match(reviewDashboard, /filterPendingWashoutApprovals\(allActivitiesData\)/);
  assert.match(reviewDashboard, /data-testid=\{`text-location-name-\$\{index\}`\}/);
  assert.match(reviewDashboard, /activity\.location\?\.name/);
  assert.match(reviewDashboard, /data-testid="button-back-to-owner-dashboard"/);
  assert.match(reviewDashboard, /setLocation\("\/dashboard"\)/);
});

test("review navigation and Facility-scope labels are localized in English and Spanish", () => {
  assert.equal(translate("owner.reviews.nav", "en"), "Washout Reviews");
  assert.equal(translate("owner.reviews.nav", "es"), "Revisiones de lavado");
  assert.equal(translate("owner.operational.pendingAtFacility", "en"), "Pending at this Facility");
  assert.equal(translate("owner.operational.pendingAtFacility", "es"), "Pendientes en esta instalación");
  assert.equal(translate("owner.operational.allPendingReviews", "en"), "All pending reviews");
  assert.equal(translate("owner.operational.allPendingReviews", "es"), "Todas las revisiones pendientes");
  assert.equal(translate("owner.operational.todayAllFacilities", "en"), "Today — All Facilities");
  assert.equal(translate("owner.operational.todayAllFacilities", "es"), "Hoy — Todas las instalaciones");
  assert.equal(translate("owner.operational.todayAtFacility", "en", { facility: "Revel Patio Grill" }), "Today at Revel Patio Grill");
  assert.equal(translate("owner.operational.todayAtFacility", "es", { facility: "Revel Patio Grill" }), "Hoy en Revel Patio Grill");
  assert.equal(translate("owner.operational.noActivityAllToday", "en"), "No activity has been submitted at any of your Facilities today.");
  assert.equal(translate("owner.operational.latestActivityToday", "en"), "Latest activity today");
  assert.equal(translate("owner.operational.latestActivityToday", "es"), "Actividad más reciente de hoy");
  assert.equal(translate("owner.operational.pendingAtOtherFacilities", "en", { count: 6 }), "6 pending reviews are at other Facilities.");
  assert.equal(translate("owner.operational.pendingAtOtherFacilities", "es", { count: 6 }), "Hay 6 revisiones pendientes en otras instalaciones.");
});

test("all-Facility count is separately projected and remains Owner-scoped", async () => {
  const [service, storage] = await Promise.all([
    readFile(new URL("../server/ownerOperationalDashboard.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/storage.ts", import.meta.url), "utf8"),
  ]);

  assert.match(service, /owner_location\.owner_id = \$\{scope\.ownerId\}/);
  assert.match(service, /allPendingReviews: numberValue\(attentionSummary\.all_pending_reviews\)/);
  assert.match(service, /ownerActivityScope\(scope\)/);
  assert.match(service, /state: selectedFacilityId \? "selected" : "all"/);
  assert.match(storage, /const conditions = \[eq\(washoutLocations\.ownerId, ownerId\)\]/);
});
