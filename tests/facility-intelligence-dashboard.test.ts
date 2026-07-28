import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Facility Intelligence dashboard is owner-routed, facility-scoped, and displays operational-only sections", async () => {
  const [app, page, navigation] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/owner/facility-intelligence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /path="\/intelligence" component=\{OwnerFacilityIntelligence\}/);
  assert.match(navigation, /path: "\/intelligence"/);
  assert.match(page, /\/api\/owners\/facilities\/\$\{locationId\}\/intelligence\/dashboard/);
  assert.match(page, /Verified washouts/);
  assert.match(page, /Drop-off intelligence/);
  assert.match(page, /Facility health/);
  assert.doesNotMatch(page, /wallet|stripe|payout|payment/i);
});
