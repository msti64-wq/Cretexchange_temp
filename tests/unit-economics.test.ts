import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildUnitEconomicsProviderRegister,
  buildUnitEconomicsCsv,
  calculateUnitEconomicsModeledMonthlyCosts,
  calculateUnitEconomicsScenarioMonthlyCost,
  calculateUnitEconomicsMonth,
  unitEconomicsMonthlyCostsComplete,
  unitEconomicsProvidersRequiringConfirmation,
  unitEconomicsCostInputSchema,
  unitEconomicsMonthSchema,
  unitEconomicsProviderBaseline,
} from "../shared/unitEconomics";
import { ApiRequestError } from "../client/src/lib/queryClient";
import {
  downloadUnitEconomicsCsv,
  fetchUnitEconomicsCsv,
  fetchUnitEconomicsReport,
  shouldShowUnitEconomicsFoundationWarning,
  unitEconomicsAccessErrorMessage,
  unitEconomicsReportQueryKey,
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
      assert.equal(String(captured.input), "/api/superadmin/unit-economics?month=2026-09&scenarioOverrides=%7B%7D");
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
      assert.equal(String(captured.input), "/api/superadmin/unit-economics/export.csv?month=2026-09&scenarioOverrides=%7B%7D");
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

test("all unit economics API routes use token authentication before Superadmin authorization", () => {
  const source = readFileSync(new URL("../server/unitEconomicsRoutes.ts", import.meta.url), "utf8");
  assert.equal((source.match(/isAuthenticated, requireSuperadmin/g) || []).length, 5);
  assert.doesNotMatch(source, /req\.isAuthenticated/);
  assert.match(source, /user\?\.role !== "super_admin"/);
});

test("incomplete profitability copy explains unconfirmed quote proxies without claiming a lower bound", () => {
  const source = readFileSync(new URL("../client/src/pages/super-admin/unit-economics.tsx", import.meta.url), "utf8");
  assert.match(source, /planning assumptions and quote proxies for unconfirmed vendors/);
  assert.match(source, /may overstate or understate actual costs/);
  assert.doesNotMatch(source, /lower bound/);
});


test("provider register covers configured vendors and separates priced scenarios from unconfirmed vendors", () => {
  assert.equal(unitEconomicsProviderBaseline.length, 13);
  assert.deepEqual(unitEconomicsProviderBaseline.map(({ provider }) => provider), [
    "Railway application hosting", "Railway Object Storage", "Neon PostgreSQL", "Vercel",
    "Squarespace email", "Squarespace domains", "Cloudflare DNS and proxy", "Cloudflare Workers",
    "Stripe payment processing", "Stripe Connect and payouts", "Google Maps Platform", "Mapbox Geocoding",
    "Platform notifications",
  ]);
  assert.ok(unitEconomicsProviderBaseline.every((entry) => entry.sourceUrl.startsWith("https://") && /^\d{4}-\d{2}-\d{2}$/.test(entry.researchDate)));

  const storage = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Railway Object Storage");
  assert.equal(storage?.category, "evidence_storage");
  assert.equal(storage?.billingCadence, "per_unit");
  assert.deepEqual([storage?.lowMonthlyCostCents, storage?.expectedMonthlyCostCents, storage?.highMonthlyCostCents], [75, 150, 750]);
  assert.match(storage?.launchUsageAssumptions || "", /50\/100\/500 GB-month/);
  assert.match(storage?.formula || "", /\$0\.015/);
  assert.match(storage?.notes || "", /orderly-duffel/);
  assert.equal(storage?.sourceUrl, "https://docs.railway.com/storage-buckets/billing");

  const dns = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Cloudflare DNS and proxy");
  assert.equal(dns?.expectedMonthlyCostCents, 20_000);
  assert.match(dns?.launchUsageAssumptions || "", /Pro annual \$20; expected Business annual \$200/);
  const domains = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Squarespace domains");
  assert.equal(domains?.status, "unconfirmed");
  assert.equal(domains?.billingCadence, "annual");
  assert.deepEqual([domains?.lowMonthlyCostCents, domains?.expectedMonthlyCostCents, domains?.highMonthlyCostCents], [125, 333, 833]);
  assert.equal(domains?.evidenceStatus, "account_quote_required");
  assert.match(domains?.formula || "", /annual renewal quote proxy ÷ 12/);

  const stripe = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Stripe payment processing");
  assert.equal(stripe?.amountCents, 4_500);
  assert.equal(stripe?.status, "usage_based");
  assert.equal(stripe?.separatelyCalculated, true);
  assert.match(stripe?.formula || "", /2\.9% \+ \$0\.30/);
  assert.ok(stripe?.includedInCalculation);
  assert.deepEqual([stripe?.lowMonthlyCostCents, stripe?.expectedMonthlyCostCents, stripe?.highMonthlyCostCents], [1_125, 4_500, 22_500]);

  const connect = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Stripe Connect and payouts");
  assert.deepEqual([connect?.lowMonthlyCostCents, connect?.expectedMonthlyCostCents, connect?.highMonthlyCostCents], [0, 2_500, 15_000]);
  assert.equal(connect?.evidenceStatus, "account_quote_required");
  assert.equal(connect?.includedInCalculation, true);
  assert.match(connect?.formula || "", /confirmed fee inputs are available/);
  const squarespaceEmail = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Squarespace email");
  assert.deepEqual([squarespaceEmail?.lowMonthlyCostCents, squarespaceEmail?.expectedMonthlyCostCents, squarespaceEmail?.highMonthlyCostCents], [700, 1_500, 3_000]);
  assert.equal(squarespaceEmail?.evidenceStatus, "account_quote_required");
  const mapbox = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Mapbox Geocoding");
  assert.deepEqual([mapbox?.lowMonthlyCostCents, mapbox?.expectedMonthlyCostCents, mapbox?.highMonthlyCostCents], [5_000, 25_000, 100_000]);
  assert.equal(mapbox?.usageComponents.find((component) => component.id === "geocodingRequestsThousands")?.unitRateCents, 0);

  const maps = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Google Maps Platform");
  assert.equal(maps?.amountCents, 0);
  assert.equal(maps?.status, "estimated");
  assert.match(maps?.includedUsage || "", /10,000 free billable events/);
  assert.match(maps?.launchUsageAssumptions || "", /500\/5,000\/25,000 Dynamic Maps events/);
  assert.equal(maps?.highMonthlyCostCents, 10_500);

  const cloudflareWorkers = unitEconomicsProviderBaseline.find((entry) => entry.provider === "Cloudflare Workers");
  assert.equal(cloudflareWorkers?.currentPlan, "No Worker deployment or binding found in repository; inactive/not configured");
  assert.equal(cloudflareWorkers?.highMonthlyCostCents, 840);
  assert.ok(unitEconomicsProviderBaseline.every((entry) =>
    entry.lowMonthlyCostCents != null && entry.expectedMonthlyCostCents != null && entry.highMonthlyCostCents != null &&
    entry.lowMonthlyCostCents <= entry.expectedMonthlyCostCents && entry.expectedMonthlyCostCents <= entry.highMonthlyCostCents));

  const costs = buildUnitEconomicsProviderRegister([]);
  assert.equal(costs.length, 13);
  assert.equal(calculateUnitEconomicsModeledMonthlyCosts(costs), 57_912);
  assert.equal(calculateUnitEconomicsScenarioMonthlyCost(costs), 62_412);
  assert.equal(costs.find((entry) => entry.provider === "Stripe payment processing")?.includedInCalculation, true);
  assert.equal(costs.find((entry) => entry.provider === "Stripe payment processing")?.amountCents, 4_500);
  assert.equal(costs.find((entry) => entry.provider === "Vercel")?.includedInCalculation, true);
  assert.equal(costs.find((entry) => entry.provider === "Vercel")?.highMonthlyCostCents, 19_178);
  assert.equal(costs.find((entry) => entry.provider === "Squarespace email")?.expectedMonthlyCostCents, 1_500);
  assert.equal(unitEconomicsMonthlyCostsComplete(costs), false);
  assert.deepEqual(unitEconomicsProvidersRequiringConfirmation(costs), [
    "Vercel", "Squarespace email", "Squarespace domains", "Cloudflare Workers",
    "Stripe Connect and payouts", "Mapbox Geocoding", "Platform notifications",
  ]);
  const assessment = calculateUnitEconomicsMonth({
    month: "2026-09",
    validatedLoads: 0,
    feePerValidatedLoadCents: 500,
    paymentProcessingPercent: 2.9,
    paymentProcessingFixedCents: 30,
    fixedCostsCents: calculateUnitEconomicsModeledMonthlyCosts(costs),
  });
  assert.equal(assessment.processingPerLoadCents, 45);
  assert.equal(assessment.breakEvenLoads, 128);
  assert.equal(assessment.contributionProfitCents, -57_912);
});

test("selected-month provider records replace baseline fields and all scenario amounts without double counting", () => {
  const costs = buildUnitEconomicsProviderRegister([
    { id: "recorded-railway", provider: "Railway application hosting", amountCents: 2_500, notes: "September invoice", sourceUrl: "https://example.com/invoice" },
    { id: "recorded-stripe", provider: "Stripe payment processing", amountCents: 7_500, notes: "September processing fees", sourceUrl: "https://example.com/stripe-invoice" },
  ]);
  const railway = costs.find((entry) => entry.provider === "Railway application hosting");
  assert.equal(railway?.amountCents, 2_500);
  assert.equal(railway?.status, "confirmed");
  assert.equal(railway?.notes, "September invoice");
  assert.equal(railway?.sourceUrl, "https://example.com/invoice");
  assert.equal(railway?.isRecorded, true);

  const stripe = costs.find((entry) => entry.provider === "Stripe payment processing");
  assert.equal(stripe?.amountCents, 7_500);
  assert.equal(stripe?.status, "confirmed");
  assert.equal(stripe?.notes, "September processing fees");
  assert.equal(stripe?.sourceUrl, "https://example.com/stripe-invoice");
  assert.equal(stripe?.separatelyCalculated, true);
  assert.equal(railway?.lowMonthlyCostCents, 2_500);
  assert.equal(railway?.expectedMonthlyCostCents, 2_500);
  assert.equal(railway?.highMonthlyCostCents, 2_500);
  assert.equal(calculateUnitEconomicsModeledMonthlyCosts(costs), 58_412);
  assert.equal(calculateUnitEconomicsScenarioMonthlyCost(costs), 65_912);
});

test("local scenario assumptions replace estimates but recorded monthly costs remain authoritative", () => {
  const provider = "Squarespace domains";
  const scenario = buildUnitEconomicsProviderRegister([], {
    [provider]: {
      usageInputs: {
        domainCount: { low: 2, expected: 2, high: 2 },
        annualRenewalQuoteCents: { low: 6_000, expected: 8_000, high: 12_000 },
      },
      launchUsageAssumptions: "Two domains at $60 annual renewal each.",
    },
  }).find((entry) => entry.provider === provider);
  assert.equal(scenario?.includedInCalculation, true);
  assert.equal(scenario?.evidenceStatus, "account_quote_required");
  assert.equal(scenario?.expectedMonthlyCostCents, 1_333);
  assert.deepEqual([
    scenario?.lowMonthlyCostCents, scenario?.expectedMonthlyCostCents, scenario?.highMonthlyCostCents,
  ], [1_000, 1_333, 2_000]);
  assert.equal(scenario?.launchUsageAssumptions, "Two domains at $60 annual renewal each.");

  const recorded = buildUnitEconomicsProviderRegister([
    { id: "recorded-domain", provider, amountCents: 1_250, notes: "Actual renewal", sourceUrl: "https://example.com/invoice" },
  ], { [provider]: { usageInputs: {
    domainCount: { low: 2, expected: 2, high: 2 },
    annualRenewalQuoteCents: { low: 6_000, expected: 8_000, high: 12_000 },
  } } })
    .find((entry) => entry.provider === provider);
  assert.equal(recorded?.isRecorded, true);
  assert.equal(recorded?.amountCents, 1_250);
  assert.equal(recorded?.lowMonthlyCostCents, 1_250);
  assert.equal(recorded?.expectedMonthlyCostCents, 1_250);
  assert.equal(recorded?.highMonthlyCostCents, 1_250);
  assert.equal(recorded?.notes, "Actual renewal");
});

test("formula-driven numeric usage edits recalculate low, expected, and high without editing cost outputs", () => {
  const provider = "Railway Object Storage";
  const costs = buildUnitEconomicsProviderRegister([], {
    [provider]: { usageInputs: { storedGbMonths: { low: 100, expected: 250, high: 1_000 } } },
  });

  test("quote-dependent unit-rate edits recalculate usage-based costs and retain quote-required evidence", () => {
    const mapbox = buildUnitEconomicsProviderRegister([], {
      "Mapbox Geocoding": {
        unitRatesCentsPerUnit: { geocodingRequestsThousands: 500 },
      },
    }).find((entry) => entry.provider === "Mapbox Geocoding");
    assert.deepEqual([
      mapbox?.lowMonthlyCostCents, mapbox?.expectedMonthlyCostCents, mapbox?.highMonthlyCostCents,
    ], [5_050, 25_500, 105_000]);
    assert.equal(mapbox?.usageComponents.find((component) => component.id === "geocodingRequestsThousands")?.unitRateCents, 500);
    assert.equal(mapbox?.evidenceStatus, "account_quote_required");
  });
  const storage = costs.find((entry) => entry.provider === provider);
  assert.deepEqual([
    storage?.lowMonthlyCostCents, storage?.expectedMonthlyCostCents, storage?.highMonthlyCostCents,
  ], [150, 375, 1_500]);
  assert.equal(calculateUnitEconomicsModeledMonthlyCosts(costs, "expected"), 58_137);
  assert.throws(() => calculateUnitEconomicsModeledMonthlyCosts(
    costs.map((entry) => entry.provider === provider ? { ...entry, expectedMonthlyCostCents: null } : entry),
  ), /Missing expected monthly cost for included provider Railway Object Storage/);
});

test("Stripe processing is formula-driven by charge amount and a recorded statement replaces the formula", () => {
  const formula = calculateUnitEconomicsMonth({
    month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500,
    paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 0,
    averageStripeChargeCents: 1_000,
  });
  assert.equal(formula.processingPerLoadCents, 59);
  assert.equal(formula.variableCostsCents, 5_900);
  const recorded = calculateUnitEconomicsMonth({
    month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500,
    paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 0,
    averageStripeChargeCents: 1_000, recordedStripeProcessingCents: 7_500, recordedOtherVariableCostsCents: 2_000,
  });
  assert.equal(recorded.variableCostsCents, 9_500);
  assert.equal(recorded.contributionProfitCents, 40_500);
  assert.equal(recorded.breakEvenProcessingPerLoadCents, 75);
  const breakEvenWithRecordedFees = calculateUnitEconomicsMonth({
    month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500,
    paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 50_000,
    averageStripeChargeCents: 1_000, recordedStripeProcessingCents: 7_500,
  });
  assert.equal(breakEvenWithRecordedFees.breakEvenLoads, 118);
});

test("CSV exports scenario totals and the complete plan, formula, assumption, evidence, and source breakdown", () => {
  const costs = buildUnitEconomicsProviderRegister([]);
  const fixedCostsCents = calculateUnitEconomicsModeledMonthlyCosts(costs);
  const report = {
    month: "2026-09",
    profitabilityComplete: false,
    missingProviderCount: 6,
    scenarioMonthlyCostsCents: {
      low: calculateUnitEconomicsScenarioMonthlyCost(costs, "low"),
      expected: calculateUnitEconomicsScenarioMonthlyCost(costs),
      high: calculateUnitEconomicsScenarioMonthlyCost(costs, "high"),
    },
    metrics: calculateUnitEconomicsMonth({
      month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500,
      paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents,
    }),
    costs,
  };
  const csv = buildUnitEconomicsCsv(report);
  assert.match(csv, /Expected modeled monthly provider costs \(scenario\)/);
  assert.match(csv, /Current plan \/ use evidence","Production plan\/agreement","Fixed commitment","Base monthly charge"/);
  assert.match(csv, /"Railway Object Storage"/);
  assert.match(csv, /Railway Storage Bucket, Standard tier/);
  assert.match(csv, /stored GB-month × \$0\.015/);
  assert.match(csv, /Structured monthly usage inputs \(low\/expected\/high\)/);
  assert.match(csv, /Calculated subcomponent charges \(low\/expected\/high\)/);
  assert.ok(csv.includes('amountCents"":4500'));
  assert.match(csv, /Break-even formula/);
  assert.match(csv, /existing documented \$5\.00 verified-drop assumption/);
  assert.match(csv, /"Stripe Connect and payouts"/);
  assert.match(csv, /https:\/\/stripe\.com\/connect\/pricing/);
  assert.match(csv, /2026-10-02/);
});

test("report query keys are isolated by selected reporting month", () => {
  assert.notDeepEqual(unitEconomicsReportQueryKey("2026-08"), unitEconomicsReportQueryKey("2026-09"));
  assert.notDeepEqual(unitEconomicsReportQueryKey("2026-09", { Vercel: { usageInputs: { proSeats: { expected: 2 } } } }), unitEconomicsReportQueryKey("2026-09"));
  assert.deepEqual(unitEconomicsReportQueryKey("2026-08"), ["/api/superadmin/unit-economics", "2026-08", "{}"]);
});
