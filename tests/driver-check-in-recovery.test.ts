import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveDriverCheckInRecoveryState } from "../client/src/lib/driverCheckInRecovery";

const base = { materialIntentLoading: false, activeMaterialSlug: "concrete-washout", locationLoading: false, locationError: false, hasLocation: false };

test("check-in recovery distinguishes loading, missing material, unavailable, stale, and valid states", () => {
  assert.equal(resolveDriverCheckInRecoveryState({ ...base, materialIntentLoading: true }), "loading");
  assert.equal(resolveDriverCheckInRecoveryState({ ...base, activeMaterialSlug: null }), "missing_material");
  assert.equal(resolveDriverCheckInRecoveryState({ ...base, locationError: true }), "location_unavailable");
  assert.equal(resolveDriverCheckInRecoveryState(base), "location_missing_or_ineligible");
  assert.equal(resolveDriverCheckInRecoveryState({ ...base, hasLocation: true }), "ready");
});

test("check-in supplies direct recovery actions and no unfiltered location fallback", () => {
  const page = readFileSync(new URL("../client/src/pages/driver/check-in.tsx", import.meta.url), "utf8");
  assert.match(page, /encodeURIComponent\(activeMaterialSlug\)/);
  assert.match(page, /button-select-material/);
  assert.match(page, /setLocation\('\/locations'\)/);
  assert.match(page, /button-retry-location/);
  assert.match(page, /void refetch\(\)/);
  assert.match(page, /button-back-to-locations/);
  assert.match(page, /recoveryState === "location_missing_or_ineligible"/);
  assert.match(page, /<WashoutForm/);
  assert.doesNotMatch(page, /apiRequest\("GET", "\/api\/drivers\/locations"\)/);
});
