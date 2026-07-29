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
    "owner.dashboard.pendingReviewDescription",
    "owner.dashboard.today",
    "owner.dashboard.yesterday",
    "owner.dashboard.last7Days",
    "owner.dashboard.last30Days",
    "owner.dashboard.last90Days",
    "owner.dashboard.allTime",
  ]) assert.match(source, new RegExp(`t\\("${key}"`));
  assert.doesNotMatch(source, />Platform Fees</);
  assert.doesNotMatch(source, />Owner Intelligence</);
  assert.doesNotMatch(source, />Driver Intelligence</);
  assert.doesNotMatch(source, /<DSStatusChip tone="neutral">\{dateRange\}<\/DSStatusChip>/);
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
    "owner.dashboard.pendingReviewDescription",
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

test("Owner bottom navigation preserves the canonical profile route", () => {
  const source = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /case "owner":[\s\S]*?\{ path: "\/profile", icon: User, label: t\("nav\.profile"\), testIdLabel: "profile" \}/,
  );
});

test("Owner dashboard shared labels use the active language catalog", () => {
  const mobileNav = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../client/src/components/OwnerHeader.tsx", import.meta.url), "utf8");
  const emptyState = readFileSync(new URL("../client/src/components/DashboardEmptyState.tsx", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");

  assert.match(mobileNav, /label: t\("header\.intelligence"\)/);
  assert.match(header, /label=\{t\("common\.logout"\)\}/);
  assert.match(emptyState, /t\("common\.workspace"\)/);
  assert.equal((catalog.match(/"common\.workspace":/g) || []).length, 2);
});
