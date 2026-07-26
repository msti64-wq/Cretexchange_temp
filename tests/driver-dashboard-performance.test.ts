import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
const lifecycleSource = readFileSync(new URL("../client/src/hooks/useDriverPaymentLifecycle.ts", import.meta.url), "utf8");

test("Driver Dashboard keeps operational reads on the critical path and defers secondary widgets until after paint", () => {
  assert.match(dashboardSource, /includeSecondary=false/);
  assert.match(dashboardSource, /window\.requestAnimationFrame[\s\S]*window\.requestAnimationFrame/);
  assert.match(dashboardSource, /queryKey: \['\/api\/drivers\/stripe-status'\][\s\S]*enabled: deferredDashboardWidgetsEnabled/);
  assert.match(dashboardSource, /queryKey: \['\/api\/drivers\/debit-card-status'\][\s\S]*enabled: deferredDashboardWidgetsEnabled/);
  assert.match(dashboardSource, /queryKey: \['\/api\/notifications\/unread'\][\s\S]*enabled: deferredDashboardWidgetsEnabled/);
  assert.match(dashboardSource, /queryKey: \['\/api\/wallet\/balance'\][\s\S]*enabled: deferredDashboardWidgetsEnabled/);
  assert.match(dashboardSource, /queryKey: \['\/api\/lottery\/status'\][\s\S]*enabled: deferredDashboardWidgetsEnabled/);
  assert.match(dashboardSource, /useDriverPaymentLifecycle\(\{ enabled: deferredDashboardWidgetsEnabled \}\)/);
  assert.match(dashboardSource, /data-testid="driver-operational-readiness"/);
  assert.doesNotMatch(
    dashboardSource.slice(
      dashboardSource.indexOf('data-testid="driver-operational-readiness"'),
      dashboardSource.indexOf('data-testid="driver-optional-financial-status"'),
    ),
    /optionalFinancialLoading|optionalDebitCardLoading|optionalWalletLoading/,
  );
});

test("Driver payment lifecycle can be disabled without changing the Wallet default behavior", () => {
  assert.match(lifecycleSource, /export function useDriverPaymentLifecycle\(\{ enabled = true \}/);
  assert.match(lifecycleSource, /enabled,/);
  assert.match(lifecycleSource, /if \(!enabled\) return;/);
});
