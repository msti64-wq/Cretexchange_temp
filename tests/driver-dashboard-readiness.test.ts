import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveDriverOperationalReadiness } from "../shared/driverOperationalReadiness";
import {
  resolveDriverDashboardGpsState,
  resolveDriverDashboardReadinessPresentation,
} from "../client/src/lib/driverDashboardReadiness";
import { translations } from "../client/src/lib/i18n";

const ready = () => resolveDriverOperationalReadiness({
  user: { id: "driver-user", role: "driver", firstName: "Ava", lastName: "Driver", email: "ava@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
  profile: { userId: "driver-user", employerName: "Crete Co", truckNumber: "12", activeMaterialSlug: "concrete-washout" },
  termsAccepted: true,
  activeMaterial: { slug: "concrete-washout", isActive: true },
});

test("dashboard CTA priority reuses shared readiness without financial prerequisites", () => {
  const profileMissing = resolveDriverOperationalReadiness({
    user: { id: "driver-user", role: "driver", firstName: "Ava" },
    profile: { userId: "driver-user", activeMaterialSlug: "concrete-washout" }, termsAccepted: false, activeMaterial: { slug: "concrete-washout", isActive: true },
  });
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(profileMissing), { state: "action_required", action: "complete_profile", route: "/profile" });

  const termsMissing = resolveDriverOperationalReadiness({
    user: { id: "driver-user", role: "driver", firstName: "Ava", lastName: "Driver", email: "ava@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
    profile: { userId: "driver-user", employerName: "Crete Co", truckNumber: "12", activeMaterialSlug: "concrete-washout" }, termsAccepted: false, activeMaterial: { slug: "concrete-washout", isActive: true },
  });
  assert.equal(resolveDriverDashboardReadinessPresentation(termsMissing).action, "accept_terms");

  const materialMissing = resolveDriverOperationalReadiness({
    user: { id: "driver-user", role: "driver", firstName: "Ava", lastName: "Driver", email: "ava@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
    profile: { userId: "driver-user", employerName: "Crete Co", truckNumber: "12" }, termsAccepted: true,
  });
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(materialMissing), { state: "action_required", action: "select_material", route: null });
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(ready()), { state: "ready", action: "find_locations", route: "/locations" });
});

test("dashboard keeps unavailable sources distinct from incomplete readiness", () => {
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(ready(), { authenticationUnavailable: true }), {
    state: "unavailable", action: "retry_readiness", route: null, unavailableSource: "authentication",
  });
  assert.equal(resolveDriverDashboardReadinessPresentation(ready(), { termsUnavailable: true }).unavailableSource, "terms");
  assert.equal(resolveDriverDashboardReadinessPresentation(ready(), { materialUnavailable: true }).unavailableSource, "material");
});

test("dashboard keeps unresolved readiness sources in a loading state", () => {
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(ready(), { authenticationLoading: true }), {
    state: "loading", action: null, route: null,
  });
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(ready(), { termsLoading: true }), {
    state: "loading", action: null, route: null,
  });
  assert.deepEqual(resolveDriverDashboardReadinessPresentation(ready(), { materialLoading: true }), {
    state: "loading", action: null, route: null,
  });
});

test("GPS is contextual and never changes account eligibility", () => {
  assert.equal(resolveDriverDashboardGpsState({ checking: true, hasCurrentLocation: false }), "checking");
  assert.equal(resolveDriverDashboardGpsState({ checking: false, hasCurrentLocation: true }), "available");
  assert.equal(resolveDriverDashboardGpsState({ checking: false, hasCurrentLocation: false, error: new Error("Location access denied by user.") }), "permission_needed");
  assert.equal(resolveDriverDashboardGpsState({ checking: false, hasCurrentLocation: false, error: new Error("Location request timed out.") }), "unavailable");
  assert.equal(ready().ready, true);
});

test("dashboard only calls material-filtered discovery and has no unfiltered fallback", () => {
  const dashboard = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /encodeURIComponent\(activeMaterialSlug!\)/);
  assert.match(dashboard, /queryKey: \['\/api\/drivers\/locations', activeMaterialSlug\]/);
  assert.match(dashboard, /enabled: hasValidActiveMaterial/);
  assert.doesNotMatch(dashboard, /apiRequest\("GET", "\/api\/drivers\/locations"\)/);
  assert.match(dashboard, /dashboardDataError/);
  assert.match(dashboard, /authUserError/);
  assert.match(dashboard, /termsStatusError/);
  assert.match(dashboard, /materialIntentError/);
  assert.match(dashboard, /driverLocationsError/);
  assert.match(dashboard, /unreadNotificationsError/);
  assert.match(dashboard, /walletBalanceError/);
  assert.match(dashboard, /driver-location-ranking-checking/);
  assert.match(dashboard, /driver-material-unavailable/);
  assert.match(dashboard, /driver-material-loading/);
  assert.match(dashboard, /driver-locations-unavailable/);
  assert.match(dashboard, /driver-wallet-unavailable/);
  assert.match(dashboard, /driver-notifications-unavailable/);
  assert.match(dashboard, /button-retry-dashboard-data/);
});

test("configured incentive copy is qualified and bilingual", () => {
  for (const language of ["en", "es"] as const) {
    assert.ok(translations[language]["driver.dashboard.configuredIncentiveQualification"]);
    assert.ok(translations[language]["driver.locations.configuredIncentiveQualification"]);
    assert.ok(translations[language]["driver.dashboard.readinessAction.select_material"]);
  }
  const locations = readFileSync(new URL("../client/src/pages/driver/locations.tsx", import.meta.url), "utf8");
  assert.match(locations, /driver\.locations\.configuredIncentive/);
  assert.doesNotMatch(locations, /driver\.locations\.driverPayoutPerWashout/);
  assert.doesNotMatch(locations, /driver\.locations\.driverTip/);

  const dashboard = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /Highest Nearby Driver Incentive/);
  assert.doesNotMatch(dashboard, /Best nearby payout focus/);
  assert.match(dashboard, /configuredIncentiveQualification/);
});

test("registration and later login return to the Dashboard, where the same readiness model selects recovery", () => {
  const registration = readFileSync(new URL("../client/src/pages/auth/register.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../client/src/pages/auth/login.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");

  assert.match(registration, /setLocation\('\/'\)/);
  assert.match(login, /setLocation\('\/'\)/);
  assert.match(dashboard, /resolveDriverDashboardReadinessPresentation/);
});
