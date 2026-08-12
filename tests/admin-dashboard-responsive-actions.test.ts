import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buttonVariants } from "../client/src/components/ui/button";
import { cn } from "../client/src/lib/utils";

test("Admin action classes override the shared Button no-wrap default", () => {
  const classes = cn(buttonVariants({
    variant: "outline",
    className: "h-auto w-full min-w-0 max-w-full whitespace-normal text-left",
  }));

  assert.match(classes, /whitespace-normal/);
  assert.doesNotMatch(classes, /whitespace-nowrap/);
  assert.match(classes, /min-w-0/);
  assert.match(classes, /max-w-full/);
});

test("Admin dashboard action cards wrap safely without truncating localized content", async () => {
  const dashboard = await readFile(new URL("../client/src/pages/admin/dashboard.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /ADMIN_DASHBOARD_ACTION_BUTTON_CLASS_NAME[\s\S]{0,180}w-full min-w-0 max-w-full[\s\S]{0,120}whitespace-normal text-left/);
  assert.match(dashboard, /ADMIN_DASHBOARD_ACTION_TEXT_CLASS_NAME[\s\S]{0,180}w-full min-w-0 max-w-full[\s\S]{0,120}whitespace-normal break-words \[overflow-wrap:anywhere\]/);
  assert.match(dashboard, /button-facility-geofence-controls-hero/);
  assert.match(dashboard, /button-billing-audit-report-hero/);
  assert.match(dashboard, /adminDashboard\.action\.billingAuditDescription/);

  const affectedActions = dashboard.match(/data-testid="button-facility-geofence-controls-hero"[\s\S]{0,900}|data-testid="button-billing-audit-report-hero"[\s\S]{0,900}/g)?.join("\n") || "";
  assert.doesNotMatch(affectedActions, /truncate|text-ellipsis|line-clamp|whitespace-nowrap/);
});

test("responsive action layout preserves links, alignment, and accessible Button behavior", async () => {
  const [dashboard, button] = await Promise.all([
    readFile(new URL("../client/src/pages/admin/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/ui/button.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /grid gap-2 sm:grid-cols-3/);
  assert.match(dashboard, /min-h-20/);
  assert.match(dashboard, /min-h-24/);
  assert.match(dashboard, /window\.location\.href = '\/admin\/facility-geofence-controls'/);
  assert.match(dashboard, /window\.location\.href = '\/billing-audit-report'/);
  assert.match(button, /focus-visible:ring-2/);
  assert.match(button, /disabled:pointer-events-none/);
});

test("English and Spanish preserve complete affected card text", async () => {
  const i18n = await readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");

  for (const key of [
    "facilityControls.nav",
    "facilityControls.dashboardActionDescription",
    "adminDashboard.action.billingAudit",
    "adminDashboard.action.billingAuditDescription",
  ]) assert.equal(i18n.split(`"${key}"`).length - 1, 2, `${key} must exist in English and Spanish`);

  assert.match(i18n, /"adminDashboard\.action\.billingAudit": "Billing Audit"/);
  assert.match(i18n, /"adminDashboard\.action\.billingAuditDescription": "Reconcile Stripe and recovery activities"/);
  assert.match(i18n, /"adminDashboard\.action\.billingAudit": "Auditoría de facturación"/);
  assert.match(i18n, /"adminDashboard\.action\.billingAuditDescription": "Conciliar Stripe y las actividades de recuperación"/);
});

test("Work Package 0 default-off Founder acceptance is recorded without authorizing cutover", async () => {
  const plan = await readFile(new URL("../docs/project/phase-5-sprint-3-two-factor-authentication-plan.md", import.meta.url), "utf8");

  assert.match(plan, /Founder Production acceptance passed on August 12, 2026/);
  assert.match(plan, /e9b991cebe0544c9b6c29584b352775f952d4b8d/);
  assert.match(plan, /Existing JWT authentication remains functional/);
  assert.match(plan, /does not authorize a session hash pepper, token-version cutover, server-session activation, TOTP implementation/);
});
