import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FACILITY_CONTROL_REQUEST_MAX,
  CONTROLLED_NOTIFICATION_PILOT_FACILITY_ID,
  buildFacilityControlMutation,
  createFacilityControlRequestReference,
  facilityControlConfirmationText,
  resolveFacilityControlAction,
  validateFacilityControlDraft,
} from "../client/src/lib/adminFacilityGeofenceControls";
import { FEATURE_FLAGS } from "../shared/featureFlags";

const FACILITY_ID = CONTROLLED_NOTIFICATION_PILOT_FACILITY_ID;
const OTHER_FACILITY_ID = "11111111-1111-4111-8111-111111111111";

test("governed mutation draft requires exact Facility, allowed flag, reason, request reference, and confirmation", () => {
  const valid = {
    facilityId: FACILITY_ID,
    facilityConfirmed: true,
    flagKey: FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
    enabled: true,
    reason: "Founder-authorized controlled pilot",
    requestReference: "founder-approval-2026-08-08",
    confirmationText: "ENABLE",
  };
  assert.equal(validateFacilityControlDraft(valid), null);
  assert.equal(validateFacilityControlDraft({ ...valid, facilityId: "missing" }), "facility");
  assert.equal(validateFacilityControlDraft({ ...valid, facilityConfirmed: false }), "facilityConfirmation");
  assert.equal(validateFacilityControlDraft({ ...valid, flagKey: FEATURE_FLAGS.WALLET_FUNDING }), "flag");
  assert.equal(validateFacilityControlDraft({ ...valid, reason: "  " }), "reason");
  assert.equal(validateFacilityControlDraft({ ...valid, requestReference: "" }), "requestReference");
  assert.equal(validateFacilityControlDraft({ ...valid, confirmationText: "enable" }), "confirmation");
  assert.equal(validateFacilityControlDraft({ ...valid, requestReference: "x".repeat(FACILITY_CONTROL_REQUEST_MAX + 1) }), "requestReference");
});

test("isolated frontend handling builds explicit enable and disable requests without unrelated controls", () => {
  for (const enabled of [true, false]) {
    const request = buildFacilityControlMutation({
      facilityId: FACILITY_ID,
      facilityConfirmed: true,
      flagKey: FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
      enabled,
      reason: enabled ? "Controlled pilot enable" : "Controlled recovery disable",
      requestReference: `request-${enabled}`,
      confirmationText: facilityControlConfirmationText(enabled),
    });
    assert.equal(request.body.enabled, enabled);
    assert.equal(request.flagKey, FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS);
    assert.equal(Object.keys(request.body).sort().join(","), "enabled,reason");
  }
  assert.throws(() => buildFacilityControlMutation({
    facilityId: FACILITY_ID,
    facilityConfirmed: true,
    flagKey: FEATURE_FLAGS.TREASURY_ENABLED,
    enabled: true,
    reason: "Not Facility governed",
    requestReference: "request-financial",
    confirmationText: "ENABLE",
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
  assert.match(page, /p-4 md:p-6/);
  assert.match(page, /flex-col gap-4 sm:flex-row/);
  assert.match(page, /lg:grid-cols-3/);
  assert.match(page, /<MobileNav role=/);
  assert.match(page, /user\?\.role === "admin" \|\| user\?\.role === "super_admin"/);
});

test("only the Revel notification pilot enable is available while emergency disables remain available", () => {
  assert.deepEqual(resolveFacilityControlAction(FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT, false, FACILITY_ID), { kind: "enable", available: false });
  assert.deepEqual(resolveFacilityControlAction(FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS, false, FACILITY_ID), { kind: "enable", available: true });
  assert.deepEqual(resolveFacilityControlAction(FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS, false, OTHER_FACILITY_ID), { kind: "enable", available: false });
  assert.deepEqual(resolveFacilityControlAction(FEATURE_FLAGS.GEOFENCE_LEGACY_TRANSITION, false, FACILITY_ID), { kind: "enable", available: false });
  for (const flagKey of [
    FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
    FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
    FEATURE_FLAGS.GEOFENCE_LEGACY_TRANSITION,
  ]) assert.deepEqual(resolveFacilityControlAction(flagKey, true, OTHER_FACILITY_ID), { kind: "disable", available: true });
});

test("page load is read-only and failed mutations retain the server-rendered state", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8");
  assert.match(page, /queryFn: async \(\) => \(await apiRequest\("GET", controlEndpoint\)\)\.json\(\)/);
  assert.match(page, /enabled: allowed && Boolean\(facilityId\)/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /onSuccess: async \(_data, pending\) => \{[\s\S]{0,500}setDraft\(null\)/);
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
    "facility-control-confirmation-text", "facility-control-reason", "facility-control-request-reference",
    "facilities.isLoading", "facilities.isError", "controls.isLoading", "controls.isError",
    "controls.refetch", "role=\"status\"", "role=\"alert\"", "aria-labelledby",
  ]) assert.match(page, new RegExp(required));
  assert.match(page, /data-state=\{enabled \? "enabled" : "disabled"\}/);
  assert.match(page, /enforcementWarning/);
  assert.match(page, /authorizationWarning/);
  assert.match(page, /action\.kind === "disable"/);
  assert.match(page, /disabled=\{!action\.available\}/);
  assert.match(page, /aria-describedby=\{phaseId\}/);
  assert.match(page, /variant="outline" autoFocus onClick=\{\(\) => setDraft\(null\)\}/);
  assert.match(page, /facility-control-exact-facility/);
  assert.match(page, /facilityConfirmed: checked === true/);
  assert.match(page, /facilityConfirmed: pending\.facilityConfirmed/);
  assert.match(page, /<LanguageToggle/);
});

test("confirmation dialog is viewport-bounded, internally scrollable, and preserves modal focus behavior", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8");
  assert.match(page, /<Dialog modal open=/, "Radix modal locks background scrolling and traps focus");
  assert.match(page, /100dvh/);
  assert.match(page, /safe-area-inset-top/);
  assert.match(page, /safe-area-inset-bottom/);
  assert.match(page, /facility-control-dialog-scroll-region/);
  assert.match(page, /min-h-0 flex-1[^"]*overflow-y-auto[^"]*overflow-x-hidden[^"]*overscroll-contain/);
  assert.match(page, /shrink-0 gap-2 border-t bg-background/);
  assert.match(page, /onCloseAutoFocus/);
  assert.match(page, /mutationTriggerRef\.current\.focus\(\)/);
  assert.match(page, /motion-reduce:animate-none/);
  assert.match(page, /w-\[calc\(100%-1rem\)\]/);
  assert.match(page, /max-w-2xl/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.doesNotMatch(page, /overflow-x-auto/);
});

test("opening and cancelling the dialog cannot mutate a Facility control", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/facility-geofence-controls.tsx", import.meta.url), "utf8");
  const openMutation = page.match(/const openMutation = [\s\S]+?\n  };/)?.[0] || "";
  assert.match(openMutation, /setDraft\(/);
  assert.doesNotMatch(openMutation, /mutation\.mutate|apiRequest|method: "PUT"/);
  assert.match(page, /variant="outline" autoFocus onClick=\{\(\) => setDraft\(null\)\}/);
  assert.match(page, /onClick=\{\(\) => draft && mutation\.mutate\(draft\)\}/);
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
    "facilityControls.safety.deliveryIndependence",
    "facilityControls.safety.notificationPilotScope",
    "facilityControls.phase.notifications",
    "facilityControls.phase.legacy",
    "facilityControls.confirm.typedLabel",
    "facilityControls.confirm.exactFacility",
    "facilityControls.confirm.notificationYellowGray",
    "facilityControls.history.empty",
    "facilityControls.mutation.enableSuccessDescription",
    "adminNav.facilityGeofenceControls",
  ]) assert.equal(i18n.split(`"${key}"`).length - 1, 2, `${key} must exist in English and Spanish`);
  assert.match(i18n, /These controls do not control whether Owners can see deliveries or washout reviews\. They affect how new submissions are processed after activation\./);
  assert.match(i18n, /Not authorized during the notification pilot\./);
  assert.match(i18n, /Available only for the controlled Revel Patio Grill notification pilot/);
  assert.match(i18n, /"facilityControls\.phase\.legacy": "Deferred\."/);
  assert.match(i18n, /This affects future completed yellow and Gray submissions only\./);
  assert.match(i18n, /Green submissions receive no additional geofence notice\./);
  assert.match(i18n, /Red enforcement is not part of this pilot\./);
  assert.match(i18n, /Yellow and Gray events notify the Driver, Owner, Admin, and Super Admin/);
  assert.match(i18n, /This affects new qualifying submissions only\. Existing reviews and deliveries are unchanged\./);
  assert.doesNotMatch(page, /latitude|longitude|polygon|gps|ownerId|driverId|storagePath|analyticsPayload|stripe|wallet|settlement/i);
  assert.doesNotMatch(server, /latitude|longitude|polygon|gps|ownerId|driverId|storagePath|analyticsPayload|stripe|wallet|settlement/i);
  assert.match(server, /FACILITY_SCOPED_GEOFENCE_FEATURE_FLAGS/);
  assert.match(server, /actorRole/);
  assert.doesNotMatch(server, /actorUserId: event\.actorUserId/);
});
