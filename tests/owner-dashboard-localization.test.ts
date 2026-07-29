import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner dashboard routes visible intelligence and summary copy through translations", () => {
  const source = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  for (const key of [
    "owner.dashboard.platformFees",
    "owner.dashboard.ownerIntelligence",
    "owner.dashboard.driverIntelligence",
    "owner.dashboard.driverActivityDirectory",
    "owner.dashboard.currentReceivables",
    "owner.dashboard.at",
    "owner.dashboard.washoutCount",
    "owner.dashboard.ownerChargeAwaitingCollection",
    "owner.dashboard.repeatDriverDefinition",
    "owner.dashboard.noApprovedDriversMatch",
  ]) assert.match(source, new RegExp(`t\\("${key}"`));
  assert.doesNotMatch(source, />Platform Fees</);
  assert.doesNotMatch(source, />Owner Intelligence</);
  assert.doesNotMatch(source, />Driver Intelligence</);
});

test("English and Spanish catalogs provide every owner dashboard localization key introduced by Phase 2", () => {
  const source = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");
  for (const key of [
    "owner.dashboard.platformFees",
    "owner.dashboard.ownerIntelligence",
    "owner.dashboard.driverIntelligence",
    "owner.dashboard.driverActivityDirectory",
    "owner.dashboard.currentReceivables",
    "owner.dashboard.at",
    "owner.dashboard.washoutCount",
    "owner.dashboard.ownerChargeAwaitingCollection",
    "owner.dashboard.repeatDriverDefinition",
    "owner.dashboard.noApprovedDriversMatch",
  ]) {
    assert.equal((source.match(new RegExp(`"${key}":`, "g")) || []).length, 2, `${key} must exist in English and Spanish`);
  }
});

test("Owner dashboard header leaves duplicated route navigation to the canonical bottom navigation", () => {
  const source = readFileSync(new URL("../client/src/components/OwnerHeader.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /button-facility-intelligence|button-profile|button-add-location|button-payment-methods/);
  assert.doesNotMatch(source, /useLocation|setLocation\(/);
  assert.match(source, /<LanguageToggle(?:\s+[^>]*)?\s\/>/);
  assert.match(source, /<LogoutButton/);
});
