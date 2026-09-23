import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getUnitEconomicsNavigationItem, isMobileNavItemActive } from "../client/src/components/MobileNav";
import { translate } from "../client/src/lib/i18n";
import { calculateUnitEconomicsMonth, unitEconomicsCostInputSchema, unitEconomicsMonthSchema } from "../shared/unitEconomics";
import { ApiRequestError } from "../client/src/lib/queryClient";
import {
  downloadUnitEconomicsCsv,
  fetchUnitEconomicsCsv,
  fetchUnitEconomicsReport,
  shouldShowUnitEconomicsFoundationWarning,
  unitEconomicsAccessErrorMessage,
} from "../client/src/lib/unitEconomicsClient";

async function withAuthenticatedFetch<T>(
  response: () => Response,
  run: (request: () => { input: string | URL | Request; init?: RequestInit }) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let captured: { input: string | URL | Request; init?: RequestInit } | undefined;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "authToken" ? "existing-superadmin-token" : null },
  });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured = { input, init };
    return response();
  }) as typeof fetch;
  try {
    return await run(() => {
      assert.ok(captured, "expected an authenticated request");
      return captured;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

test("calculates profitable and break-even monthly unit economics", () => {
  const result = calculateUnitEconomicsMonth({ month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500, paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 10_000 });
  assert.equal(result.processingPerLoadCents, 45);
  assert.equal(result.grossRevenueCents, 50_000);
  assert.equal(result.contributionProfitCents, 35_500);
  assert.equal(result.breakEvenLoads, 22);
  assert.equal(result.isFiveDollarFeeProfitable, true);
});

test("handles a month with no validated loads without division by zero", () => {
  const result = calculateUnitEconomicsMonth({ month: "2026-09", validatedLoads: 0, feePerValidatedLoadCents: 500, paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 1_000 });
  assert.equal(result.profitPerValidatedLoadCents, null);
  assert.equal(result.contributionProfitCents, -1_000);
});

test("validates month and provider cost inputs", () => {
  assert.equal(unitEconomicsMonthSchema.safeParse("2026-09").success, true);
  assert.equal(unitEconomicsMonthSchema.safeParse("09-2026").success, false);
  assert.equal(unitEconomicsCostInputSchema.safeParse({ month: "2026-09", provider: "Squarespace", category: "domain_dns", amountCents: 2000 }).success, true);
  assert.equal(unitEconomicsCostInputSchema.safeParse({ month: "2026-09", provider: "Squarespace", category: "domain_dns", amountCents: -1 }).success, false);
});

test("dashboard request includes the existing bearer authentication and returns successful data", async () => {
  const payload = { foundationReady: true, month: "2026-09", costs: [], metrics: { validatedLoads: 2 } };
  await withAuthenticatedFetch(
    () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    async (request) => {
      assert.deepEqual(await fetchUnitEconomicsReport("2026-09"), payload);
      const captured = request();
      assert.equal(String(captured.input), "/api/superadmin/unit-economics?month=2026-09");
      assert.equal(new Headers(captured.init?.headers).get("Authorization"), "Bearer existing-superadmin-token");
    },
  );
});

test("authenticated CSV download includes bearer authentication and returns a Blob", async () => {
  await withAuthenticatedFetch(
    () => new Response('"CreteXchange Unit Economics","2026-09"', { status: 200, headers: { "Content-Type": "text/csv" } }),
    async (request) => {
      const result = await fetchUnitEconomicsCsv("2026-09");
      const captured = request();
      assert.equal(String(captured.input), "/api/superadmin/unit-economics/export.csv?month=2026-09");
      assert.equal(new Headers(captured.init?.headers).get("Authorization"), "Bearer existing-superadmin-token");
      assert.equal(result.filename, "cretexchange-unit-economics-2026-09.csv");
      assert.match(await result.blob.text(), /CreteXchange Unit Economics/);
      let clicked = false;
      let appended = false;
      let removed = false;
      let revoked = "";
      const anchor = { href: "", download: "", click: () => { clicked = true; }, remove: () => { removed = true; } };
      downloadUnitEconomicsCsv(result.blob, result.filename, {
        createObjectUrl: () => "blob:unit-economics",
        revokeObjectUrl: (url) => { revoked = url; },
        createAnchor: () => anchor,
        appendAnchor: () => { appended = true; },
      });
      assert.deepEqual(
        { clicked, appended, removed, revoked, href: anchor.href, download: anchor.download },
        { clicked: true, appended: true, removed: true, revoked: "blob:unit-economics", href: "blob:unit-economics", download: result.filename },
      );
    },
  );
});

test("401 responses produce an authentication error rather than a migration warning", async () => {
  await withAuthenticatedFetch(
    () => new Response(JSON.stringify({ message: "Authentication required" }), { status: 401, statusText: "Unauthorized" }),
    async () => {
      await assert.rejects(
        fetchUnitEconomicsReport("2026-09"),
        (error: unknown) => {
          assert.match(unitEconomicsAccessErrorMessage(error) || "", /session has expired/i);
          return true;
        },
      );
      assert.equal(shouldShowUnitEconomicsFoundationWarning(undefined, false), false);
    },
  );
});

test("only an authenticated successful foundationReady false response shows the migration warning", () => {
  const missingFoundation = { foundationReady: false, month: "2026-09", costs: [] };
  assert.equal(shouldShowUnitEconomicsFoundationWarning(missingFoundation, true), true);
  assert.equal(shouldShowUnitEconomicsFoundationWarning(missingFoundation, false), false);
  assert.equal(shouldShowUnitEconomicsFoundationWarning({ foundationReady: true, month: "2026-09", costs: [] }, true), false);
  assert.equal(shouldShowUnitEconomicsFoundationWarning(undefined, true), false);
});

test("403 responses produce a Superadmin authorization error", () => {
  const error = new ApiRequestError("Forbidden", { status: 403 });
  assert.match(unitEconomicsAccessErrorMessage(error) || "", /Superadmin access is required/i);
});

test("unit economics bottom navigation is visible only to Superadmins", () => {
  const t = (key: string) => key === "adminNav.unitEconomics" ? "Economics" : key;
  const item = getUnitEconomicsNavigationItem("super_admin", t);

  assert.deepEqual(
    item && { path: item.path, label: item.label, testIdLabel: item.testIdLabel },
    { path: "/unit-economics", label: "Economics", testIdLabel: "unit-economics" },
  );
  for (const role of ["admin", "owner", "driver", undefined] as const) {
    assert.equal(getUnitEconomicsNavigationItem(role, t), null);
  }

  const source = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
  const adminBranch = source.slice(source.indexOf('case "admin":'), source.indexOf('case "super_admin":'));
  const superadminBranch = source.slice(source.indexOf('case "super_admin":'), source.indexOf("default:"));
  assert.doesNotMatch(adminBranch, /unitEconomicsNavigationItem/);
  assert.match(superadminBranch, /unitEconomicsNavigationItem/);
});

test("unit economics navigation reports its exact route as active", () => {
  assert.equal(isMobileNavItemActive("/unit-economics", "/unit-economics"), true);
  assert.equal(isMobileNavItemActive("/", "/unit-economics"), false);
  assert.equal(isMobileNavItemActive("/unit-economics/history", "/unit-economics"), false);
});

test("unit economics navigation label is localized", () => {
  assert.equal(translate("adminNav.unitEconomics", "en"), "Economics");
  assert.equal(translate("adminNav.unitEconomics", "es"), "Economía");
});

test("all unit economics API routes use token authentication before Superadmin authorization", () => {
  const source = readFileSync(new URL("../server/unitEconomicsRoutes.ts", import.meta.url), "utf8");
  assert.equal((source.match(/isAuthenticated, requireSuperadmin/g) || []).length, 5);
  assert.doesNotMatch(source, /req\.isAuthenticated/);
  assert.match(source, /user\?\.role !== "super_admin"/);
});
