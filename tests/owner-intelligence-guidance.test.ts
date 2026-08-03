import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translate } from "../client/src/lib/i18n";
import { resolveOwnerFacilitySelection } from "../client/src/lib/ownerFacilityIntelligenceSelection";

const pageUrl = new URL("../client/src/pages/owner/facility-intelligence.tsx", import.meta.url);

test("multi-Facility Owners receive prominent localized selection guidance before analytics", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /showSelectionGuidance/);
  assert.match(page, /selection\.state === "required" \|\| selection\.state === "invalid"/);
  assert.match(page, /facility-intelligence-selection-required/);
  assert.match(page, /border-2 border-primary\/40/);
  assert.match(page, /shadow-lg shadow-primary\/10/);
  assert.match(page, /owner\.intelligence\.guidanceTitle/);
  assert.match(page, /owner\.intelligence\.guidanceBody/);
  assert.match(page, /owner\.intelligence\.guidanceHelper/);
  assert.match(page, /role="region"/);
  assert.match(page, /aria-labelledby="facility-selection-guidance-title"/);
  assert.match(page, /aria-describedby="facility-selection-guidance-body facility-selection-guidance-helper"/);
});

test("Facility selection remains explicit, Owner-scoped, and blocks Intelligence until valid", async () => {
  const page = await readFile(pageUrl, "utf8");
  const selection = resolveOwnerFacilitySelection({
    facilityIds: ["revel", "back-yard"],
    urlSelection: { present: false, facilityId: null },
  });

  assert.deepEqual(selection, { state: "required", facilityId: null, source: null });
  assert.match(page, /enabled: Boolean\(locationId\)/);
  assert.match(page, /value=\{locationId \|\| ""\}/);
  assert.match(page, /SelectValue placeholder=\{t\("owner\.intelligence\.selectFacility"\)\}/);
  assert.match(page, /setLocation\(ownerFacilityIntelligencePath\(facilityId\)\)/);
  assert.doesNotMatch(page, /locations\[0\]/);
});

test("pre-selection UI renders neither metric cards nor misleading zero placeholders", async () => {
  const page = await readFile(pageUrl, "utf8");
  const guidanceStart = page.indexOf("{showSelectionGuidance &&");
  const selectedStart = page.indexOf("{locationId && selectedFacilityName &&");
  const guidance = page.slice(guidanceStart, selectedStart);

  assert.ok(guidanceStart >= 0 && selectedStart > guidanceStart);
  assert.doesNotMatch(guidance, /<MetricCard/);
  assert.doesNotMatch(guidance, />0</);
  assert.doesNotMatch(guidance, /OwnerIntelligenceLoadingPanel/);
  assert.match(page, /\{data && <>/);
});

test("selected Facility context exposes Currently Viewing and an obvious change control", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /facility-intelligence-current-context/);
  assert.match(page, /owner\.intelligence\.currentlyViewing/);
  assert.match(page, /facility-intelligence-current-name/);
  assert.match(page, /owner\.intelligence\.changeFacility/);
  assert.match(page, /locations\.length > 1/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /currentFacilityAria.*facility: selectedFacilityName/);
});

test("single and no-Facility selection behavior remains unchanged", () => {
  assert.deepEqual(resolveOwnerFacilitySelection({
    facilityIds: ["revel"],
    urlSelection: { present: false, facilityId: null },
  }), { state: "selected", facilityId: "revel", source: "single" });
  assert.deepEqual(resolveOwnerFacilitySelection({
    facilityIds: [],
    urlSelection: { present: false, facilityId: null },
  }), { state: "empty", facilityId: null, source: null });
});

test("invalid and cross-Owner Facility identifiers remain safely rejected", () => {
  assert.deepEqual(resolveOwnerFacilitySelection({
    facilityIds: ["revel", "back-yard"],
    urlSelection: { present: true, facilityId: "another-owner-facility" },
    storedFacilityId: "revel",
  }), { state: "invalid", facilityId: null, source: "url" });
});

test("guidance, selected context, and controls have complete English and Spanish copy", () => {
  const keys = [
    "guidanceTitle",
    "guidanceBody",
    "guidanceHelper",
    "facilitySelectorLabel",
    "selectFacility",
    "currentlyViewing",
    "changeFacility",
    "currentFacilityAria",
    "loading",
    "invalidFacility",
    "retryFacilitiesAria",
  ];

  for (const suffix of keys) {
    const key = `owner.intelligence.${suffix}`;
    assert.notEqual(translate(key, "en"), key);
    assert.notEqual(translate(key, "es"), key);
    assert.notEqual(translate(key, "en"), translate(key, "es"));
  }
  assert.equal(translate("owner.intelligence.guidanceTitle", "en"), "Select a Recovery Facility");
  assert.equal(translate("owner.intelligence.guidanceTitle", "es"), "Seleccione una instalación de recuperación");
  assert.equal(translate("owner.intelligence.changeFacility", "es"), "Cambiar instalación de recuperación");
});

test("guidance controls preserve mobile and keyboard accessibility without new animation", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /h-12 w-full/);
  assert.match(page, /sm:min-w-72/);
  assert.match(page, /focus:ring-4 focus:ring-primary\/20/);
  assert.match(page, /aria-label=\{t\("owner\.intelligence\.facilityAria"\)\}/);
  assert.match(page, /<h3 id="facility-selection-guidance-title"/);
  assert.doesNotMatch(page, /animate-(pulse|bounce|ping)/);
});

test("Intelligence calculations, Driver Journey, financial isolation, and APIs are untouched by the UX component", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /ownerFacilityIntelligenceRequest\(locationId!, range\)/);
  assert.match(page, /data\.overview\.verifiedCount/);
  assert.match(page, /data\.overview\.submittedCount/);
  assert.match(page, /data\.health\.score/);
  assert.match(page, /data\.dropoff\.driverJourney/);
  assert.match(page, /data\.dropoff\.washoutJourney/);
  assert.doesNotMatch(page, /stripe|wallet|payout|payment/i);
});
