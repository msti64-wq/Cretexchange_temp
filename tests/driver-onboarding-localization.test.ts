import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translations, translate } from "../client/src/lib/i18n";

const batch4Keys = [
  "auth.register.title", "auth.register.passwordMismatch", "auth.register.successTitle", "auth.login.title", "auth.login.resetTitle", "auth.login.resetSentDescription",
  "driver.error.profileDescription", "driver.error.termsDescription", "driver.error.materialMismatchDescription", "driver.error.locationDescription", "driver.error.unavailableDescription",
  "legal.driverOperationalReadinessDescription", "driver.material.catalogLoading", "driver.material.catalogUnavailable", "driver.material.intentLoading", "driver.material.intentUnavailable", "driver.material.emptyCatalog",
  "driver.checkIn.selectMaterialTitle", "driver.checkIn.locationUnavailableTitle", "driver.checkIn.locationNotFoundTitle", "driver.checkIn.browseLocations",
  "driver.washout.title", "driver.washout.configuredIncentive", "driver.washout.configuredIncentiveQualification", "driver.washout.takePhotos", "driver.washout.successTitle", "driver.washout.uploadIncompleteDescription",
  "driver.dashboard.configuredIncentiveQualification", "driver.locations.configuredIncentiveQualification",
  "nav.rewards", "common.logout",
] as const;

test("Batch 4 Driver onboarding keys have English and Spanish parity with working interpolation", () => {
  for (const key of batch4Keys) {
    for (const language of ["en", "es"] as const) {
      assert.ok(translations[language][key], `${language} is missing ${key}`);
      assert.notEqual(translate(key, language, { location: "North Yard", count: 2, limit: 15 }), key);
    }
  }
  assert.match(translate("driver.washout.title", "en", { location: "North Yard" }), /North Yard/);
  assert.match(translate("driver.washout.takePhotos", "es", { count: 2 }), /2/);
});

test("targeted Driver presentation uses translated recovery and configured-incentive copy", () => {
  const registration = readFileSync(new URL("../client/src/pages/auth/register.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../client/src/pages/auth/login.tsx", import.meta.url), "utf8");
  const checkIn = readFileSync(new URL("../client/src/pages/driver/check-in.tsx", import.meta.url), "utf8");
  const washoutForm = readFileSync(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8");
  const materialSelector = readFileSync(new URL("../client/src/components/driver/DriverMaterialIntentSelector.tsx", import.meta.url), "utf8");
  const termsDialog = readFileSync(new URL("../client/src/components/DriverTermsDialog.tsx", import.meta.url), "utf8");

  assert.match(registration, /auth\.register\.successTitle/);
  assert.match(registration, /auth\.register\.failedDescription/);
  assert.match(login, /auth\.login\.resetSentDescription/);
  assert.match(login, /auth\.login\.failedDescription/);
  assert.match(checkIn, /driver\.checkIn\.locationUnavailableTitle/);
  assert.match(checkIn, /driver\.checkIn\.locationNotFoundTitle/);
  assert.match(washoutForm, /driver\.washout\.configuredIncentiveQualification/);
  assert.match(washoutForm, /presentDriverOperationalError/);
  assert.match(washoutForm, /presentDriverOperationalError\(error,[\s\S]*queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/auth\/user"\] \}\)/);
  assert.match(materialSelector, /driver-material-catalog-unavailable/);
  assert.match(materialSelector, /driver-material-intent-unavailable/);
  assert.match(termsDialog, /legal\.driverOperationalReadinessDescription/);
  const driverHeader = readFileSync(new URL("../client/src/components/DriverHeader.tsx", import.meta.url), "utf8");
  const mobileNav = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(driverHeader, /label=\{t\("common\.logout"\)\}/);
  assert.match(mobileNav, /label: t\("nav\.rewards"\)/);
});
