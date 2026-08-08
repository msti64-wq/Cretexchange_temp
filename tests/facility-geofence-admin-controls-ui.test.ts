import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FACILITY_CONTROL_REQUEST_MAX,
  buildFacilityControlMutation,
  createFacilityControlRequestReference,
  validateFacilityControlDraft,
} from "../client/src/lib/adminFacilityGeofenceControls";
import { FEATURE_FLAGS } from "../shared/featureFlags";

const FACILITY_ID = "11111111-1111-4111-8111-111111111111";

test("governed mutation draft requires exact Facility, allowed flag, reason, request reference, and confirmation", () => {
  const valid = {
    facilityId: FACILITY_ID,
    flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
    reason: "Founder-authorized controlled pilot",
    requestReference: "founder-approval-2026-08-08",
    confirmed: true,
  };
  assert.equal(validateFacilityControlDraft(valid), null);
  assert.equal(validateFacilityControlDraft({ ...valid, facilityId: "missing" }), "facility");
  assert.equal(validateFacilityControlDraft({ ...valid, flagKey: FEATURE_FLAGS.WALLET_FUNDING }), "flag");
  assert.equal(validateFacilityControlDraft({ ...valid, reason: "  " }), "reason");
  assert.equal(validateFacilityControlDraft({ ...valid, requestReference: "" }), "requestReference");
  assert.equal(validateFacilityControlDraft({ ...valid, confirmed: false }), "confirmation");
  assert.equal(validateFacilityControlDraft({ ...valid, requestReference: "x".repeat(FACILITY_CONTROL_REQUEST_MAX + 1) }), "requestReference");
});

test("isolated frontend handling builds explicit enable and disable requests without unrelated controls", () => {
  for (const enabled of [true, false]) {
    const request = buildFacilityControlMutation({
      facilityId: FACILITY_ID,
      flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
      enabled,
      reason: enabled ? "Controlled pilot enable" : "Controlled recovery disable",
      requestReference: `request-${enabled}`,
      confirmed: true,
    });
    assert.equal(request.body.enabled, enabled);
    assert.equal(request.flagKey, FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT);
    assert.equal(Object.keys(request.body).sort().join(","), "enabled,reason");
  }
  assert.throws(() => buildFacilityControlMutation({
    facilityId: FACILITY_ID,
    flagKey: FEATURE_FLAGS.TREASURY_ENABLED,
    enabled: true,
    reason: "Not Facility governed",
    requestReference: "request-financial",
    confirmed: true,
  }), /FACILITY_CONTROL_DRAFT_FLAG/);
  assert.ok(createFacilityControlRequestReference().length <= FACILITY_CONTROL_REQUEST_MAX);
});

test("Admin and Super Admin navigation exposes the responsive Facility pilot interface", async () => {
  const [app, nav, dashboard, page] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/admin/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /AdminFacilityGeofenceControls/);
  assert.match(app, /path="\/admin\/facility-geofence-controls"/);
  assert.equal(nav.split('path: "/admin/facility-geofence-controls"').length - 1, 2, "Admin and Super Admin navigation entries");
  assert.match(nav, /testIdLabel: "facility-geofence-controls"/);
  assert.match(dashboard, /button-facility-geofence-controls-hero/);
  assert.match(dashboard, /button-facility-geofence-controls/);
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /lg:grid-cols-3/);
  assert.match(page, /<MobileNav role=/);
  assert.match(page, /user\?\.role === "admin" \|\| user\?\.role === "super_admin"/);
});

test("page load is read-only and failed mutations retain the server-rendered state", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8");
  assert.match(page, /queryFn: async \(\) => \(await apiRequest\("GET", controlEndpoint\)\)\.json\(\)/);
  assert.match(page, /enabled: allowed && Boolean\(facilityId\)/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /onSuccess: async \(\) => \{[\s\S]{0,260}setDraft\(null\)/);
  const onError = page.match(/onError: \(error: Error\) => \{[\s\S]{0,420}?\n    \},/)?.[0] || "";
  assert.doesNotMatch(onError, /setDraft\(null\)|setQueryData|effectiveEnabled\s*=/);
  assert.doesNotMatch(page, /onMutate|setQueryData/);
  assert.match(page, /mutation\.isError/);
  assert.match(page, /prior server state remains displayed|facilityControls\.mutation\.inlineError/);
});

test("Facility state, audit history, confirmation, loading, retry, and accessibility states are present", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8");
  for (const required of [
    "globalEnabled", "overrideEnabled", "effectiveEnabled", "source",
    "facility-control-history-event", "priorEnabled", "newEnabled", "requestId",
    "facility-control-confirmed", "facility-control-reason", "facility-control-request-reference",
    "facilities.isLoading", "facilities.isError", "controls.isLoading", "controls.isError",
    "controls.refetch", "role=\"status\"", "role=\"alert\"", "aria-labelledby",
  ]) assert.match(page, new RegExp(required));
  assert.match(page, /data-state=\{enabled \? "enabled" : "disabled"\}/);
  assert.match(page, /enforcementWarning/);
  assert.match(page, /authorizationWarning/);
  assert.match(page, /<LanguageToggle/);
});

test("English and Spanish cover the full Facility control experience without financial or private data", async () => {
  const [page, i18n, server] = await Promise.all([
    readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/facilityFeatureControlRoutes.ts", import.meta.url), "utf8"),
  ]);
  for (const key of [
    "facilityControls.title",
    "facilityControls.control.enforcement",
    "facilityControls.confirm.checkbox",
    "facilityControls.history.empty",
    "facilityControls.mutation.inlineError",
    "adminNav.facilityGeofenceControls",
  ]) assert.equal(i18n.split(`"${key}"`).length - 1, 2, `${key} must exist in English and Spanish`);
  assert.doesNotMatch(page, /latitude|longitude|polygon|gps|ownerId|driverId|storagePath|analyticsPayload|stripe|wallet|settlement/i);
  assert.doesNotMatch(server, /latitude|longitude|polygon|gps|ownerId|driverId|storagePath|analyticsPayload|stripe|wallet|settlement/i);
  assert.match(server, /FACILITY_SCOPED_GEOFENCE_FEATURE_FLAGS/);
  assert.match(server, /actorRole/);
  assert.doesNotMatch(server, /actorUserId: event\.actorUserId/);
});
