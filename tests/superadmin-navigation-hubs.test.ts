import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getSuperAdminConsolidatedNavigationItems, isMobileNavItemActive } from "../client/src/lib/mobileNavigation";
import { translate } from "../client/src/lib/i18n";
import {
  canAccessSuperAdminNavigationHub,
  getSuperAdminHubForPath,
  getSuperAdminHubReturnPath,
  resolveAdminUserRoleFilter,
  SUPERADMIN_HUB_DESTINATIONS,
  SUPERADMIN_HUB_PATHS,
} from "../client/src/lib/superAdminNavigation";

const t = (key: string) => translate(key, "en");

test("Superadmin bottom navigation exposes the two consolidated hubs", () => {
  const items = getSuperAdminConsolidatedNavigationItems(t);
  assert.ok(items.some((item) => item.path === SUPERADMIN_HUB_PATHS["users-locations"] && item.label === "Users & Locations" && item.wrapLabel));
  assert.ok(items.some((item) => item.path === SUPERADMIN_HUB_PATHS.financials && item.label === "Financials" && item.wrapLabel));

  for (const moved of ["/users", "/locations", "/admin/facility-geofence-controls", "/admin/financial-operations", "/reconciliation", "/subscriptions", "/service-accounts", "/unit-economics"]) {
    assert.equal(items.some((item) => item.path === moved), false, `${moved} should be represented inside a hub rather than as a standalone bottom tab`);
  }
});

test("navigation hubs remain restricted to Superadmin", () => {
  assert.equal(canAccessSuperAdminNavigationHub("super_admin"), true);
  for (const role of ["admin", "owner", "driver", null, undefined]) assert.equal(canAccessSuperAdminNavigationHub(role), false);

  const source = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  const adminBranch = source.slice(source.indexOf('case "admin":'), source.indexOf('case "super_admin":'));
  assert.doesNotMatch(adminBranch, /getSuperAdminConsolidatedNavigationItems|users-locations|admin\/financials/);
});

test("every consolidated destination is represented by a working existing route", () => {
  assert.deepEqual(SUPERADMIN_HUB_DESTINATIONS["users-locations"].map((item) => item.path), [
    "/users",
    "/users?role=driver",
    "/users?role=owner",
    "/locations",
    "/admin/facility-geofence-controls",
  ]);
  assert.deepEqual(SUPERADMIN_HUB_DESTINATIONS.financials.map((item) => item.path), [
    "/unit-economics",
    "/fees",
    "/payments",
    "/financial-workspace",
    "/admin/financial-operations",
    "/reconciliation",
    "/billing-audit-report",
    "/subscriptions",
    "/service-accounts",
    "/billing-settings",
  ]);

  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  for (const path of [...SUPERADMIN_HUB_DESTINATIONS["users-locations"], ...SUPERADMIN_HUB_DESTINATIONS.financials].map((item) => item.path.split("?")[0])) {
    assert.match(app, new RegExp(`<Route path=["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`), `Direct route ${path} must remain compatible`);
  }
  assert.match(app, /<Route path="\/admin\/users-locations"/);
  assert.match(app, /<Route path="\/admin\/financials"/);
});

test("hub and child routes select the correct active bottom tab", () => {
  for (const path of ["/admin/users-locations", "/users", "/users?role=driver", "/locations", "/admin/facility-geofence-controls"]) {
    assert.equal(getSuperAdminHubForPath(path), "users-locations");
    assert.equal(isMobileNavItemActive(path, SUPERADMIN_HUB_PATHS["users-locations"], "super_admin", "users-locations"), true);
  }
  for (const path of ["/admin/financials", "/unit-economics", "/fees", "/payments", "/admin/financial-operations/owners/example", "/reconciliation", "/billing-audit-report"]) {
    assert.equal(getSuperAdminHubForPath(path), "financials");
    assert.equal(isMobileNavItemActive(path, SUPERADMIN_HUB_PATHS.financials, "super_admin", "financials"), true);
  }
  assert.equal(getSuperAdminHubForPath("/reports"), null);
});

test("child pages have a deterministic return path while hub pages do not", () => {
  assert.equal(getSuperAdminHubReturnPath("/unit-economics"), "/admin/financials");
  assert.equal(getSuperAdminHubReturnPath("/users?role=owner"), "/admin/users-locations");
  assert.equal(getSuperAdminHubReturnPath("/admin/financials"), null);
  assert.equal(getSuperAdminHubReturnPath("/admin/users-locations"), null);
});

test("Driver and Facility Owner hub links select the existing User Management role filters", () => {
  assert.equal(resolveAdminUserRoleFilter("role=driver"), "driver");
  assert.equal(resolveAdminUserRoleFilter("role=owner"), "owner");
  assert.equal(resolveAdminUserRoleFilter("role=invalid"), "all");
  assert.equal(resolveAdminUserRoleFilter(""), "all");
});

test("Unit Economics is routed through Financials and financial execution status is explicit", () => {
  assert.ok(SUPERADMIN_HUB_DESTINATIONS.financials.some((item) => item.path === "/unit-economics"));
  const source = readFileSync(new URL("../client/src/pages/super-admin/navigation-hubs.tsx", import.meta.url), "utf8");
  assert.match(source, /financial-execution-disabled/);
  assert.match(translate("superadminHub.financialExecutionDisabledDescription", "en"), /cannot enable collections, payments, Driver settlements/);
  assert.doesNotMatch(source, /enableFinancial|FINANCIAL_EXECUTION_ENABLED\s*=\s*true/);
});

test("mobile navigation preserves accessible active state and wrapped hub labels", () => {
  const source = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(source, /min-h-\[2\.25em\].*whitespace-normal.*break-words/);
  assert.match(source, /aria-label=/);
  assert.equal(translate("adminNav.usersLocations", "es"), "Usuarios y ubicaciones");
  assert.equal(translate("adminNav.financials", "es"), "Finanzas");
});
