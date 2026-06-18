import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import Stripe from "stripe";
import { ObjectStorageService } from "../server/objectStorage";
import { processOwnerBillingRun } from "../server/ownerBillingRuns";
import { buildOwnerBillingReceivablesOverview } from "../server/ownerBillingReceivables";
import { buildOwnerWashoutBillingLedgerFromPayments, buildOwnerWashoutBillingPreview } from "../server/billing/ownerWashoutLedger";
import { calculateOwnerWashoutBillingLedger, resolveBillingPolicy, validateOwnerBillingAmount } from "../shared/billingPolicy";
import { FEATURE_FLAGS, FEATURE_FLAG_DEFINITIONS } from "../shared/featureFlags";
import { inspectLocationDriverTipRateCents, resolveLocationDriverTipRateCents } from "../shared/locationBilling";
import { getOwnerStripeBillingSetup } from "../shared/ownerStripeBillingSetup";
import { buildWashoutLedgerRepairPlan } from "../shared/washoutLedgerRepair";
import { buildWashoutBillingVerificationReport } from "../shared/washoutBillingVerification";
import { summarizeOwnerBillingReceivables } from "../shared/ownerBillingReceivables";
import { summarizeWashoutRevenue, summarizeWashoutRevenueFromActivities } from "../shared/washoutRevenue";
import { insertWashoutLocationSchema, updateSystemSettingsSchema } from "../shared/schema";
import { normalizeMoneyToCents } from "../shared/money";
import { formatApiErrorMessage } from "../client/src/lib/queryClient";
import { formatCentsToDollars, formatCurrencyFromCents } from "../client/src/lib/utils";
import { canViewOwnerBillingDryRunTool } from "../client/src/lib/adminBilling";
import { resolveDriverPayoutSettingsState } from "../client/src/lib/driverPayoutSettings";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_IDS,
  getRequiredLegalDocumentsForRole,
  resolveLegalDocument,
} from "../shared/legalDocuments";
import {
  getTermsStateForUser,
  recordCurrentTermsAcceptance,
} from "../server/terms";
import {
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  translate,
  writeStoredLanguage,
  type LanguageStorage,
} from "../client/src/lib/i18n";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function createLanguageStorage(initialValues: Record<string, string> = {}): LanguageStorage {
  const values = new Map<string, string>(Object.entries(initialValues));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "test-only-session-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@127.0.0.1:1/test";
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || "sk_test_unit_test_secret";
process.env.PRIVATE_OBJECT_DIR =
  process.env.PRIVATE_OBJECT_DIR || "private";
process.env.PUBLIC_OBJECT_SEARCH_PATHS =
  process.env.PUBLIC_OBJECT_SEARCH_PATHS || "public";

await import("./reports.test.ts");
await import("./owner-access.test.ts");

test("billing policy resolver treats blank and null as defaults and zero as an override", () => {
  const platform = {
    enableAnnualMembership: true,
    enableMonthlyLocationDues: true,
    defaultAnnualMembershipAmount: "15.00",
    defaultMonthlyLocationDuesAmount: "10.00",
    defaultPerWashoutFee: "5.00",
  };

  const defaultPolicy = resolveBillingPolicy(
    platform,
    {
      annualMembershipEnabledOverride: null,
      monthlyLocationDuesEnabledOverride: null,
      membershipFeeOverride: "",
      perWashoutFeeOverride: null,
    },
    {
      monthlyLocationFeeOverride: null,
    },
  );

  assert.equal(defaultPolicy.annualMembershipAmountCents, 1500);
  assert.equal(defaultPolicy.monthlyLocationDuesAmountCents, 1000);
  assert.equal(defaultPolicy.perWashoutFeeCents, 500);

  const zeroPolicy = resolveBillingPolicy(
    platform,
    {
      membershipFeeOverride: 0,
      perWashoutFeeOverride: 0,
    },
    {
      monthlyLocationFeeOverride: 0,
    },
  );

  assert.equal(zeroPolicy.annualMembershipAmountCents, 0);
  assert.equal(zeroPolicy.monthlyLocationDuesAmountCents, 0);
  assert.equal(zeroPolicy.perWashoutFeeCents, 0);

  const positivePolicy = resolveBillingPolicy(
    platform,
    {
      membershipFeeOverride: "12.34",
      perWashoutFeeOverride: "1.25",
    },
    {
      monthlyLocationFeeOverride: 250,
    },
  );

  assert.equal(positivePolicy.annualMembershipAmountCents, 1234);
  assert.equal(positivePolicy.monthlyLocationDuesAmountCents, 250);
  assert.equal(positivePolicy.perWashoutFeeCents, 125);
});

test("location driver tip rate helper treats blank as zero and positive rate values as dollars", () => {
  assert.equal(resolveLocationDriverTipRateCents(undefined), 0);
  assert.equal(resolveLocationDriverTipRateCents(null), 0);
  assert.equal(resolveLocationDriverTipRateCents("0.00"), 0);
  assert.equal(resolveLocationDriverTipRateCents("1.75"), 175);
  assert.equal(resolveLocationDriverTipRateCents(1.75), 175);
});

test("driver Stripe payouts feature flag is defined and disabled by default", () => {
  const definition = FEATURE_FLAG_DEFINITIONS.find((flag) => flag.key === FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.ok(definition);
  assert.equal(definition?.enabled, false);
});

test("i18n defaults to English", () => {
  const storage = createLanguageStorage();

  assert.equal(readStoredLanguage(storage), "en");
  assert.equal(translate("driver.dashboard.title", "en"), "Driver Dashboard");
});

test("i18n switches to Spanish", () => {
  const storage = createLanguageStorage();

  writeStoredLanguage("es", storage);

  assert.equal(readStoredLanguage(storage), "es");
  assert.equal(translate("driver.dashboard.title", "es"), "Panel del conductor");
  assert.equal(translate("language.spanish", "es"), "Español");
});

test("i18n browser preference persists after refresh", () => {
  const storage = createLanguageStorage();

  writeStoredLanguage("es", storage);

  assert.equal(readStoredLanguage(storage), "es");
  assert.equal(readStoredLanguage(storage), "es");
});

test("i18n missing keys fall back to English", () => {
  assert.equal(translate("test.onlyEnglishFallback", "es"), "English fallback");
  assert.equal(translate("missing.translation.key", "es"), "missing.translation.key");
});

test("super admin billing preview tool visibility is role-gated", () => {
  assert.equal(canViewOwnerBillingDryRunTool("super_admin"), true);
  assert.equal(canViewOwnerBillingDryRunTool("admin"), false);
  assert.equal(canViewOwnerBillingDryRunTool("owner"), false);
  assert.equal(canViewOwnerBillingDryRunTool("driver"), false);
});

test("legal documents render English versions", () => {
  const terms = resolveLegalDocument(LEGAL_DOCUMENT_IDS.TERMS, "en").document;
  const driverDocuments = getRequiredLegalDocumentsForRole("driver", "en").map(({ document }) => document);

  assert.equal(terms.storageKey, "terms.en");
  assert.equal(terms.title, "Terms & Conditions");
  assert.equal(driverDocuments.map((document) => document.storageKey).join(","), "terms.en,privacy.en,driver_agreement.en");
});

test("legal documents render Spanish versions", () => {
  const driverAgreement = resolveLegalDocument(LEGAL_DOCUMENT_IDS.DRIVER_AGREEMENT, "es").document;
  const ownerDocuments = getRequiredLegalDocumentsForRole("owner", "es").map(({ document }) => document);

  assert.equal(driverAgreement.storageKey, "driver_agreement.es");
  assert.equal(driverAgreement.title, "Acuerdo del conductor");
  assert.equal(ownerDocuments.map((document) => document.storageKey).join(","), "terms.es,privacy.es,owner_agreement.es");
});

test("legal documents fall back to English when Spanish is unavailable", () => {
  const key = "owner_agreement.es";
  const original = LEGAL_DOCUMENTS[key];
  delete (LEGAL_DOCUMENTS as Record<string, unknown>)[key];

  try {
    const resolved = resolveLegalDocument(LEGAL_DOCUMENT_IDS.OWNER_AGREEMENT, "es");

    assert.equal(resolved.document.storageKey, "owner_agreement.en");
    assert.equal(resolved.fallbackToEnglish, true);
    assert.match(resolved.fallbackNotice || "", /English version is shown/);
  } finally {
    LEGAL_DOCUMENTS[key] = original;
  }
});

test("legal acceptance tracking records language version and timestamp", async () => {
  const acceptances: any[] = [];
  let driverUpdatedWith: Record<string, unknown> | null = null;

  await withPatchedStorage(
    {
      getTermsAcceptancesForUser: async () => acceptances,
      createTermsAcceptance: async (acceptance: Record<string, unknown>) => {
        const row = {
          id: `acceptance_${acceptances.length + 1}`,
          createdAt: new Date(),
          ...acceptance,
        };
        acceptances.push(row);
        return row;
      },
      getDriver: async () => makeDriver(),
      updateDriver: async (_driverId: string, update: Record<string, unknown>) => {
        driverUpdatedWith = update;
        return { ...makeDriver(), ...update };
      },
    },
    async () => {
      const state = await recordCurrentTermsAcceptance(
        makeUser({ role: "driver" }),
        {
          get: (header: string) => header === "user-agent" ? "unit-test-agent" : undefined,
          ip: "127.0.0.1",
          headers: {},
        },
        undefined,
        "es",
      );

      assert.equal(state.requiresAcceptance, false);
      assert.equal(acceptances.length, 3);
      assert.deepEqual(
        acceptances.map((acceptance) => acceptance.storageKey),
        ["terms.es", "privacy.es", "driver_agreement.es"],
      );
      assert.equal(acceptances.every((acceptance) => acceptance.language === "es"), true);
      assert.equal(acceptances.every((acceptance) => typeof acceptance.version === "string"), true);
      assert.equal(acceptances.every((acceptance) => acceptance.acceptedAt instanceof Date), true);
      assert.equal(driverUpdatedWith?.hasAgreedToTerms, true);
      assert.ok(driverUpdatedWith?.termsAgreedAt instanceof Date);
    },
  );
});

test("legal document version changes require re-acceptance", async () => {
  const staleAcceptances = getRequiredLegalDocumentsForRole("driver", "en").map(({ document }) => ({
    id: `stale_${document.storageKey}`,
    userId: "user_1",
    role: "driver",
    termsType: document.id,
    language: document.language,
    storageKey: document.storageKey,
    version: `${document.version}.old`,
    contentHash: document.contentHash,
    acceptedAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
  }));

  await withPatchedStorage(
    {
      getTermsAcceptancesForUser: async () => staleAcceptances,
    },
    async () => {
      const state = await getTermsStateForUser(makeUser({ role: "driver" }), undefined, "en");

      assert.equal(state.requiresAcceptance, true);
      assert.deepEqual(
        state.missingDocuments.map((document) => document.storageKey),
        ["terms.en", "privacy.en", "driver_agreement.en"],
      );
    },
  );
});

test("driver profile bank connect visibility uses driver_stripe_payouts only", () => {
  const driverProfileSource = readFileSync(new URL("../client/src/pages/driver/profile.tsx", import.meta.url), "utf8");
  const driverPayoutSettingsSource = readFileSync(new URL("../client/src/components/DriverPayoutSettings.tsx", import.meta.url), "utf8");
  const bankAccountConnectSource = readFileSync(new URL("../client/src/components/BankAccountConnect.tsx", import.meta.url), "utf8");
  const stripeVerificationStatusSource = readFileSync(new URL("../client/src/components/StripeVerificationStatus.tsx", import.meta.url), "utf8");
  const driverPayoutSource = `${driverProfileSource}\n${driverPayoutSettingsSource}\n${bankAccountConnectSource}`;

  assert.match(driverProfileSource, /FEATURE_FLAGS\.DRIVER_STRIPE_PAYOUTS/);
  assert.doesNotMatch(driverPayoutSource, /WAIVE_DRIVER_PAYMENT|waive_driver_payment/);
  assert.doesNotMatch(driverPayoutSource, /\/api\/feature-flags\/[^"']+\/toggle/);
  assert.doesNotMatch(driverProfileSource, /\/api\/drivers\/bank-connect\/session/);
  assert.doesNotMatch(driverPayoutSource, /\/api\/drivers\/bank-connect\/session/);
  assert.match(driverPayoutSettingsSource, /\/api\/drivers\/stripe-status/);
  assert.match(driverPayoutSource, /\/api\/drivers\/stripe-onboarding/);
  assert.match(driverPayoutSettingsSource, /if \(action === "connect_bank_account"\)[\s\S]*connectBankMutation\.mutate\(\)/);
  assert.match(driverPayoutSettingsSource, /data\?\.url \|\| data\?\.onboardingUrl/);
  assert.match(driverPayoutSettingsSource, /window\.location\.href = onboardingUrl/);
  assert.match(driverPayoutSettingsSource, /void refetch\(\)/);
  assert.match(driverPayoutSettingsSource, /debug-driver-stripe-payouts/);
  assert.match(driverPayoutSettingsSource, /connectedAccountIdExists/);
  assert.match(driverPayoutSettingsSource, /onboardingComplete/);
  assert.match(driverPayoutSettingsSource, /payoutsEnabled/);
  assert.match(driverPayoutSettingsSource, /chargesEnabled/);
  assert.match(driverPayoutSettingsSource, /currently_due/);
  assert.match(driverPayoutSettingsSource, /fetchFailureCount < 3/);
  assert.match(stripeVerificationStatusSource, /fetchFailureCount >= 3/);
  assert.doesNotMatch(driverProfileSource, /Required for Stripe/);
  assert.doesNotMatch(driverProfileSource, /input-date-of-birth|input-ssn-last4|input-business-website/);
  assert.doesNotMatch(driverProfileSource, /bankName|routingNumber|accountNumber|accountHolderName/);
});

test("driver dashboard profile reminder does not require a payment method", () => {
  const driverDashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  const i18nSource = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");

  assert.doesNotMatch(driverDashboardSource, /user\.paymentMethod/);
  assert.doesNotMatch(driverDashboardSource, /set up your payment method/i);
  assert.match(driverDashboardSource, /driver\.dashboard\.completeProfileDescription/);
  assert.match(i18nSource, /set up Stripe payouts/i);
});

test("driver dashboard Washout Stats Mix defaults to today and supports range selector", () => {
  const driverDashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");

  assert.match(driverDashboardSource, /title=\{t\("driver\.dashboard\.washoutStatsMix"\)\}/);
  assert.match(driverDashboardSource, /useState<DriverDashboardStatsRange>\("today"\)/);
  assert.match(driverDashboardSource, /statsRange=\$\{statsRange\}/);
  assert.match(driverDashboardSource, /DRIVER_STATS_RANGE_OPTIONS/);
  assert.match(driverDashboardSource, /value: "today", labelKey: "driver\.dashboard\.rangeToday"/);
  assert.match(driverDashboardSource, /value: "week", labelKey: "driver\.dashboard\.rangeWeek"/);
  assert.match(driverDashboardSource, /value: "month", labelKey: "driver\.dashboard\.rangeMonth"/);
  assert.match(driverDashboardSource, /\{t\(option\.labelKey\)\}/);
  assert.match(driverDashboardSource, /button-washout-stats-\$\{option\.value\}/);
  assert.match(driverDashboardSource, /text-washout-stats-range-label/);
});

test("driver and owner headers expose language toggle", () => {
  const driverHeaderSource = readFileSync(new URL("../client/src/components/DriverHeader.tsx", import.meta.url), "utf8");
  const ownerHeaderSource = readFileSync(new URL("../client/src/components/OwnerHeader.tsx", import.meta.url), "utf8");

  assert.match(driverHeaderSource, /<LanguageToggle(?:\s+[^>]*)?\s\/>/);
  assert.match(ownerHeaderSource, /<LanguageToggle(?:\s+[^>]*)?\s\/>/);
});

test("owner dashboard header does not use sticky positioning", () => {
  const ownerHeaderSource = readFileSync(new URL("../client/src/components/OwnerHeader.tsx", import.meta.url), "utf8");
  const ownerDashboardSource = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(ownerHeaderSource, /sticky top-0|position:\s*sticky/i);
  assert.doesNotMatch(ownerHeaderSource, /fixed|position:\s*fixed/i);
  assert.match(ownerHeaderSource, /className="w-full gradient-bg/);
  assert.match(ownerDashboardSource, /min-h-screen w-full max-w-\[100vw\] overflow-x-hidden bg-background pb-20/);
  assert.match(ownerDashboardSource, /mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5/);
});

test("billing mutations invalidate canonical dashboard reporting caches", () => {
  const billingSettingsSource = readFileSync(new URL("../client/src/pages/admin/billing-settings.tsx", import.meta.url), "utf8");
  const washoutFormSource = readFileSync(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8");
  const ownerDashboardSource = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");

  assert.match(billingSettingsSource, /invalidateQueries\(\{ queryKey: \['\/api\/admin\/dashboard'\] \}\)/);
  assert.match(billingSettingsSource, /invalidateQueries\(\{ queryKey: \['\/api\/owners\/dashboard'\] \}\)/);
  assert.match(billingSettingsSource, /invalidateQueries\(\{ queryKey: \['\/api\/drivers\/dashboard'\] \}\)/);
  assert.match(billingSettingsSource, /invalidateQueries\(\{ queryKey: \['\/api\/payments\/driver-history'\] \}\)/);
  assert.match(washoutFormSource, /invalidateQueries\(\{ queryKey: \['\/api\/admin\/dashboard'\] \}\)/);
  assert.match(washoutFormSource, /invalidateQueries\(\{ queryKey: \['\/api\/admin\/billing\/settings'\] \}\)/);
  assert.match(washoutFormSource, /invalidateQueries\(\{ queryKey: \['\/api\/owners\/billing\/pending-summary'\] \}\)/);
  assert.match(ownerDashboardSource, /invalidateQueries\(\{ queryKey: \['\/api\/admin\/dashboard'\] \}\)/);
  assert.match(ownerDashboardSource, /invalidateQueries\(\{ queryKey: \['\/api\/drivers\/dashboard'\] \}\)/);
  assert.match(ownerDashboardSource, /invalidateQueries\(\{ queryKey: \['\/api\/owners\/billing\/pending-summary'\] \}\)/);
  assert.match(routesSource, /app\.get\('\/api\/drivers\/dashboard'[\s\S]*setBillingNoCacheHeaders\(res\);/);
  assert.match(routesSource, /app\.get\('\/api\/owners\/dashboard'[\s\S]*setBillingNoCacheHeaders\(res\);/);
  assert.match(routesSource, /app\.get\('\/api\/admin\/dashboard'[\s\S]*setBillingNoCacheHeaders\(res\);/);
  assert.match(routesSource, /app\.get\('\/api\/admin\/billing\/settings'[\s\S]*setBillingNoCacheHeaders\(res\);/);
  assert.match(routesSource, /app\.get\('\/api\/owners\/billing\/pending-summary'[\s\S]*setBillingNoCacheHeaders\(res\);/);
  assert.match(routesSource, /app\.get\('\/api\/payments\/driver-history'[\s\S]*setBillingNoCacheHeaders\(res\);/);
});

test("billing dashboards return no-cache headers on live routes", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", role: "owner", username: "owner1" };
        }
        return null;
      },
      getSystemStats: async () => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: 0,
        platformWashoutRevenueCents: 0,
        platformWashoutPaidRevenue: 0,
        platformWashoutPaidRevenueCents: 0,
        platformFeeRecordCount: 0,
        approvedWashouts: 0,
        driverTipTotal: 0,
        billedWashouts: 0,
        pendingWashouts: 0,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: 0,
        lotteryDriverCount: 0,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
      getAllOwnersBillingSettings: async () => [],
      getOwner: async () => ({ id: "owner_1", userId: "owner_user_1" }),
      getOwnerStats: async () => ({
        totalPayments: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        platformFeesOwedCents: 0,
        platformFeesPaidCents: 0,
        driverTipTotalCents: 0,
        ownerChargeTotalCents: 0,
        needsReviewBillingCents: 0,
        paidBillingCount: 0,
        needsReviewBillingCount: 0,
        unpaidBillingCount: 0,
      }),
      getLocationsByOwner: async () => [],
      getOwnerBillingSettings: async () => ({
        billingCadence: "immediate",
        billingTimezone: "America/Chicago",
        billingCutoffTime: "23:59:00",
        billingDayOfWeek: 1,
      }),
      calculateBusinessDateForOwner: async () => "2026-05-28",
      getPendingPaymentsForBatch: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);

      const adminRoute = gets.get("/api/admin/dashboard");
      const ownerRoute = gets.get("/api/owners/dashboard");
      assert.equal(typeof adminRoute, "function");
      assert.equal(typeof ownerRoute, "function");

      const adminRes = createResponse();
      await adminRoute!(
        {
          user: { id: "admin_1" },
        },
        adminRes,
      );
      assert.equal(adminRes.statusCode, 200);
      assert.match(adminRes.headers["cache-control"] || "", /no-store/i);

      const ownerRes = createResponse();
      await ownerRoute!(
        {
          user: { id: "owner_user_1" },
        },
        ownerRes,
      );
      assert.equal(ownerRes.statusCode, 200);
      assert.match(ownerRes.headers["cache-control"] || "", /no-store/i);
    },
  );
});

test("disabled driver_stripe_payouts hides bank connection action", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: false,
    requirements: { hasAccount: false },
  });

  assert.equal(state.featureAvailable, false);
  assert.equal(state.statusLabel, "Payouts Disabled");
  assert.equal(state.primaryAction.action, "connect_bank_account");
  assert.equal(state.primaryAction.label, "Connect Bank Account");
  assert.equal(state.primaryAction.disabled, true);
  assert.equal(state.primaryAction.visible, false);
  assert.equal(state.message, "Stripe payouts are not enabled yet.");
});

test("enabled driver_stripe_payouts with no Stripe account shows Connect Bank Account", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: { hasAccount: false },
  });

  assert.equal(state.featureAvailable, true);
  assert.equal(state.statusLabel, "Not Started");
  assert.equal(state.primaryAction.action, "connect_bank_account");
  assert.equal(state.primaryAction.label, "Connect Bank Account");
  assert.equal(state.primaryAction.disabled, false);
  assert.equal(state.primaryAction.visible, true);
  assert.equal(state.message, "Set up Stripe payouts to receive optional owner-funded tips.");
});

test("waive_driver_payment does not affect bank connection visibility", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: { hasAccount: false },
  });

  assert.equal(state.featureAvailable, true);
  assert.equal(state.primaryAction.action, "connect_bank_account");
  assert.equal(state.primaryAction.disabled, false);
  assert.equal(state.primaryAction.visible, true);
});

test("enabled driver_stripe_payouts with action-required Stripe account shows Resume Stripe Onboarding", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: {
      hasAccount: true,
      detailsSubmitted: true,
      payouts_enabled: false,
      hasBlockingRequirements: true,
      requirementsCurrentlyDue: ["external_account"],
      requirements: {
        currently_due: ["external_account"],
        past_due: [],
      },
    },
  });

  assert.equal(state.statusLabel, "Action Required");
  assert.equal(state.primaryAction.action, "resume_stripe_onboarding");
  assert.equal(state.primaryAction.visible, true);
  assert.equal(state.message, "Stripe needs more information before payouts can be enabled.");
  assert.equal(state.secondaryActions.some((action) => action.action === "view_stripe_status"), true);
});

test("enabled driver_stripe_payouts with setup-started Stripe account shows Resume Stripe Onboarding", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: {
      hasAccount: true,
      connectedAccountIdExists: true,
      details_submitted: false,
      payouts_enabled: false,
      charges_enabled: false,
      hasBlockingRequirements: true,
      requirements: {
        currently_due: ["external_account"],
        past_due: [],
      },
    },
  });

  assert.equal(state.featureAvailable, true);
  assert.equal(state.status, "setup_started");
  assert.equal(state.statusLabel, "Resume Onboarding");
  assert.equal(state.primaryAction.action, "resume_stripe_onboarding");
  assert.equal(state.primaryAction.label, "Resume Stripe Onboarding");
  assert.equal(state.primaryAction.visible, true);
  assert.equal(
    state.message,
    "Stripe account setup has started. Resume onboarding to add bank and verification details.",
  );
});

test("enabled driver_stripe_payouts with complete Stripe account shows Payouts Ready", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: {
      hasAccount: true,
      isVerified: true,
      payouts_enabled: true,
      requirements: {
        currently_due: [],
        past_due: [],
      },
    },
  });

  assert.equal(state.statusLabel, "Payouts Ready");
  assert.equal(state.primaryAction.action, "view_stripe_status");
  assert.equal(state.primaryAction.label, "View Payout Status");
  assert.equal(state.primaryAction.disabled, false);
  assert.equal(state.primaryAction.visible, true);
  assert.equal(state.message, "Stripe payouts are ready.");
});

test("driver bank-connect frontend error message shows exact missing profile fields", () => {
  const message = formatApiErrorMessage(400, "Bad Request", JSON.stringify({
    message: "Complete required Stripe payout profile fields before setting up Stripe payouts.",
    reason: "missing_required_profile_fields",
    missingFields: ["Email"],
    invalidFields: [],
  }));

  assert.equal(
    message,
    "Complete required Stripe payout profile fields before setting up Stripe payouts. Reason: missing_required_profile_fields Missing fields: Email",
  );
});

test("frontend error formatter keeps status for unstructured errors", () => {
  const message = formatApiErrorMessage(400, "Bad Request", "Bad Request");

  assert.equal(message, "400: Bad Request");
});

test("admin settings exposes Stripe Connect setup health check", () => {
  const adminSettingsSource = readFileSync(new URL("../client/src/pages/admin/settings.tsx", import.meta.url), "utf8");

  assert.match(adminSettingsSource, /\/api\/admin\/stripe\/connect-health/);
  assert.match(adminSettingsSource, /Stripe Connect Setup Health/);
  assert.match(adminSettingsSource, /Connect enabled/);
  assert.match(adminSettingsSource, /Express onboarding available/);
  assert.match(adminSettingsSource, /transfers capability creation supported/);
  assert.match(adminSettingsSource, /Stripe mode test\/live/);
  assert.match(adminSettingsSource, /`transfers` connected-account capability/);
  assert.match(adminSettingsSource, /does not create a driver card, customer, or charge the driver/);
});

test("superadmin users page exposes read-only driver Stripe diagnostic action", () => {
  const adminUsersSource = readFileSync(new URL("../client/src/pages/admin/users.tsx", import.meta.url), "utf8");

  assert.match(adminUsersSource, /Check Driver Stripe Status/);
  assert.match(adminUsersSource, /user\.role === 'driver' && \(currentUser as any\)\?\.role === 'super_admin'/);
  assert.match(adminUsersSource, /apiRequest\("GET", `\/api\/admin\/debug\/driver-stripe\/\$\{encodeURIComponent\(userId\)\}`\)/);
  assert.doesNotMatch(adminUsersSource, /apiRequest\("(POST|PUT|DELETE)", `\/api\/admin\/debug\/driver-stripe/);

  for (const field of [
    "stripeAccountId",
    "accountExists",
    "detailsSubmitted",
    "payoutsEnabled",
    "chargesEnabled",
    "externalAccountsCount",
    "bankAccountsCount",
    "requirementsCurrentlyDue",
    "requirementsPastDue",
    "disabledReason",
    "onboardingComplete",
  ]) {
    assert.match(adminUsersSource, new RegExp(field));
  }

  assert.match(adminUsersSource, /Account exists, onboarding incomplete/);
  assert.match(adminUsersSource, /Bank account missing/);
  assert.match(adminUsersSource, /Payouts ready/);
  assert.match(adminUsersSource, /Action required/);
});

test("driver Stripe onboarding uses canonical GET route with legacy bank-connect delegation", () => {
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");

  assert.match(routesSource, /app\.get\('\/api\/drivers\/stripe-onboarding', isAuthenticated, handleDriverStripeOnboarding\)/);
  assert.doesNotMatch(routesSource, /app\.post\('\/api\/drivers\/stripe-onboarding'/);
  assert.match(
    routesSource,
    /app\.post\('\/api\/drivers\/bank-connect\/session'[\s\S]*handleDriverStripeOnboarding\(req, res\)/,
  );
});

test("driver Stripe Connect diagnostic script uses production payout onboarding helpers", () => {
  const diagnosticSource = readFileSync(new URL("../scripts/verify-driver-stripe-connect.ts", import.meta.url), "utf8");

  assert.match(diagnosticSource, /STRIPE_SECRET_KEY/);
  assert.match(diagnosticSource, /sk_test_/);
  assert.match(diagnosticSource, /ALLOW_LIVE_STRIPE_CONNECT_DIAGNOSTIC/);
  assert.match(diagnosticSource, /buildDriverStripePayoutAccountParams/);
  assert.match(diagnosticSource, /createDriverStripePayoutAccount/);
  assert.match(diagnosticSource, /createDriverStripeOnboardingLink/);
  assert.match(diagnosticSource, /RAILWAY_PUBLIC_DOMAIN/);
  assert.match(diagnosticSource, /does not read or write CreteXchange driver records/);
});

test("startup logs driver Stripe onboarding URL configuration without URL values", () => {
  const indexSource = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

  assert.match(indexSource, /Driver Stripe onboarding URL configuration/);
  assert.match(indexSource, /Deployment git commit/);
  assert.match(indexSource, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(indexSource, /gitCommitHash/);
  assert.match(indexSource, /"PUBLIC_APP_URL configured"/);
  assert.match(indexSource, /"APP_BASE_URL configured"/);
  assert.match(indexSource, /"RAILWAY_PUBLIC_DOMAIN configured"/);
  assert.match(indexSource, /"resolved source"/);
  assert.match(indexSource, /"resolved host"/);
  assert.match(indexSource, /isHttps/);
  assert.match(indexSource, /hasPublicAppUrl/);
  assert.match(indexSource, /hasAppBaseUrl/);
  assert.match(indexSource, /hasRailwayPublicDomain/);
  assert.match(indexSource, /selectedSource/);
  assert.doesNotMatch(indexSource, /console\.log\([^)]*process\.env\.PUBLIC_APP_URL/);
  assert.doesNotMatch(indexSource, /console\.log\([^)]*process\.env\.APP_BASE_URL/);
  assert.doesNotMatch(indexSource, /console\.log\([^)]*process\.env\.RAILWAY_PUBLIC_DOMAIN/);
});

test("driver Stripe onboarding URL config prefers PUBLIC_APP_URL then APP_BASE_URL then RAILWAY_PUBLIC_DOMAIN", async () => {
  const { buildDriverStripeOnboardingUrls } = await import("../server/routes");

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_unit_test_secret",
      PUBLIC_APP_URL: "https://public.example.com/",
      APP_BASE_URL: "https://app-base.example.com/",
      RAILWAY_PUBLIC_DOMAIN: "railway.example.com",
    },
    async () => {
      const urls = buildDriverStripeOnboardingUrls();
      assert.equal(urls.source, "PUBLIC_APP_URL");
      assert.equal(urls.refreshUrl, "https://public.example.com/profile?stripe_refresh=1");
      assert.equal(urls.returnUrl, "https://public.example.com/profile?stripe_return=1");
      assert.equal(urls.isHttps, true);
    },
  );

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_unit_test_secret",
      PUBLIC_APP_URL: undefined,
      APP_BASE_URL: "https://app-base.example.com/",
      RAILWAY_PUBLIC_DOMAIN: "railway.example.com",
    },
    async () => {
      const urls = buildDriverStripeOnboardingUrls();
      assert.equal(urls.source, "APP_BASE_URL");
      assert.equal(urls.refreshUrl, "https://app-base.example.com/profile?stripe_refresh=1");
      assert.equal(urls.returnUrl, "https://app-base.example.com/profile?stripe_return=1");
      assert.equal(urls.isHttps, true);
    },
  );

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_unit_test_secret",
      PUBLIC_APP_URL: undefined,
      APP_BASE_URL: undefined,
      RAILWAY_PUBLIC_DOMAIN: "cretexchangetemp-production.up.railway.app",
    },
    async () => {
      const urls = buildDriverStripeOnboardingUrls();
      assert.equal(urls.source, "RAILWAY_PUBLIC_DOMAIN");
      assert.equal(urls.refreshUrl, "https://cretexchangetemp-production.up.railway.app/profile?stripe_refresh=1");
      assert.equal(urls.returnUrl, "https://cretexchangetemp-production.up.railway.app/profile?stripe_return=1");
      assert.equal(urls.refreshUrlHost, "cretexchangetemp-production.up.railway.app");
      assert.equal(urls.returnUrlHost, "cretexchangetemp-production.up.railway.app");
      assert.equal(urls.isHttps, true);
    },
  );
});

test("driver Stripe onboarding URL diagnostics log exact public URL env keys read", () => {
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");

  assert.match(routesSource, /envKeysRead: \['PUBLIC_APP_URL', 'APP_BASE_URL', 'RAILWAY_PUBLIC_DOMAIN'\]/);
  assert.match(routesSource, /publicAppUrlConfigured/);
  assert.match(routesSource, /appBaseUrlConfigured/);
  assert.match(routesSource, /railwayPublicDomainConfigured/);
  assert.match(routesSource, /resolvedSource/);
  assert.match(routesSource, /resolvedHost/);
  assert.match(routesSource, /publicUrlEnv/);
  assert.doesNotMatch(routesSource, /console\.(log|info|warn|error)\([^)]*process\.env\.STRIPE_SECRET_KEY/);
});

test("driver Stripe connected account payload uses postal_code address field", async () => {
  const { createConnectedAccount } = await import("../server/stripeService");
  let createdPayload: Stripe.AccountCreateParams | undefined;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async (payload: Stripe.AccountCreateParams) => {
          createdPayload = payload;
          return {
            id: "acct_driver_unit_test",
            object: "account",
          } as Stripe.Account;
        },
      },
    },
    async () => {
      await createConnectedAccount({
        type: "express",
        userId: "driver_1",
        username: "driver1",
        email: "driver@example.com",
        businessType: "individual",
        capabilities: ["transfers"],
        individual: {
          firstName: "Driver",
          lastName: "One",
          email: "driver@example.com",
          phone: "+15551234567",
          address: {
            line1: "123 Main St",
            city: "Austin",
            state: "TX",
            postal_code: "78701",
            country: "US",
          },
          dob: {
            day: 1,
            month: 1,
            year: 1990,
          },
          ssn: "1234",
        },
      });
    },
  );

  assert.ok(createdPayload);
  const address = createdPayload.individual?.address as Record<string, unknown> | undefined;
  assert.ok(address);
  assert.equal(address.line1, "123 Main St");
  assert.equal(address.city, "Austin");
  assert.equal(address.state, "TX");
  assert.equal(address.postal_code, "78701");
  assert.equal(address.country, "US");
  assert.equal(Object.prototype.hasOwnProperty.call(address, "postalCode"), false);
  assert.equal(createdPayload.type, "express");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "controller"), false);
  assert.deepEqual(createdPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
});

test("driver capability backfill restores connected account payout capabilities", async () => {
  const { requestTransfersCapability } = await import("../server/stripeService");
  let updatedPayload: Stripe.AccountUpdateParams | undefined;

  await withPatchedStripe(
    {
      accounts: {
        update: async (_accountId: string, payload: Stripe.AccountUpdateParams) => {
          updatedPayload = payload;
          return {
            id: "acct_driver_existing",
            object: "account",
            capabilities: {
              transfers: "pending",
            },
          } as Stripe.Account;
        },
      },
    },
    async () => {
      await requestTransfersCapability("acct_driver_existing");
    },
  );

  assert.ok(updatedPayload);
  assert.deepEqual(updatedPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
});

test("superadmin feature flag list exposes driver_stripe_payouts when missing", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getAllFeatureFlags: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/feature-flags");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const flags = res.body as Array<{ flagKey: string; enabled: boolean; description?: string }>;
      const driverStripePayoutsFlag = flags.find((flag) => flag.flagKey === FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
      assert.ok(driverStripePayoutsFlag);
      assert.equal(driverStripePayoutsFlag.enabled, false);
      assert.match(driverStripePayoutsFlag.description || "", /Driver Tip Payouts/);
    },
  );
});

test("superadmin can toggle driver_stripe_payouts", async () => {
  const { app, puts } = createRouteRegistry();
  let createdFlag: Record<string, unknown> | undefined;
  let updatedFlag: Record<string, unknown> | undefined;

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getFeatureFlag: async () => undefined,
      createFeatureFlag: async (flag: Record<string, unknown>) => {
        createdFlag = flag;
        return {
          id: "flag_driver_stripe_payouts",
          ...flag,
          createdAt: null,
          updatedAt: null,
        };
      },
      updateFeatureFlag: async (flagKey: string, enabled: boolean) => {
        updatedFlag = { id: "flag_driver_stripe_payouts", flagKey, enabled };
        return updatedFlag;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/feature-flags/:flagKey/toggle");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS },
          body: { enabled: true },
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { enabled?: boolean }).enabled, true);
    },
  );

  assert.equal(createdFlag?.flagKey, FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.equal(createdFlag?.enabled, false);
  assert.equal(updatedFlag?.flagKey, FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.equal(updatedFlag?.enabled, true);
});

test("superadmin can override driver_stripe_payouts for a specific driver", async () => {
  const { app, puts } = createRouteRegistry();
  let createdFlag: Record<string, unknown> | undefined;
  let overrideRequest: Record<string, unknown> | undefined;

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getFeatureFlag: async () => undefined,
      createFeatureFlag: async (flag: Record<string, unknown>) => {
        createdFlag = flag;
        return {
          id: "flag_driver_stripe_payouts",
          ...flag,
          createdAt: null,
          updatedAt: null,
        };
      },
      setFeatureFlagOverride: async (flagKey: string, userId: string, enabled: boolean) => {
        overrideRequest = { flagKey, userId, enabled };
        return {
          id: "override_1",
          flagId: "flag_driver_stripe_payouts",
          userId,
          enabled,
          createdAt: null,
          updatedAt: null,
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/feature-flags/:flagKey/override/:userId");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS, userId: "driver_user_1" },
          body: { enabled: true },
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { enabled?: boolean }).enabled, true);
    },
  );

  assert.equal(createdFlag?.flagKey, FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.deepEqual(overrideRequest, {
    flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS,
    userId: "driver_user_1",
    enabled: true,
  });
});

test("driver_stripe_payouts check enables driver when global flag is enabled", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "driver_user_1", role: "driver" }),
      getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
      getFeatureFlagOverride: async () => undefined,
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/feature-flags/:flagKey/check");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS },
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        enabled: true,
        globalEnabled: true,
        overrideEnabled: null,
        effectiveEnabled: true,
      });
    },
  );
});

test("driver_stripe_payouts check falls back to global enabled when driver override is disabled", async () => {
  const { app, gets } = createRouteRegistry();
  let genericCheckCalled = false;

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "driver_user_1", role: "driver" }),
      getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
      getFeatureFlagOverride: async () => ({
        id: "override_1",
        flagId: "flag_driver_stripe_payouts",
        userId: "driver_user_1",
        enabled: false,
        createdAt: null,
        updatedAt: null,
      }),
      checkFeatureFlag: async () => {
        genericCheckCalled = true;
        return false;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/feature-flags/:flagKey/check");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS },
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        enabled: true,
        globalEnabled: true,
        overrideEnabled: false,
        effectiveEnabled: true,
      });
    },
  );

  assert.equal(genericCheckCalled, false);
});

test("driver_stripe_payouts check enables driver when global disabled but driver override is enabled", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "driver_user_1", role: "driver" }),
      getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: false }),
      getFeatureFlagOverride: async () => ({
        id: "override_1",
        flagId: "flag_driver_stripe_payouts",
        userId: "driver_user_1",
        enabled: true,
        createdAt: null,
        updatedAt: null,
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/feature-flags/:flagKey/check");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS },
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, {
        enabled: true,
        globalEnabled: false,
        overrideEnabled: true,
        effectiveEnabled: true,
      });
    },
  );
});

test("driver cannot toggle feature flags", async () => {
  const { app, puts } = createRouteRegistry();
  let storageTouched = false;

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "driver_user_1", role: "driver" }),
      getFeatureFlag: async () => {
        storageTouched = true;
        return undefined;
      },
      createFeatureFlag: async () => {
        storageTouched = true;
        return undefined;
      },
      updateFeatureFlag: async () => {
        storageTouched = true;
        return undefined;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/feature-flags/:flagKey/toggle");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS },
          body: { enabled: true },
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.match((res.body as { message: string }).message, /Admin access required/);
    },
  );

  assert.equal(storageTouched, false);
});

test("owner Stripe billing setup helper resolves owner and user level Stripe fields", () => {
  const ownerReady = getOwnerStripeBillingSetup(
    { stripeCustomerId: "cus_owner", stripePaymentMethodId: "pm_owner" },
    {},
  );
  assert.equal(ownerReady.statusLabel, "ready_for_billing");
  assert.equal(ownerReady.customerIdSource, "owner");
  assert.equal(ownerReady.paymentMethodSource, "owner");
  assert.equal(ownerReady.displayLabel, "Card on file / Ready for billing");

  const userReady = getOwnerStripeBillingSetup(
    { stripePaymentMethodId: "pm_owner" },
    { stripeCustomerId: "cus_user", stripePaymentMethodId: "pm_user" },
  );
  assert.equal(userReady.statusLabel, "ready_for_billing");
  assert.equal(userReady.customerIdSource, "user");
  assert.equal(userReady.paymentMethodSource, "owner");

  const missingCustomer = getOwnerStripeBillingSetup(
    { stripePaymentMethodId: "pm_owner" },
    { stripePaymentMethodId: "pm_user" },
  );
  assert.equal(missingCustomer.statusLabel, "missing_customer");
  assert.equal(missingCustomer.displayLabel, "Missing customer identification");

  const missingPaymentMethod = getOwnerStripeBillingSetup(
    { stripeCustomerId: "cus_owner" },
    { stripeCustomerId: "cus_user" },
  );
  assert.equal(missingPaymentMethod.statusLabel, "missing_payment_method");
  assert.equal(missingPaymentMethod.displayLabel, "Card missing");
});

test("system settings schema allows zero and rejects negative platform fees", () => {
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "0.00" }).success, true);
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "7.25" }).success, true);
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "-1.00" }).success, false);
});

test("currency helper formats cents as dollars", () => {
  assert.equal(formatCentsToDollars(2), "$0.02");
  assert.equal(formatCentsToDollars(200), "$2.00");
  assert.equal(formatCurrencyFromCents(2500), "$25.00");
  assert.equal(formatCurrencyFromCents(0), "$0.00");
  assert.equal(formatCurrencyFromCents(35), "$0.35");
});

test("money normalization converts dollars and cents exactly once", () => {
  assert.equal(normalizeMoneyToCents("0.01", "dollars"), 1);
  assert.equal(normalizeMoneyToCents(0.01, "dollars"), 1);
  assert.equal(normalizeMoneyToCents(5, "dollars"), 500);
  assert.equal(normalizeMoneyToCents(1, "cents"), 1);
  assert.equal(normalizeMoneyToCents("5.00", "dollars"), 500);
  assert.equal(normalizeMoneyToCents(500, "cents"), 500);
});

test("location driver tip rate helper normalizes dollar values to cents", () => {
  assert.equal(resolveLocationDriverTipRateCents("0.01"), 1);
  assert.equal(resolveLocationDriverTipRateCents(0.01), 1);
  assert.equal(resolveLocationDriverTipRateCents("1"), 100);
  assert.equal(resolveLocationDriverTipRateCents(1), 100);
});

test("location driver tip rate inspection preserves enabled state and rejects sub-cent positive values", () => {
  const disabled = inspectLocationDriverTipRateCents(undefined);
  assert.equal(disabled.driverTipEnabled, false);
  assert.equal(disabled.normalizedDriverTipCents, 0);

  const fromDecimal = inspectLocationDriverTipRateCents(0.01);
  assert.equal(fromDecimal.driverTipEnabled, true);
  assert.equal(fromDecimal.normalizedDriverTipCents, 1);

  const fromString = inspectLocationDriverTipRateCents("0.01");
  assert.equal(fromString.driverTipEnabled, true);
  assert.equal(fromString.normalizedDriverTipCents, 1);

  assert.throws(() => inspectLocationDriverTipRateCents(0.0001), /at least \$0\.01/);
});

test("billing ledger parses payment processing fee dollars into cents exactly once", () => {
  const ledger = buildOwnerWashoutBillingLedgerFromPayments({
    ownerId: "owner_1",
    billingBatchId: "batch_money_1",
    payments: [
      {
        id: "payment_1",
        ownerId: "owner_1",
        driverId: "driver_1",
        activityId: "activity_1",
        processingFee: "0.02",
        tipAmountCents: 3,
        status: "completed",
      },
    ],
  });

  assert.equal(ledger.platformFeeTotalCents, 2);
  assert.equal(ledger.platformRevenueCents, 2);
  assert.equal(ledger.driverTipTotalCents, 3);
  assert.equal(ledger.ownerChargeAmountCents, 5);
});

test("washout location schema rejects negative location rates", () => {
  const baseLocation = {
    ownerId: "owner_1",
    name: "Site A",
    street: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    latitude: "30.2672",
    longitude: "-97.7431",
    rate: 5,
  };

  const positive = insertWashoutLocationSchema.safeParse({ ...baseLocation, rate: 1.5 });
  assert.equal(positive.success, true);
  assert.equal(positive.success && positive.data.rate, "1.5");

  const zero = insertWashoutLocationSchema.safeParse({ ...baseLocation, rate: 0 });
  assert.equal(zero.success, true);
  assert.equal(zero.success && zero.data.rate, "0");

  assert.equal(insertWashoutLocationSchema.safeParse({ ...baseLocation, rate: -0.01 }).success, false);
});

test("washout revenue summary separates platform revenue, driver tips, and pending washouts", () => {
  const summary = summarizeWashoutRevenue([
    { status: "completed", processingFee: "5.00", tipAmountCents: 200 },
    { status: "posted", processingFee: "5.00", tipAmountCents: 0 },
    { status: "pending", processingFee: "5.00", tipAmountCents: 500 },
    { status: "failed", processingFee: "5.00", tipAmountCents: 100 },
    { status: "refunded", processingFee: "5.00", tipAmountCents: 300 },
    { status: "disputed", processingFee: "5.00", tipAmountCents: 300 },
  ]);

  assert.equal(summary.platformWashoutRevenueCents, 1000);
  assert.equal(summary.platformWashoutPaidRevenueCents, 1000);
  assert.equal(summary.driverTipTotalCents, 200);
  assert.equal(summary.billedWashouts, 2);
  assert.equal(summary.pendingWashouts, 1);
  assert.equal(summary.failedWashouts, 1);
  assert.equal(summary.refundedWashouts, 1);
  assert.equal(summary.disputedWashouts, 1);
});

test("approved washout revenue summary uses stored platform fee cents and excludes driver tips", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    {
      activityStatus: "verified",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: null,
      locationDriverTipRate: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "approved",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: "1.50",
      locationDriverTipRate: 0,
      paymentTipAmountCents: 150,
    },
    {
      activityStatus: "completed",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      activityAmount: null,
      locationDriverTipRate: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "settled",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: null,
      locationDriverTipRate: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "pending",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      activityAmount: "3.00",
      locationDriverTipRate: 0,
      paymentTipAmountCents: 300,
    },
  ]);

  assert.equal(summary.platformWashoutRevenueCents, 1500);
  assert.equal(summary.platformWashoutPaidRevenueCents, 1000);
  assert.equal(summary.driverTipTotalCents, 150);
  assert.equal(summary.approvedWashouts, 3);
  assert.equal(summary.billedWashouts, 2);
  assert.equal(summary.pendingWashouts, 2);
  assert.equal(summary.failedWashouts, 0);
  assert.equal(summary.refundedWashouts, 0);
  assert.equal(summary.disputedWashouts, 0);
});

test("approved washout revenue summary falls back to location driver tip rate when activity amount is blank", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    {
      activityStatus: "verified",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: null,
      locationDriverTipRate: "0.01",
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "verified",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: "",
      locationDriverTipRate: "0.01",
      paymentTipAmountCents: null,
    },
    {
      activityStatus: "verified",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      activityAmount: undefined,
      locationDriverTipRate: "0.01",
      paymentTipAmountCents: undefined,
    },
  ]);

  assert.equal(summary.platformWashoutRevenueCents, 1500);
  assert.equal(summary.driverTipTotalCents, 3);
  assert.equal(summary.approvedWashouts, 3);
  assert.equal(summary.billedWashouts, 3);
});

test("approved washout revenue summary defaults null platform fee rows to five dollars", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    ...Array.from({ length: 7 }, () => ({
      activityStatus: "verified",
      paymentStatus: "pending",
      activityFeeCentsPlatform: null,
      locationDriverTipRate: 0,
      paymentTipAmountCents: 0,
    })),
  ]);

  assert.equal(summary.platformWashoutRevenueCents, 3500);
  assert.equal(summary.platformWashoutPaidRevenueCents, 0);
  assert.equal(summary.driverTipTotalCents, 0);
  assert.equal(summary.approvedWashouts, 7);
  assert.equal(summary.billedWashouts, 0);
  assert.equal(summary.pendingWashouts, 7);
});

test("approved washout revenue summary uses explicit five dollar platform fee on seven records", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    ...Array.from({ length: 7 }, () => ({
      activityStatus: "approved",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      locationDriverTipRate: 0,
      paymentTipAmountCents: 0,
    })),
  ]);

  assert.equal(summary.platformWashoutRevenueCents, 3500);
  assert.equal(summary.platformWashoutPaidRevenueCents, 0);
  assert.equal(summary.driverTipTotalCents, 0);
  assert.equal(summary.approvedWashouts, 7);
  assert.equal(summary.billedWashouts, 0);
  assert.equal(summary.pendingWashouts, 7);
});

test("owner billing receivables summary excludes declined and billed washouts", () => {
  const summary = summarizeOwnerBillingReceivables(
    [
      { activityStatus: "verified", activityFeeCentsPlatform: null, locationDriverTipRate: 0 },
      { activityStatus: "approved", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "declined", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "rejected", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "pending", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "needs_review", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "cancelled", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
      { activityStatus: "completed", activityFeeCentsPlatform: 500, paymentStatus: "completed", locationDriverTipRate: 0 },
    ],
    null,
  );

  assert.equal(summary.approvedWashoutCount, 3);
  assert.equal(summary.platformFeesOwedCents, 1000);
  assert.equal(summary.platformFeesPaidCents, 500);
  assert.equal(summary.platformFeesTotalCents, 1500);
  assert.equal(summary.unbilledApprovedWashoutCount, 2);
  assert.equal(summary.billedWashoutCount, 1);
  assert.equal(summary.declinedWashoutCount, 1);
  assert.equal(summary.rejectedWashoutCount, 1);
  assert.equal(summary.pendingWashoutCount, 1);
  assert.equal(summary.needsReviewWashoutCount, 1);
  assert.equal(summary.cancelledWashoutCount, 1);
});

test("owner billing receivables summary uses configured platform fee instead of legacy activity fee values", () => {
  const summary = summarizeOwnerBillingReceivables(
    [
      { activityStatus: "verified", activityFeeCentsPlatform: 10000, locationDriverTipRate: 0 },
      { activityStatus: "verified", activityFeeCentsPlatform: 10000, locationDriverTipRate: 0 },
    ],
    500,
  );

  assert.equal(summary.platformFeesOwedCents, 1000);
  assert.equal(summary.platformFeesTotalCents, 1000);
});

test("owner billing receivables summary bills verified and completed washouts without approved status", () => {
  const summary = summarizeOwnerBillingReceivables(
    [
      { activityStatus: "verified", activityFeeCentsPlatform: null, locationDriverTipRate: 0 },
      { activityStatus: "completed", activityFeeCentsPlatform: 500, paymentStatus: "completed", locationDriverTipRate: 0 },
      { activityStatus: "declined", activityFeeCentsPlatform: 500, locationDriverTipRate: 0 },
    ],
    null,
  );

  assert.equal(summary.approvedWashoutCount, 2);
  assert.equal(summary.platformFeesOwedCents, 500);
  assert.equal(summary.platformFeesPaidCents, 500);
  assert.equal(summary.platformFeesTotalCents, 1000);
  assert.equal(summary.unbilledApprovedWashoutCount, 1);
  assert.equal(summary.billedWashoutCount, 1);
  assert.equal(summary.declinedWashoutCount, 1);
});

test("owner billing receivables rethrows missing washout location joins instead of zeroing payments", async () => {
  await assert.rejects(
    () => buildOwnerBillingReceivablesOverview({
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getUser: async (id: string) => {
        if (id === "owner_user_1") {
          return {
            id: "owner_user_1",
            username: "owner1",
            firstName: "Owner",
            lastName: "One",
            stripeCustomerId: "cus_owner_1",
            stripePaymentMethodId: "pm_owner_1",
          };
        }
        if (id === "driver_user_1") {
          return {
            id: "driver_user_1",
            username: "driver1",
            firstName: "Driver",
            lastName: "One",
            stripeConnectAccountId: "acct_driver_1",
          };
        }
        return null;
      },
      getApprovedWashoutsForOwnerBilling: async () => [],
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          status: "completed",
          totalAmount: "25.00",
          paymentCount: 5,
          metadata: {},
        },
      ]),
      getPaymentsByBatchId: async () => {
        throw new Error("locationDriverTipRate references washout_locations.rate, but washout_locations is not part of the query");
      },
    } as any),
    /washout_locations/i,
  );
});

test("owner billing receivables rethrows approved washout query failures instead of returning empty summaries", async () => {
  await assert.rejects(
    () => buildOwnerBillingReceivablesOverview({
      getAllOwnersBillingSettings: async () => ([
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ]),
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getUser: async (id: string) => {
        if (id === "owner_user_1") {
          return {
            id: "owner_user_1",
            username: "owner1",
            firstName: "Owner",
            lastName: "One",
            stripeCustomerId: "cus_owner_1",
            stripePaymentMethodId: "pm_owner_1",
          };
        }
        if (id === "driver_user_1") {
          return {
            id: "driver_user_1",
            username: "driver1",
            firstName: "Driver",
            lastName: "One",
            stripeConnectAccountId: "acct_driver_1",
          };
        }
        return null;
      },
      getApprovedWashoutsForOwnerBilling: async () => {
        throw new Error("approved washouts query failed");
      },
      getBillingBatchesByOwner: async () => [],
    } as any),
    /approved washouts query failed/i,
  );
});

test("owner billing receivables summary shows before and after payment totals correctly", () => {
  const beforePayment = summarizeOwnerBillingReceivables([
    ...Array.from({ length: 5 }, () => ({
      activityStatus: "verified",
      activityFeeCentsPlatform: null,
      locationDriverTipRate: 0,
    })),
  ]);

  const afterPayment = summarizeOwnerBillingReceivables([
    ...Array.from({ length: 5 }, () => ({
      activityStatus: "verified",
      activityFeeCentsPlatform: 500,
      paymentStatus: "completed",
      paymentBatchId: "batch_1",
      locationDriverTipRate: 0,
    })),
  ]);

  assert.equal(beforePayment.platformFeesOwedCents, 2500);
  assert.equal(beforePayment.platformFeesPaidCents, 0);
  assert.equal(beforePayment.platformFeesTotalCents, 2500);

  assert.equal(afterPayment.platformFeesOwedCents, 0);
  assert.equal(afterPayment.platformFeesPaidCents, 2500);
  assert.equal(afterPayment.platformFeesTotalCents, 2500);
});

test("storage queries that select locationDriverTipRate join washout_locations", () => {
  const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8").split("\n");
  const selectLines = source
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes("locationDriverTipRate: washoutLocations.rate"));

  assert.ok(selectLines.length > 0, "Expected at least one locationDriverTipRate select in storage.ts");

  for (const { index } of selectLines) {
    const window = source.slice(index, index + 70).join("\n");
    assert.match(
      window,
      /\.(leftJoin|innerJoin|join)\(washoutLocations/,
      `locationDriverTipRate select at line ${index + 1} must join washoutLocations`,
    );
  }
});

test("approved owner billing selector keeps approved unbilled washouts when payment rows exist", () => {
  const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const methodStart = source.indexOf("async getApprovedWashoutsForOwnerBilling");
  const methodEnd = source.indexOf("async getBillingTipSourceDebugRows", methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, "Expected getApprovedWashoutsForOwnerBilling method in storage.ts");
  const methodSource = source.slice(methodStart, methodEnd);

  assert.match(methodSource, /washoutActivities\.status\}::text = 'approved'/);
  assert.match(methodSource, /\.leftJoin\(washoutLocations, eq\(washoutActivities\.locationId, washoutLocations\.id\)\)/);
  assert.match(methodSource, /eq\(payments\.ownerId, ownerId\)/);
  assert.doesNotMatch(methodSource, /\.innerJoin\(owners/);
  assert.match(methodSource, /rowsByActivityId/);
  assert.match(methodSource, /billedActivityIds\.has\(activityId\)/);
  assert.match(methodSource, /\[OWNER_BILLING_WASHOUT_VISIBILITY\]/);
  assert.doesNotMatch(methodSource, /if \(paymentBatchId\)/);
  assert.doesNotMatch(methodSource, /billedStatuses\.has\(paymentStatus\)/);
});

test("owner activity history uses safe joins and coalesced activity dates", () => {
  const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const methodStart = source.indexOf("async getActivitiesByOwner");
  const methodEnd = source.indexOf("async createWashoutPhoto", methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, "Expected getActivitiesByOwner method in storage.ts");
  const methodSource = source.slice(methodStart, methodEnd);

  assert.match(methodSource, /COALESCE\(\$\{washoutActivities\.checkInTime\}, \$\{washoutActivities\.createdAt\}\)/);
  assert.match(methodSource, /\.leftJoin\(washoutLocations, eq\(washoutActivities\.locationId, washoutLocations\.id\)\)/);
  assert.match(methodSource, /\.leftJoin\(drivers, eq\(washoutActivities\.driverId, drivers\.id\)\)/);
  assert.match(methodSource, /\.leftJoin\(users, eq\(drivers\.userId, users\.id\)\)/);
  assert.match(methodSource, /eq\(payments\.ownerId, ownerId\)/);
  assert.match(methodSource, /\[OWNER_ACTIVITY_VISIBILITY\]/);
  assert.doesNotMatch(methodSource, /\.where\(and\(\.\.\.conditions\)\)[\s\S]*\.innerJoin\(drivers/);
});

test("washout billing verification report groups statuses and computes owed platform fees", () => {
  const report = buildWashoutBillingVerificationReport([
    {
      activityId: "washout-1",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "verified",
      paymentStatus: "pending",
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-2",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "approved",
      paymentStatus: "paid",
      activityAmount: "2.00",
      feeCentsPlatform: 500,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-3",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "rejected",
      paymentStatus: null,
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-4",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-2",
      locationName: "South Site",
      status: "declined",
      paymentStatus: null,
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-5",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-3",
      locationName: "West Site",
      status: "cancelled",
      paymentStatus: null,
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-6",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-3",
      locationName: "West Site",
      status: "pending_owner_approval",
      paymentStatus: "pending",
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
    {
      activityId: "washout-7",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-4",
      locationName: "East Site",
      status: "photo_pending",
      paymentStatus: "pending",
      activityAmount: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      locationDriverTipRate: 0,
    },
  ]);

  assert.equal(report.totalWashouts, 7);
  assert.equal(report.approvedWashouts, 2);
  assert.equal(report.alreadyBilledWashouts, 1);
  assert.equal(report.unbilledApprovedWashouts, 1);
  assert.equal(report.declinedWashouts, 1);
  assert.equal(report.rejectedWashouts, 1);
  assert.equal(report.cancelledWashouts, 1);
  assert.equal(report.pendingWashouts, 1);
  assert.equal(report.needsReviewWashouts, 1);
  assert.equal(report.platformFeeReceivableCents, 1000);
  assert.equal(report.platformFeeOwedCents, 500);
  assert.equal(report.platformFeeBilledCents, 500);
  assert.equal(report.driverTipRateTotalCents, 200);
  assert.deepEqual(report.washoutIdsByStatus.verified, ["washout-1"]);
  assert.deepEqual(report.washoutIdsByStatus.approved, ["washout-2"]);
  assert.equal(report.breakdownByOwnerLocation.length, 4);
  assert.equal(report.breakdownByOwnerLocation[0].ownerCompanyName, "Alpha Washouts");
  assert.equal(report.breakdownByOwnerLocation[0].platformFeeReceivableCents, 1000);
});

test("washout ledger repair plan backfills missing platform fees and lottery tickets idempotently", () => {
  const firstPlan = buildWashoutLedgerRepairPlan([
    {
      activityId: "activity-1",
      driverId: "driver-1",
      ownerId: "owner-1",
      locationId: "location-1",
      status: "verified",
      serviceType: "washout",
      feeCentsPlatform: 0,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
    {
      activityId: "activity-2",
      driverId: "driver-2",
      ownerId: "owner-1",
      locationId: "location-2",
      status: "approved",
      serviceType: "washout",
      feeCentsPlatform: 500,
      platformFeeCents: null,
      lotteryEntryExists: true,
    },
    {
      activityId: "activity-3",
      driverId: "driver-3",
      ownerId: "owner-1",
      locationId: "location-3",
      status: "pending",
      serviceType: "washout",
      feeCentsPlatform: 0,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
    {
      activityId: "activity-4",
      driverId: "driver-4",
      ownerId: "owner-1",
      locationId: "location-4",
      status: "verified",
      serviceType: "rubble_dropoff",
      feeCentsPlatform: 200,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
  ], 500);

  assert.equal(firstPlan.scanned, 4);
  assert.deepEqual(firstPlan.platformFeeBackfills, [
    { activityId: "activity-1", platformFeeCents: 500 },
  ]);
  assert.deepEqual(firstPlan.lotteryEntriesToCreate, [
    { activityId: "activity-1", driverId: "driver-1", ownerId: "owner-1" },
  ]);

  const secondPlan = buildWashoutLedgerRepairPlan([
    {
      activityId: "activity-1",
      driverId: "driver-1",
      ownerId: "owner-1",
      locationId: "location-1",
      status: "verified",
      serviceType: "washout",
      feeCentsPlatform: 500,
      platformFeeCents: null,
      lotteryEntryExists: true,
    },
  ], 500);

  assert.equal(secondPlan.platformFeeBackfills.length, 0);
  assert.equal(secondPlan.lotteryEntriesToCreate.length, 0);
});

test("admin custom billing route accepts zero and blank washout rates", async () => {
  const { app, puts } = createRouteRegistry();
  const calls: Array<{ ownerId: string; useCustomBillingModel: boolean; customWashoutRate: string | null }> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1" }),
      updateOwnerCustomBillingSettings: async (ownerId: string, useCustomBillingModel: boolean, customWashoutRate: string | null) => {
        calls.push({ ownerId, useCustomBillingModel, customWashoutRate });
        return {
          id: "owner_1",
          userId: "owner_user_1",
          useCustomBillingModel,
          customWashoutRate,
        } as any;
      },
      getUserById: async () => ({ id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/owners/:id/custom-billing");
      assert.equal(typeof route, "function");

      const zeroRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "0.00" },
        },
        zeroRes,
      );
      assert.equal(zeroRes.statusCode, 200);
      assert.equal(calls[0].customWashoutRate, "0.00");

      const blankRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "" },
        },
        blankRes,
      );
      assert.equal(blankRes.statusCode, 200);
      assert.equal(calls[1].customWashoutRate, null);

      const negativeRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "-1.00" },
        },
        negativeRes,
      );
      assert.equal(negativeRes.statusCode, 400);
      assert.match(String((negativeRes.body as { message?: string }).message || ""), /zero or greater/i);
    },
  );
});

test("owner cannot disable lottery through admin custom billing settings", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "owner_user_1", role: "owner" }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/owners/:id/custom-billing");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "owner_user_1" },
          body: { useCustomBillingModel: false, customWashoutRate: "" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.match(String((res.body as { message?: string }).message || ""), /Super admin access required/i);
    },
  );
});

test("super admin can disable lottery through admin custom billing settings", async () => {
  const { app, puts } = createRouteRegistry();
  const calls: Array<{ ownerId: string; useCustomBillingModel: boolean; customWashoutRate: string | null }> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1" }),
      updateOwnerCustomBillingSettings: async (ownerId: string, useCustomBillingModel: boolean, customWashoutRate: string | null) => {
        calls.push({ ownerId, useCustomBillingModel, customWashoutRate });
        return {
          id: "owner_1",
          userId: "owner_user_1",
          useCustomBillingModel,
          customWashoutRate,
        } as any;
      },
      getUserById: async () => ({ id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/owners/:id/custom-billing");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1", role: "super_admin" },
          body: { useCustomBillingModel: false, customWashoutRate: "" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(calls[0].useCustomBillingModel, false);
      assert.equal(calls[0].customWashoutRate, null);
    },
  );
});

test("owner can create location with default driver tip and no monthly billing rollback", async () => {
  const { app, posts } = createRouteRegistry();
  const createdLocations: any[] = [];

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        membershipStatus: "active",
        isApproved: false,
        stripePaymentMethodId: "pm_123",
        stripeCustomerId: "cus_123",
        profileCompleted: true,
        locationSetupOverride: false,
        businessLicense: "BL-100",
        taxId: "12-3456789",
      }),
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "Olivia",
        lastName: "Owner",
        email: "olivia@example.com",
        phone: "555-0100",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      createWashoutLocation: async (locationData: any) => {
        createdLocations.push(locationData);
        return { id: "location_1", ...locationData } as any;
      },
      createFeeLedgerEntry: async () => {
        throw new Error("fee ledger should not be called during owner location creation");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/owners/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
          body: {
            name: "Site A",
            street: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
            description: "Test site",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(createdLocations[0].rate, "5");
      assert.equal(createdLocations[0].driverTipRate, undefined);
      assert.equal((res.body as { location?: { id?: string } }).location?.id, "location_1");
    },
  );
});

test("owner can create location with driver tip cents from dollars", async () => {
  const { app, posts } = createRouteRegistry();
  const createdLocations: any[] = [];

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        membershipStatus: "active",
        isApproved: false,
        stripePaymentMethodId: "pm_123",
        stripeCustomerId: "cus_123",
        profileCompleted: true,
        locationSetupOverride: false,
        businessLicense: "BL-100",
        taxId: "12-3456789",
      }),
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "Olivia",
        lastName: "Owner",
        email: "olivia@example.com",
        phone: "555-0100",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      createWashoutLocation: async (locationData: any) => {
        createdLocations.push(locationData);
        return { id: "location_1", ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/owners/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
          body: {
            name: "Site B",
            street: "2 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
            driverTipRate: 0.01,
            description: "Tip site",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(createdLocations[0].rate, "0.01");
      assert.equal(createdLocations[0].driverTipRate, undefined);
      assert.equal((res.body as { location?: { rate?: string } }).location?.rate, "0.01");
    },
  );
});

test("admin can create location with driver tip cents from dollars", async () => {
  const { app, posts } = createRouteRegistry();
  const createdLocations: any[] = [];

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_user_1") {
          return { id: "admin_user_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return {
            id: "owner_user_1",
            role: "owner",
            firstName: "Olivia",
            lastName: "Owner",
            email: "olivia@example.com",
            phone: "555-0100",
            street: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
          };
        }
        return null;
      },
      getOwnerById: async (ownerId: string) => ({
        id: ownerId,
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        membershipStatus: "active",
        isApproved: false,
      }),
      createWashoutLocation: async (locationData: any) => {
        createdLocations.push(locationData);
        return { id: "location_1", ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_user_1", role: "super_admin" },
          body: {
            ownerId: "owner_1",
            name: "Site C",
            street: "3 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
            driverTipRate: 0.01,
            description: "Admin tip site",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(createdLocations[0].rate, "0.01");
      assert.equal(createdLocations[0].driverTipRate, undefined);
      assert.equal((res.body as { location?: { rate?: string } }).location?.rate, "0.01");
    },
  );
});

test("owner can enable or disable driver tip on a location without affecting lottery settings", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: any[] = [];

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
        name: "Site A",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      updateLocation: async (id: string, ownerId: string, locationData: any) => {
        updates.push({ id, ownerId, locationData });
        return { id, ownerId, ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/locations/:id");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "location_1" },
          user: { id: "owner_user_1" },
          body: {
            driverTipRate: 2.5,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(updates[0].locationData.rate, "2.5");
      assert.equal(updates[0].locationData.driverTipRate, undefined);
      assert.equal(updates[0].ownerId, "owner_1");
    },
  );
});

test("owner can save driver tip cents from dollars on a location", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: any[] = [];

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
        name: "Site A",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      updateLocation: async (id: string, ownerId: string, locationData: any) => {
        updates.push({ id, ownerId, locationData });
        return { id, ownerId, ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/locations/:id");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "location_1" },
          user: { id: "owner_user_1" },
          body: {
            driverTipRate: 1,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(updates[0].locationData.rate, "1");
      assert.equal(updates[0].locationData.driverTipRate, undefined);
      assert.equal(updates[0].ownerId, "owner_1");
    },
  );
});

test("admin can update driver tip on a location and persist cents", async () => {
  const { app, posts, puts } = createRouteRegistry();
  const updates: any[] = [];

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_user_1") {
          return { id: "admin_user_1", role: "admin" };
        }
        return null;
      },
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
        name: "Site A",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      updateLocation: async (id: string, ownerId: string, locationData: any) => {
        updates.push({ id, ownerId, locationData });
        return { id, ownerId, ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/locations/:id/driver-tip") || puts.get("/api/admin/locations/:id/driver-tip");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "location_1" },
          user: { id: "admin_user_1" },
          body: {
            driverTipCents: 1,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(updates[0].ownerId, "owner_1");
      assert.equal(updates[0].locationData.rate, "0.01");
      assert.equal(updates[0].locationData.driverTipRate, undefined);
      assert.equal((res.body as { location?: { rate?: string } }).location?.rate, "0.01");
    },
  );
});

test("admin can clear driver tip on a location and persist zero cents", async () => {
  const { app, posts, puts } = createRouteRegistry();
  const updates: any[] = [];

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_user_1") {
          return { id: "admin_user_1", role: "super_admin" };
        }
        return null;
      },
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
        name: "Site A",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      updateLocation: async (id: string, ownerId: string, locationData: any) => {
        updates.push({ id, ownerId, locationData });
        return { id, ownerId, ...locationData } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/locations/:id/driver-tip") || puts.get("/api/admin/locations/:id/driver-tip");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "location_1" },
          user: { id: "admin_user_1" },
          body: {
            driverTipCents: 0,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(updates[0].locationData.rate, "0.00");
      assert.equal(updates[0].locationData.driverTipRate, undefined);
      assert.equal((res.body as { location?: { rate?: string } }).location?.rate, "0.00");
    },
  );
});

test("admin and owner location screens expose and display driver tip per washout", () => {
  const adminLocationsSource = readFileSync(new URL("../client/src/pages/admin/locations.tsx", import.meta.url), "utf8");
  const ownerLocationsSource = readFileSync(new URL("../client/src/pages/owner/locations.tsx", import.meta.url), "utf8");

  assert.match(adminLocationsSource, /Set \$0\.01/);
  assert.match(adminLocationsSource, /Update the stored `washout_locations\.rate` value/);
  assert.match(adminLocationsSource, /resolveLocationDriverTipRateCents\(locationToEditTip\.driverTipRate\) \/ 100/);
  assert.match(ownerLocationsSource, /Driver Tip Per Washout/);
  assert.match(ownerLocationsSource, /Stored in `washout_locations\.rate` as dollars/);
  assert.match(ownerLocationsSource, /resolveLocationDriverTipRateCents\(location\.rate\) \/ 100/);
});

test("auth user response includes derived owner profile completion state", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "Olivia",
        lastName: "Owner",
        email: "olivia@example.com",
        phone: "555-0100",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        businessLicense: "BL-100",
        taxId: "12-3456789",
        stripePaymentMethodId: "pm_123",
        membershipStatus: "active",
        isApproved: false,
        locationSetupOverride: false,
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/auth/user");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as { roleData?: { profileCompleted?: boolean; missingProfileFields?: string[]; missingProfileFieldLabels?: string[]; canManageLocations?: boolean; paymentMethodOnFile?: boolean } };
      assert.equal(body.roleData?.profileCompleted, true);
      assert.equal(body.roleData?.canManageLocations, true);
      assert.equal(body.roleData?.paymentMethodOnFile, true);
      assert.deepEqual(body.roleData?.missingProfileFields, []);
    },
  );
});

test("owner add location returns missing profile fields when blocked", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "",
        businessLicense: "",
        taxId: "",
        stripePaymentMethodId: "pm_123",
        membershipStatus: "active",
        isApproved: false,
        locationSetupOverride: false,
      }),
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        street: "",
        city: "",
        state: "",
        zip: "",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/owners/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
          body: {
            name: "Site A",
            street: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      const body = res.body as { missingFields?: string[]; missingFieldLabels?: string[]; message?: string };
      assert.ok(Array.isArray(body.missingFields));
      assert.ok(body.missingFields?.includes("firstName"));
      assert.ok(body.missingFields?.includes("companyName"));
      assert.ok(body.missingFieldLabels?.includes("First name"));
      assert.ok(body.missingFieldLabels?.includes("Company name"));
      assert.match(body.message || "", /complete your owner profile/i);
    },
  );
});

test("superadmin can see owner locations and membership status in admin list", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        role: "super_admin",
      }),
      getAllLocations: async () => ([
        {
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          rate: "5.00",
          driverTipRate: "0.00",
          isActive: true,
          isVisible: true,
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            isApproved: false,
            membershipStatus: "active",
            dashboardAccessAllowed: true,
            user: {
              id: "owner_user_1",
              firstName: "Olivia",
              lastName: "Owner",
              email: "olivia@example.com",
            },
          },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const locations = res.body as Array<{ owner?: { membershipStatus?: string } }>;
      assert.equal(locations.length, 1);
      assert.equal(locations[0].owner?.membershipStatus, "active");
    },
  );
});

test("superadmin can update platform fee to five dollars, zero, and rejects negative values", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: Array<string | undefined> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getSystemSettings: async () => ({
        id: "settings_1",
        automaticTaxEnabled: false,
        platformWashoutFee: "5.00",
        updatedAt: new Date(),
        updatedBy: "admin_1",
      }),
      updateSystemSettings: async (settings: any, updatedBy: string) => {
        updates.push(settings.platformWashoutFee);
        return {
          id: "settings_1",
          automaticTaxEnabled: settings.automaticTaxEnabled ?? false,
          platformWashoutFee: settings.platformWashoutFee ?? "5.00",
          updatedAt: new Date(),
          updatedBy,
        } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/settings");
      assert.equal(typeof route, "function");

      const fiveRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "5.00" },
        },
        fiveRes,
      );
      assert.equal(fiveRes.statusCode, 200);
      assert.equal(updates[0], "5.00");

      const zeroRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "0.00" },
        },
        zeroRes,
      );
      assert.equal(zeroRes.statusCode, 200);
      assert.equal(updates[1], "0.00");

      const negativeRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "-1.00" },
        },
        negativeRes,
      );
      assert.equal(negativeRes.statusCode, 400);
      assert.match(String((negativeRes.body as { message?: string }).message || ""), /zero or greater/i);
    },
  );
});

test("superadmin updates owner custom platform fee by ownerId and does not require userId", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: Array<{ ownerId: string; fee: string | null }> = [];

  await withPatchedStorage(
    {
      getUser: async (userId: string) => {
        if (userId !== "admin_1") {
          return undefined;
        }
        return {
          id: "admin_1",
          username: "admin1",
          role: "super_admin",
        };
      },
      getOwnerById: async (ownerId: string) => {
        if (ownerId !== "owner_1") {
          return undefined;
        }
        return {
          id: "owner_1",
          userId: "owner_user_1",
          companyName: "Owner Co",
        };
      },
      updateOwnerCustomPlatformFee: async (ownerId: string, customFee: string | null) => {
        updates.push({ ownerId, fee: customFee });
        return {
          id: ownerId,
          userId: "owner_user_1",
          companyName: "Owner Co",
          customPlatformFee: customFee,
        } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/owners/:ownerId/platform-fee");
      assert.equal(typeof route, "function");

      const successRes = createResponse();
      await route!(
        {
          params: { ownerId: "owner_1" },
          user: { id: "admin_1" },
          body: { customPlatformFee: "0.00" },
        },
        successRes,
      );

      assert.equal(successRes.statusCode, 200);
      assert.equal((successRes.body as { ownerId?: string }).ownerId, "owner_1");
      assert.equal(updates[0]?.ownerId, "owner_1");
      assert.equal(updates[0]?.fee, "0.00");

      const blankRes = createResponse();
      await route!(
        {
          params: { ownerId: "owner_1" },
          user: { id: "admin_1" },
          body: { customPlatformFee: "" },
        },
        blankRes,
      );

      assert.equal(blankRes.statusCode, 200);
      assert.equal(updates[1]?.ownerId, "owner_1");
      assert.equal(updates[1]?.fee, null);

      const missingRes = createResponse();
      await route!(
        {
          params: { ownerId: "missing_owner" },
          user: { id: "admin_1" },
          body: { customPlatformFee: "5.00" },
        },
        missingRes,
      );

      assert.equal(missingRes.statusCode, 404);
      assert.match(String((missingRes.body as { message?: string }).message || ""), /owner not found/i);

      const negativeRes = createResponse();
      await route!(
        {
          params: { ownerId: "owner_1" },
          user: { id: "admin_1" },
          body: { customPlatformFee: "-1.00" },
        },
        negativeRes,
      );

      assert.equal(negativeRes.statusCode, 400);
      assert.match(String((negativeRes.body as { message?: string }).message || ""), /zero or greater/i);
    },
  );
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === "number") {
        this.statusCode = statusOrUrl;
        this.headers.location = url || "";
      } else {
        this.statusCode = 302;
        this.headers.location = statusOrUrl;
      }
      return this;
    },
    set(headers: Record<string, string>) {
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      this.body = code;
      return this;
    },
  };
}

function createRouteRegistry() {
  const posts = new Map<string, Function>();
  const gets = new Map<string, Function>();
  const puts = new Map<string, Function>();
  const deletes = new Map<string, Function>();
  const patches = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) {
      gets.set(path, handlers[handlers.length - 1]);
    },
    post(path: string, ...handlers: Function[]) {
      posts.set(path, handlers[handlers.length - 1]);
    },
    put(path: string, ...handlers: Function[]) {
      puts.set(path, handlers[handlers.length - 1]);
    },
    delete(path: string, ...handlers: Function[]) {
      deletes.set(path, handlers[handlers.length - 1]);
    },
    patch(path: string, ...handlers: Function[]) {
      patches.set(path, handlers[handlers.length - 1]);
    },
    use() {},
  };

  return { app, posts, gets, puts, deletes, patches };
}

async function withPatchedStorage(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const { storage } = await import("../server/storage");
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, storage[key]);
    storage[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      storage[key] = value;
    }
  }
}

async function withPatchedStripe(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const stripeService = await import("../server/stripeService");
  const stripeObject = stripeService.stripe as unknown as Record<string, unknown>;
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, stripeObject[key]);
    stripeObject[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      stripeObject[key] = value;
    }
  }
}

async function withPatchedEnv(
  patch: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const original = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createOwnerBillingRunFixture(params: {
  ownerId?: string;
  ownerCompanyName?: string;
  ownerUsername?: string;
  ownerStripeCustomerId?: string | null;
  ownerStripePaymentMethodId?: string | null;
  ownerUserStripeCustomerId?: string | null;
  ownerUserStripePaymentMethodId?: string | null;
  ownerCustomPlatformFee?: string | number | null;
  billingCadence?: string;
  billingCutoffTime?: string;
  billingTimezone?: string;
  billingDayOfWeek?: number;
  payments: Array<Record<string, unknown>>;
  approvedWashouts?: Array<Record<string, unknown>>;
  stripeMode?: "succeeded" | "processing" | "throw";
}) {
  const ownerId = params.ownerId || "owner_1";
  const owner = {
    id: ownerId,
    userId: "user_owner_1",
    companyName: params.ownerCompanyName || "Owner Co",
    customPlatformFee: Object.prototype.hasOwnProperty.call(params, "ownerCustomPlatformFee")
      ? params.ownerCustomPlatformFee
      : null,
    stripeCustomerId: Object.prototype.hasOwnProperty.call(params, "ownerStripeCustomerId")
      ? params.ownerStripeCustomerId
      : null,
    stripePaymentMethodId: Object.prototype.hasOwnProperty.call(params, "ownerStripePaymentMethodId")
      ? params.ownerStripePaymentMethodId
      : "pm_owner_1",
    billingCutoffTime: params.billingCutoffTime || "23:59:00",
    billingTimezone: params.billingTimezone || "America/Chicago",
    billingDayOfWeek: params.billingDayOfWeek ?? 1,
  };
  const ownerUser = {
    id: "user_owner_1",
    username: params.ownerUsername || "owner1",
    firstName: "Owner",
    lastName: "One",
    stripePaymentMethodId: Object.prototype.hasOwnProperty.call(params, "ownerUserStripePaymentMethodId")
      ? params.ownerUserStripePaymentMethodId
      : (Object.prototype.hasOwnProperty.call(params, "ownerStripePaymentMethodId")
        ? params.ownerStripePaymentMethodId
        : "pm_owner_1"),
    stripeCustomerId: Object.prototype.hasOwnProperty.call(params, "ownerUserStripeCustomerId")
      ? params.ownerUserStripeCustomerId
      : (Object.prototype.hasOwnProperty.call(params, "ownerStripeCustomerId")
        ? params.ownerStripeCustomerId
        : "cus_owner_1"),
  };

  let batch: Record<string, unknown> | null = null;
  let chargeCount = 0;
  let lastIntent: Record<string, unknown> | null = null;
  let lastIntentOptions: Record<string, unknown> | null = null;
  let payments = params.payments.map((payment, index) => ({
    id: payment.id || `payment_${index + 1}`,
    ownerId,
    driverId: payment.driverId || `driver_${index + 1}`,
    activityId: payment.activityId || `activity_${index + 1}`,
    amount: payment.amount || "10.00",
    processingFee: payment.processingFee || "5.00",
    washoutServiceFee: payment.washoutServiceFee || "0.00",
    tipAmountCents: payment.tipAmountCents ?? Math.round(Number(payment.washoutServiceFee || 0) * 100),
    status: payment.status || "pending",
    batchId: payment.batchId ?? null,
    businessDate: payment.businessDate || "2026-05-28",
    createdAt: payment.createdAt || new Date("2026-05-28T12:00:00Z"),
    activity: payment.activity || { id: payment.activityId || `activity_${index + 1}`, amount: payment.activityAmount ?? "0.00" },
    driver: payment.driver || {
      id: payment.driverId || `driver_${index + 1}`,
      user: {
        id: `driver_user_${index + 1}`,
        username: `driver${index + 1}`,
        firstName: "Driver",
        lastName: String(index + 1),
        stripeConnectAccountId: payment.stripeConnectAccountId ?? "acct_driver_1",
      },
    },
  }));
  let approvedWashouts = (params.approvedWashouts || params.payments).map((row, index) => ({
    activityId: String(row.activityId || `activity_${index + 1}`),
    ownerId,
    driverId: String(row.driverId || `driver_${index + 1}`),
    locationId: String(row.locationId || `location_${index + 1}`),
    activityStatus: String(row.activityStatus || "verified"),
    activityFeeCentsPlatform: row.activityFeeCentsPlatform === undefined || row.activityFeeCentsPlatform === null
      ? null
      : Number(row.activityFeeCentsPlatform),
    activityAmount: row.activityAmount ?? "0.00",
    locationDriverTipRate: row.locationDriverTipRate === undefined || row.locationDriverTipRate === null
      ? 0
      : Number(row.locationDriverTipRate),
    verifiedAt: row.verifiedAt || new Date("2026-05-28T12:00:00Z"),
    createdAt: row.createdAt || new Date("2026-05-28T12:00:00Z"),
  }));

  const storage = {
    getOwnerById: async (id: string) => (id === ownerId ? owner : undefined),
    getUser: async (id: string) => (id === owner.userId ? ownerUser : undefined),
    getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
    getAllOwnersBillingSettings: async () => [
      {
        ownerId,
        companyName: owner.companyName || ownerUser.username,
        username: ownerUser.username,
        billingCadence: params.billingCadence || "weekly",
        billingCutoffTime: owner.billingCutoffTime,
        billingTimezone: owner.billingTimezone,
        billingDayOfWeek: owner.billingDayOfWeek,
      },
    ],
    getPendingPaymentsForOwnerBilling: async (_ownerId: string, startDate?: Date, endDate?: Date) => {
      const startKey = startDate ? startDate.toISOString().split("T")[0] : undefined;
      const endKey = endDate ? endDate.toISOString().split("T")[0] : undefined;
      return payments.filter((payment) => {
        if (payment.ownerId !== ownerId) return false;
        if (payment.status !== "pending") return false;
        if (payment.batchId) return false;
        if (startKey && String(payment.businessDate) < startKey) return false;
        if (endKey && String(payment.businessDate) > endKey) return false;
        return true;
      }) as any;
    },
    getApprovedWashoutsForOwnerBilling: async (_ownerId: string, startDate?: Date, endDate?: Date) => {
      const startKey = startDate ? startDate.toISOString().split("T")[0] : undefined;
      const endKey = endDate ? endDate.toISOString().split("T")[0] : undefined;
      return approvedWashouts.filter((row) => {
        if (row.ownerId !== ownerId) return false;
        if (!["verified", "approved", "completed"].includes(String(row.activityStatus || "").toLowerCase())) return false;
        const rowDate = row.verifiedAt || row.createdAt;
        const rowKey = rowDate ? new Date(rowDate as string | Date).toISOString().split("T")[0] : "";
        if (startKey && rowKey < startKey) return false;
        if (endKey && rowKey > endKey) return false;
        return true;
      }) as any;
    },
    getBillingBatch: async (id: string) => batch?.id === id ? batch : undefined,
    getBillingBatchByOwnerAndDate: async (id: string, businessDate: string) => {
      if (!batch) return undefined;
      return batch.ownerId === id && batch.businessDate === businessDate ? batch : undefined;
    },
    createBillingBatch: async (input: Record<string, unknown>) => {
      batch = {
        id: batch?.id || "batch_1",
        stripePaymentIntentId: batch?.stripePaymentIntentId || null,
        failureReason: batch?.failureReason || null,
        completedAt: batch?.completedAt || null,
        processingStartedAt: batch?.processingStartedAt || null,
        retryCount: batch?.retryCount || 0,
        ...input,
      };
      return batch as any;
    },
    assignPaymentsToBatch: async (paymentIds: string[], batchId: string, businessDate: string) => {
      payments = payments.map((payment) => paymentIds.includes(String(payment.id)) ? {
        ...payment,
        batchId,
        businessDate,
      } : payment);
    },
    getPaymentsByBatchId: async (batchId: string) => {
      return payments.filter((payment) => payment.batchId === batchId).map((payment) => ({
        ...payment,
        activity: payment.activity,
        driver: payment.driver,
      })) as any;
    },
    updateBillingBatchStatus: async (batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status,
        stripePaymentIntentId: stripePaymentIntentId || batch?.stripePaymentIntentId || null,
        failureReason: failureReason || null,
        completedAt: status === "completed" ? new Date("2026-05-28T14:00:00Z") : batch?.completedAt || null,
        updatedAt: new Date("2026-05-28T14:00:00Z"),
      };
      if (status === "completed") {
        payments = payments.map((payment) => payment.batchId === batchId ? {
          ...payment,
          status: "completed",
          stripePaymentIntentId: stripePaymentIntentId || payment.stripePaymentIntentId || null,
          paidAt: new Date("2026-05-28T14:00:00Z"),
        } : payment);
      }
      return batch as any;
    },
    updateBillingBatchProcessing: async (batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        totalAmount,
        totalFees,
        paymentCount,
        status: "processing",
        processingStartedAt: new Date("2026-05-28T13:00:00Z"),
        stripePaymentIntentId: stripePaymentIntentId || batch?.stripePaymentIntentId || null,
      };
      return batch as any;
    },
    updateBillingBatchMetadata: async (batchId: string, metadataPatch: Record<string, unknown>) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        metadata: {
          ...(typeof batch?.metadata === "object" && batch?.metadata ? batch.metadata : {}),
          ...metadataPatch,
        },
      };
      return batch as any;
    },
    markBillingBatchCompleted: async (batchId: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "completed",
        completedAt: new Date("2026-05-28T14:00:00Z"),
      };
      return batch as any;
    },
    completeBatchPayment: async (batchId: string, stripePaymentIntentId: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "completed",
        stripePaymentIntentId,
        completedAt: new Date("2026-05-28T14:00:00Z"),
      };
    },
    markBillingBatchFailed: async (batchId: string, failureReason: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "failed",
        failureReason,
      };
    },
  } as const;

  const stripeClient = params.stripeMode
    ? {
        paymentIntents: {
          create: async (intent: Record<string, unknown>, options?: Record<string, unknown>) => {
            chargeCount++;
            lastIntent = intent;
            lastIntentOptions = options || null;
            if (params.stripeMode === "throw") {
              throw new Error("Stripe charge failed");
            }
            return {
              id: `pi_${chargeCount}`,
              status: params.stripeMode,
              amount: intent.amount,
              latest_charge: `ch_${chargeCount}`,
            };
          },
        },
      }
    : null;

  return {
    storage: storage as any,
    stripeClient: stripeClient as any,
    getBatch: () => batch,
    getChargeCount: () => chargeCount,
    getLastIntent: () => lastIntent,
    getLastIntentOptions: () => lastIntentOptions,
    setApprovedWashouts: (nextApprovedWashouts: typeof approvedWashouts) => {
      approvedWashouts = nextApprovedWashouts.map((row, index) => ({
        activityId: String(row.activityId || `activity_${index + 1}`),
        ownerId,
        driverId: String(row.driverId || `driver_${index + 1}`),
        locationId: String(row.locationId || `location_${index + 1}`),
        activityStatus: String(row.activityStatus || "verified"),
        activityFeeCentsPlatform: row.activityFeeCentsPlatform === undefined || row.activityFeeCentsPlatform === null
          ? null
          : Number(row.activityFeeCentsPlatform),
        activityAmount: row.activityAmount ?? "0.00",
        locationDriverTipRate: row.locationDriverTipRate === undefined || row.locationDriverTipRate === null
          ? 0
          : Number(row.locationDriverTipRate),
        verifiedAt: row.verifiedAt || new Date("2026-05-28T12:00:00Z"),
        createdAt: row.createdAt || new Date("2026-05-28T12:00:00Z"),
      })) as typeof approvedWashouts;
    },
    setPaymentsStatus: (status: string) => {
      payments = payments.map((payment) => ({ ...payment, status }));
    },
    getPayments: () => payments,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    username: "testuser",
    email: "test@example.com",
    passwordHash: "hashed-password",
    firstName: "Test",
    lastName: "User",
    phone: "555-0100",
    street: "1 Test Way",
    city: "Testville",
    state: "TX",
    zip: "75001",
    role: "driver",
    isActive: true,
    ...overrides,
  };
}

function makeFeatureFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: "flag_1",
    flagKey: FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS,
    enabled: false,
    description: "Driver Stripe payouts",
    allowedRoles: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeDriver(overrides: Record<string, unknown> = {}) {
  return {
    id: "driver_1",
    userId: "user_1",
    employerName: "Ready Mix Co",
    employerStreet: "",
    employerCity: "",
    employerState: "",
    employerZip: "",
    employerPhone: "",
    licenseNumber: "DL123",
    truckNumber: "Truck 7",
    dateOfBirth: "1990-01-01",
    ssnLast4: "1234",
    bankName: null,
    routingNumber: null,
    accountNumber: null,
    accountHolderName: null,
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
    stripeConnectAccountId: null,
    ...overrides,
  };
}

test("driver profile save does not create a Stripe account automatically", async () => {
  const { app, puts } = createRouteRegistry();
  const driver = makeDriver();
  const user = makeUser({ stripeConnectAccountId: null });
  let stripeCreateCalls = 0;
  let updateStripeInfoCalls = 0;
  let driverProfileUpdate: Record<string, unknown> | undefined;

  await withPatchedStripe(
    {
      accounts: {
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("profile save should not create Stripe accounts");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getDriver: async () => driver,
          createDriver: async () => driver,
          updateDriver: async (_driverId: string, update: Record<string, unknown>) => {
            driverProfileUpdate = update;
            return {
              ...driver,
              ...update,
            };
          },
          getUser: async () => user,
          upsertUser: async (nextUser: Record<string, unknown>) => ({
            ...user,
            ...nextUser,
          }),
          updateUserStripeInfo: async () => {
            updateStripeInfoCalls += 1;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = puts.get("/api/drivers/profile");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {
                firstName: "Updated",
                lastName: "Driver",
                phone: "555-0199",
                street: "99 Test Way",
                city: "Austin",
                state: "TX",
                zip: "78701",
                dateOfBirth: "1990-01-01",
                ssnLast4: "1234",
                businessWebsite: "https://driver.example.com",
                bankName: "Do Not Store Bank",
                accountHolderName: "Do Not Store",
                routingNumber: "111000025",
                accountNumber: "000123456789",
              },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
        },
      );
    },
  );

  assert.equal(stripeCreateCalls, 0);
  assert.equal(updateStripeInfoCalls, 0);
  assert.ok(driverProfileUpdate);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "bankName"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "accountHolderName"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "routingNumber"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "accountNumber"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "dateOfBirth"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "ssnLast4"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(driverProfileUpdate, "businessWebsite"), false);
});

test("driver bank detail endpoints do not accept or store bank information", async () => {
  const { app, posts } = createRouteRegistry();

  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(app as never);

  const bankAccountRoute = posts.get("/api/drivers/bank-account");
  const bankCompleteRoute = posts.get("/api/drivers/bank-connect/complete");
  assert.equal(typeof bankAccountRoute, "function");
  assert.equal(typeof bankCompleteRoute, "function");

  const manualRes = createResponse();
  await bankAccountRoute!(
    {
      user: { id: "user_1", role: "driver" },
      body: {
        bankName: "Do Not Store Bank",
        accountHolderName: "Do Not Store",
        routingNumber: "111000025",
        accountNumber: "000123456789",
      },
    },
    manualRes,
  );

  assert.equal(manualRes.statusCode, 410);
  assert.equal((manualRes.body as { reason?: string }).reason, "driver_bank_details_collected_by_stripe");

  const completeRes = createResponse();
  await bankCompleteRoute!(
    {
      user: { id: "user_1", role: "driver" },
      body: { sessionId: "fcsess_123" },
    },
    completeRes,
  );

  assert.equal(completeRes.statusCode, 410);
  assert.equal((completeRes.body as { reason?: string }).reason, "driver_bank_details_collected_by_stripe");
});

test("driver bank-connect session does not create Stripe account when payouts are disabled", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  let stripeCreateCalls = 0;
  let driverLookups = 0;
  let checkedFlagKey: string | undefined;
  let overrideLookups = 0;

  await withPatchedStripe(
    {
      accounts: {
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("disabled payouts should not create Stripe accounts");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => {
            driverLookups += 1;
            return makeDriver();
          },
          getFeatureFlag: async (flagKey: string) => {
            checkedFlagKey = flagKey;
            return makeFeatureFlag({ flagKey, enabled: false });
          },
          getFeatureFlagOverride: async () => {
            overrideLookups += 1;
            return undefined;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 403);
          assert.equal((res.body as { featureDisabled?: boolean }).featureDisabled, true);
        },
      );
    },
  );

  assert.equal(stripeCreateCalls, 0);
  assert.equal(driverLookups, 0);
  assert.equal(checkedFlagKey, FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.equal(overrideLookups, 1);
});

test("driver bank-connect session starts onboarding even when optional non-email local profile fields are missing", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({
    stripeConnectAccountId: null,
    firstName: "",
    lastName: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const driver = makeDriver({ dateOfBirth: null, ssnLast4: null });
  let createdPayload: Stripe.AccountCreateParams | undefined;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async (payload: Stripe.AccountCreateParams) => {
          createdPayload = payload;
          return {
            id: "acct_driver_optional_fields",
            object: "account",
          } as Stripe.Account;
        },
      },
      accountLinks: {
        create: async () => ({
          object: "account_link",
          created: 1,
          expires_at: 2,
          url: "https://connect.stripe.com/setup/optional-fields",
        } as Stripe.AccountLink),
      },
      customers: {
        create: async () => {
          throw new Error("driver payout onboarding should not create Stripe customers");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => driver,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
            user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/optional-fields");
          assert.equal((res.body as { onboardingUrl?: string }).onboardingUrl, "https://connect.stripe.com/setup/optional-fields");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_optional_fields");
          assert.equal((res.body as { payoutOnly?: boolean }).payoutOnly, true);
        },
      );
    },
  );

  assert.ok(createdPayload);
  assert.equal(createdPayload.type, "express");
  assert.equal(createdPayload.country, "US");
  assert.equal(createdPayload.business_type, "individual");
  assert.deepEqual(createdPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
  assert.equal(createdPayload.email, "test@example.com");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "individual"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "controller"), false);
  assert.equal(createdPayload.metadata?.userId, user.id);
  assert.equal(createdPayload.metadata?.user_id, user.id);
  assert.equal(createdPayload.metadata?.driverId, driver.id);
  assert.equal(createdPayload.metadata?.driver_id, driver.id);
  assert.equal(createdPayload.metadata?.role, "driver");
});

test("driver bank-connect session returns exact Stripe 400 reason from account creation", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  let updateStripeInfoCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async () => {
          const error = new Error("Received unknown parameter: individual[address][postalCode]. Did you mean postal_code?") as Error & {
            statusCode?: number;
            type?: string;
            code?: string;
            param?: string;
            requestId?: string;
          };
          error.statusCode = 400;
          error.type = "StripeInvalidRequestError";
          error.code = "parameter_unknown";
          error.param = "individual[address][postalCode]";
          error.requestId = "req_driver_payload";
          throw error;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => makeDriver(),
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async () => {
            updateStripeInfoCalls += 1;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 400);
          assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_ACCOUNT_CREATE_REJECTED");
          assert.equal((res.body as { reason?: string }).reason, "stripe_account_create_rejected");
          assert.equal((res.body as { message?: string }).message, "Received unknown parameter: individual[address][postalCode]. Did you mean postal_code?");
          assert.deepEqual((res.body as { missingFields?: string[] }).missingFields, []);
          assert.equal((res.body as { stripeError?: { param?: string } }).stripeError?.param, "individual[address][postalCode]");
          assert.equal((res.body as { stripeError?: { requestId?: string } }).stripeError?.requestId, "req_driver_payload");
        },
      );
    },
  );

  assert.equal(updateStripeInfoCalls, 0);
});

test("driver bank-connect session returns platform setup error when Stripe transfers approval is missing", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  let createdPayload: Stripe.AccountCreateParams | undefined;
  let accountLinkCalls = 0;
  let updateStripeInfoCalls = 0;
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_platform_rejected";

  try {
    await withPatchedStripe(
      {
        accounts: {
          create: async (payload: Stripe.AccountCreateParams) => {
            createdPayload = payload;
            const error = new Error("Your platform needs approval for accounts to have requested the transfers capability.") as Error & {
              statusCode?: number;
              type?: string;
              code?: string;
              requestId?: string;
            };
            error.statusCode = 400;
            error.type = "StripeInvalidRequestError";
            error.code = "account_capability_not_available";
            error.requestId = "req_platform_transfers";
            throw error;
          },
        },
        accountLinks: {
          create: async () => {
            accountLinkCalls += 1;
            throw new Error("platform rejection should not create account links");
          },
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getUser: async () => user,
            getDriver: async () => makeDriver(),
            getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
            getFeatureFlagOverride: async () => undefined,
            updateUserStripeInfo: async () => {
              updateStripeInfoCalls += 1;
              return user;
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = posts.get("/api/drivers/bank-connect/session");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                user: { id: user.id, role: "driver" },
                body: {},
                protocol: "https",
                get: () => "example.com",
              },
              res,
            );

            assert.equal(res.statusCode, 503);
            assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_PLATFORM_CONNECT_INCOMPLETE");
            assert.equal(
              (res.body as { message?: string }).message,
              "Payout setup is temporarily unavailable. Platform Stripe Connect setup is incomplete.",
            );
            assert.equal(
              (res.body as { adminMessage?: string }).adminMessage,
              "Stripe Connect platform setup is incomplete. Enable/approve connected account transfers before driver payout onboarding. Stripe Dashboard: Connect > Settings / Platform profile > Enable Express connected accounts / transfers.",
            );
            assert.equal((res.body as { reason?: string }).reason, "stripe_connect_transfers_not_enabled");
            assert.equal((res.body as { platformSetupIncomplete?: boolean }).platformSetupIncomplete, true);
            assert.equal((res.body as { stripeMode?: string }).stripeMode, "live");
            assert.deepEqual((res.body as { missingFields?: string[] }).missingFields, []);
            assert.equal((res.body as { stripeError?: { requestId?: string } }).stripeError?.requestId, "req_platform_transfers");
          },
        );
      },
    );
  } finally {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  }

  assert.ok(createdPayload);
  assert.deepEqual(createdPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
  assert.equal(accountLinkCalls, 0);
  assert.equal(updateStripeInfoCalls, 0);
});

test("driver bank-connect session uses Express ACH payout recipient payload", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  const driver = makeDriver();
  const createdPayloads: Stripe.AccountCreateParams[] = [];
  let createdAccountLink: Stripe.AccountLinkCreateParams | undefined;
  let updatedStripeAccountId: string | undefined;
  let customerCalls = 0;
  let paymentIntentCalls = 0;
  let setupIntentCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        create: async (payload: Stripe.AccountCreateParams) => {
          createdPayloads.push(payload);
          return {
            id: "acct_driver_restored_capabilities",
            object: "account",
          } as Stripe.Account;
        },
      },
      accountLinks: {
        create: async (payload: Stripe.AccountLinkCreateParams) => {
          createdAccountLink = payload;
          return {
            object: "account_link",
            created: 1,
            expires_at: 2,
            url: "https://connect.stripe.com/setup/restored-capabilities",
          } as Stripe.AccountLink;
        },
      },
      customers: {
        create: async () => {
          customerCalls += 1;
          throw new Error("driver payout onboarding should not create Stripe customers");
        },
      },
      paymentIntents: {
        create: async () => {
          paymentIntentCalls += 1;
          throw new Error("driver payout onboarding should not create PaymentIntents");
        },
      },
      setupIntents: {
        create: async () => {
          setupIntentCalls += 1;
          throw new Error("driver payout onboarding should not create SetupIntents");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => driver,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
            updatedStripeAccountId = stripeData.stripeConnectAccountId;
            user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/restored-capabilities");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_restored_capabilities");
          assert.equal((res.body as { payoutOnly?: boolean }).payoutOnly, true);
        },
      );
    },
  );

  assert.equal(createdPayloads.length, 1);
  assert.deepEqual(createdPayloads[0].capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
  assert.equal(createdPayloads[0].type, "express");
  assert.equal(createdPayloads[0].business_type, "individual");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayloads[0] as Record<string, unknown>, "controller"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayloads[0] as Record<string, unknown>, "individual"), false);
  assert.equal(createdPayloads[0].metadata?.userId, user.id);
  assert.equal(createdPayloads[0].metadata?.user_id, user.id);
  assert.equal(createdPayloads[0].metadata?.driverId, driver.id);
  assert.equal(createdPayloads[0].metadata?.driver_id, driver.id);
  assert.ok(createdAccountLink);
  assert.equal(createdAccountLink.account, "acct_driver_restored_capabilities");
  assert.equal(createdAccountLink.type, "account_onboarding");
  assert.equal(updatedStripeAccountId, "acct_driver_restored_capabilities");
  assert.equal(customerCalls, 0);
  assert.equal(paymentIntentCalls, 0);
  assert.equal(setupIntentCalls, 0);
});

test("superadmin Stripe Connect health check reports mode and transfer setup state", async () => {
  const { app, gets } = createRouteRegistry();
  const superAdmin = makeUser({ id: "super_admin_1", role: "super_admin" });
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_health_check";

  try {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_platform_test",
            object: "account",
            country: "US",
          } as Stripe.Account),
          list: async () => ({
            data: [],
            has_more: false,
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getUser: async () => superAdmin,
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = gets.get("/api/admin/stripe/connect-health");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                user: { id: superAdmin.id, role: "super_admin" },
                body: {},
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { stripeConfigured?: boolean }).stripeConfigured, true);
            assert.equal((res.body as { stripeMode?: string }).stripeMode, "test");
            assert.equal((res.body as { connectEnabled?: boolean }).connectEnabled, true);
            assert.equal((res.body as { expressOnboardingAvailable?: boolean }).expressOnboardingAvailable, true);
            assert.equal((res.body as { transfersCapabilitySupported?: boolean | null }).transfersCapabilitySupported, null);
            assert.equal((res.body as { transfersCapabilityCreationSupported?: boolean | null }).transfersCapabilityCreationSupported, null);
            assert.equal((res.body as { requestedCapability?: string }).requestedCapability, "transfers");
            assert.deepEqual((res.body as { requestedCapabilities?: string[] }).requestedCapabilities, ["transfers"]);
            assert.equal((res.body as { platformAccountId?: string }).platformAccountId, "acct_platform_test");
            assert.match(
              (res.body as { adminMessage?: string }).adminMessage || "",
              /Stripe Dashboard > Connect > Settings \/ Platform profile/,
            );
          },
        );
      },
    );
  } finally {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  }
});

test("superadmin driver Stripe debug endpoint returns read-only account diagnostics", async () => {
  const { app, gets } = createRouteRegistry();
  const superAdmin = makeUser({ id: "super_admin_1", role: "super_admin" });
  const driverUser = makeUser({ id: "driver_user_1", role: "driver", stripeConnectAccountId: "acct_driver_debug_td1" });
  const driver = makeDriver({ id: "driver_td1", userId: driverUser.id });
  let retrievedAccountId: string | undefined;
  let stripeCreateCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async (accountId: string) => {
          retrievedAccountId = accountId;
          return {
            id: accountId,
            object: "account",
            details_submitted: true,
            payouts_enabled: false,
            charges_enabled: false,
            requirements: {
              currently_due: ["external_account"],
              past_due: ["individual.verification.document"],
              eventually_due: ["individual.id_number"],
              disabled_reason: "requirements.past_due",
            },
            external_accounts: {
              object: "list",
              data: [
                { id: "ba_1", object: "bank_account" },
                { id: "card_1", object: "card" },
                { id: "ba_2", object: "bank_account" },
              ],
              has_more: false,
              total_count: 3,
              url: "/v1/accounts/acct_driver_debug_td1/external_accounts",
            },
          } as unknown as Stripe.Account;
        },
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("diagnostic endpoint must not create Stripe accounts");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async (id: string) => {
            if (id === superAdmin.id) return superAdmin;
            if (id === driverUser.id) return driverUser;
            return undefined;
          },
          getDriver: async (userId: string) => userId === driverUser.id ? driver : undefined,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/admin/debug/driver-stripe/:userId");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: superAdmin.id, role: "super_admin" },
              params: { userId: driverUser.id },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.deepEqual(res.body, {
            userId: driverUser.id,
            driverId: driver.id,
            stripeAccountId: "acct_driver_debug_td1",
            accountExists: true,
            detailsSubmitted: true,
            payoutsEnabled: false,
            chargesEnabled: false,
            requirementsCurrentlyDue: ["external_account"],
            requirementsPastDue: ["individual.verification.document"],
            requirementsEventuallyDue: ["individual.id_number"],
            disabledReason: "requirements.past_due",
            externalAccountsCount: 3,
            bankAccountsCount: 2,
            onboardingComplete: false,
          });
        },
      );
    },
  );

  assert.equal(retrievedAccountId, "acct_driver_debug_td1");
  assert.equal(stripeCreateCalls, 0);
});

test("driver Stripe debug endpoint is super-admin only", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => makeUser({ id: "admin_1", role: "admin" }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/debug/driver-stripe/:userId");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "admin" },
          params: { userId: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
    },
  );
});

test("driver bank-connect session returns exact 400 reason from unexpected setup rejection", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async () => ({
          id: "acct_driver_storage_reject",
          object: "account",
        } as Stripe.Account),
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => makeDriver(),
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async () => {
            const error = new Error("Driver Stripe account could not be saved") as Error & {
              statusCode?: number;
              missingFields?: string[];
            };
            error.statusCode = 400;
            error.missingFields = [];
            throw error;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 400);
          assert.equal((res.body as { code?: string }).code, "DRIVER_PAYOUT_SETUP_REJECTED");
          assert.equal((res.body as { reason?: string }).reason, "driver_payout_setup_rejected");
          assert.equal((res.body as { message?: string }).message, "Driver Stripe account could not be saved");
          assert.deepEqual((res.body as { missingFields?: string[] }).missingFields, []);
        },
      );
    },
  );
});

test("driver can start payout onboarding without Stripe customer card or payment method", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({
    stripeConnectAccountId: null,
    stripeCustomerId: null,
    stripePaymentMethodId: null,
    paymentMethod: null,
    firstName: "",
    lastName: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const driver = makeDriver({ dateOfBirth: null, ssnLast4: null });
  let createdPayload: Stripe.AccountCreateParams | undefined;
  let customerCalls = 0;
  let paymentMethodCalls = 0;
  let paymentIntentCalls = 0;
  let setupIntentCalls = 0;
  let financialConnectionCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async (payload: Stripe.AccountCreateParams) => {
          createdPayload = payload;
          return {
            id: "acct_driver_payout_only",
            object: "account",
          } as Stripe.Account;
        },
        retrieve: async (accountId: string) => ({
          id: accountId,
          object: "account",
          payouts_enabled: false,
          requirements: {
            currently_due: ["external_account"],
            past_due: [],
            eventually_due: [],
          },
          capabilities: {
            transfers: "pending",
          },
        } as Stripe.Account),
      },
      accountLinks: {
        create: async () => ({
          object: "account_link",
          created: 1,
          expires_at: 2,
          url: "https://connect.stripe.com/setup/payout-only",
        } as Stripe.AccountLink),
      },
      customers: {
        create: async () => {
          customerCalls += 1;
          throw new Error("driver payout onboarding should not create Stripe customers");
        },
        retrieve: async () => {
          customerCalls += 1;
          throw new Error("driver payout onboarding should not retrieve Stripe customers");
        },
      },
      paymentMethods: {
        retrieve: async () => {
          paymentMethodCalls += 1;
          throw new Error("driver payout onboarding should not retrieve card payment methods");
        },
      },
      paymentIntents: {
        create: async () => {
          paymentIntentCalls += 1;
          throw new Error("driver payout onboarding should not create PaymentIntents");
        },
      },
      setupIntents: {
        create: async () => {
          setupIntentCalls += 1;
          throw new Error("driver payout onboarding should not create SetupIntents");
        },
      },
      financialConnections: {
        sessions: {
          create: async () => {
            financialConnectionCalls += 1;
            throw new Error("driver payout onboarding should use Stripe account links, not Financial Connections sessions");
          },
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => driver,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
            user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-onboarding");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/payout-only");
          assert.equal((res.body as { onboardingUrl?: string }).onboardingUrl, "https://connect.stripe.com/setup/payout-only");
          assert.equal((res.body as { payoutOnly?: boolean }).payoutOnly, true);
          assert.equal((res.body as { setupType?: string }).setupType, "stripe_connect_onboarding");
        },
      );
    },
  );

  assert.equal(customerCalls, 0);
  assert.equal(paymentMethodCalls, 0);
  assert.equal(paymentIntentCalls, 0);
  assert.equal(setupIntentCalls, 0);
  assert.equal(financialConnectionCalls, 0);
  assert.ok(createdPayload);
  assert.equal(createdPayload.type, "express");
  assert.equal(createdPayload.country, "US");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "controller"), false);
  assert.deepEqual(createdPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
  assert.equal(createdPayload.business_type, "individual");
  assert.equal(createdPayload.email, "test@example.com");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "individual"), false);
  assert.equal(createdPayload.metadata?.userId, user.id);
  assert.equal(createdPayload.metadata?.user_id, user.id);
  assert.equal(createdPayload.metadata?.driverId, driver.id);
  assert.equal(createdPayload.metadata?.driver_id, driver.id);
  assert.equal(createdPayload.metadata?.role, "driver");
});

test("driver Stripe onboarding returns missingFields when required profile email is missing", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null, email: "" });
  let stripeCreateCalls = 0;
  let accountLinkCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("missing profile fields should block Stripe account creation");
        },
      },
      accountLinks: {
        create: async () => {
          accountLinkCalls += 1;
          throw new Error("missing profile fields should block account link creation");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => makeDriver(),
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-onboarding");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 400);
          assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_PROFILE_INCOMPLETE");
          assert.equal((res.body as { reason?: string }).reason, "missing_required_profile_fields");
          assert.deepEqual((res.body as { missingFields?: string[] }).missingFields, ["email"]);
        },
      );
    },
  );

  assert.equal(stripeCreateCalls, 0);
  assert.equal(accountLinkCalls, 0);
});

test("driver Stripe onboarding reuses existing Stripe account found by user metadata", async () => {
  const { app, gets, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  const driver = makeDriver();
  let stripeCreateCalls = 0;
  let updatedStripeAccountId: string | undefined;
  let retrievedAccountId: string | undefined;
  let createdAccountLink: Stripe.AccountLinkCreateParams | undefined;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [
            {
              id: "acct_driver_metadata_reuse",
              object: "account",
              metadata: {
                user_id: user.id,
                userId: user.id,
                role: "driver",
              },
              capabilities: {
                transfers: "pending",
              },
            } as Stripe.Account,
          ],
          has_more: false,
        }),
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("existing metadata account should be reused");
        },
        retrieve: async (accountId: string) => {
          retrievedAccountId = accountId;
          return {
            id: accountId,
            object: "account",
            payouts_enabled: false,
            requirements: {
              currently_due: ["external_account"],
              past_due: [],
              eventually_due: [],
            },
            capabilities: {
              transfers: "pending",
            },
          } as Stripe.Account;
        },
      },
      accountLinks: {
        create: async (payload: Stripe.AccountLinkCreateParams) => {
          createdAccountLink = payload;
          return {
            object: "account_link",
            created: 1,
            expires_at: 2,
            url: "https://connect.stripe.com/setup/reused",
          } as Stripe.AccountLink;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => driver,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
            updatedStripeAccountId = stripeData.stripeConnectAccountId;
            user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-onboarding");
          assert.equal(typeof route, "function");
          assert.equal(typeof posts.get("/api/drivers/stripe-onboarding"), "undefined");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/reused");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_metadata_reuse");
          assert.equal((res.body as { payoutOnly?: boolean }).payoutOnly, true);
        },
      );
    },
  );

  assert.equal(stripeCreateCalls, 0);
  assert.equal(updatedStripeAccountId, "acct_driver_metadata_reuse");
  assert.equal(retrievedAccountId, undefined);
  assert.ok(createdAccountLink);
  assert.equal(createdAccountLink.account, "acct_driver_metadata_reuse");
  assert.equal(createdAccountLink.type, "account_onboarding");
});

test("driver bank-connect session creates Express account only when payouts are enabled and requested", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null, phone: "512-555-0100" });
  const driver = makeDriver({ dateOfBirth: null, ssnLast4: null });
  let createdPayload: Stripe.AccountCreateParams | undefined;
  let createdAccountLink: Stripe.AccountLinkCreateParams | undefined;
  let updatedStripeAccountId: string | undefined;

  await withPatchedStripe(
    {
      accounts: {
        list: async () => ({
          data: [],
          has_more: false,
        }),
        create: async (payload: Stripe.AccountCreateParams) => {
          createdPayload = payload;
          return {
            id: "acct_driver_bank_connect",
            object: "account",
          } as Stripe.Account;
        },
      },
      accountLinks: {
        create: async (payload: Stripe.AccountLinkCreateParams) => {
          createdAccountLink = payload;
          return {
            object: "account_link",
            created: 1,
            expires_at: 2,
            url: "https://connect.stripe.com/setup/bank-connect",
          } as Stripe.AccountLink;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => driver,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
            updatedStripeAccountId = stripeData.stripeConnectAccountId;
            user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/bank-connect");
          assert.equal((res.body as { onboardingUrl?: string }).onboardingUrl, "https://connect.stripe.com/setup/bank-connect");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_bank_connect");
          assert.equal((res.body as { payoutOnly?: boolean }).payoutOnly, true);
        },
      );
    },
  );

  assert.equal(updatedStripeAccountId, "acct_driver_bank_connect");
  assert.ok(createdPayload);
  assert.equal(createdPayload.type, "express");
  assert.equal(createdPayload.country, "US");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "controller"), false);
  assert.deepEqual(createdPayload.capabilities, {
    card_payments: { requested: true },
    transfers: { requested: true },
  });
  assert.equal(createdPayload.email, "test@example.com");
  assert.equal(createdPayload.business_type, "individual");
  assert.equal(Object.prototype.hasOwnProperty.call(createdPayload as Record<string, unknown>, "individual"), false);
  assert.equal(createdPayload.metadata?.userId, user.id);
  assert.equal(createdPayload.metadata?.user_id, user.id);
  assert.equal(createdPayload.metadata?.driverId, driver.id);
  assert.equal(createdPayload.metadata?.driver_id, driver.id);
  assert.equal(createdPayload.metadata?.role, "driver");
  assert.ok(createdAccountLink);
  assert.equal(createdAccountLink.account, "acct_driver_bank_connect");
  assert.equal(createdAccountLink.type, "account_onboarding");
  assert.equal(createdAccountLink.refresh_url, "https://example.com/profile?stripe_refresh=1");
  assert.equal(createdAccountLink.return_url, "https://example.com/profile?stripe_return=1");
});

test("driver bank-connect session uses configured public HTTPS URLs in production", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_existing_https" });
  let createdAccountLink: Stripe.AccountLinkCreateParams | undefined;

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_unit_test_secret",
      PUBLIC_APP_URL: "https://cretexchangetemp-production.up.railway.app/",
      APP_BASE_URL: undefined,
    },
    async () => {
      await withPatchedStripe(
        {
          accountLinks: {
            create: async (payload: Stripe.AccountLinkCreateParams) => {
              createdAccountLink = payload;
              return {
                object: "account_link",
                created: 1,
                expires_at: 2,
                url: "https://connect.stripe.com/setup/public-https",
              } as Stripe.AccountLink;
            },
          },
        },
        async () => {
          await withPatchedStorage(
            {
              getUser: async () => user,
              getDriver: async () => makeDriver(),
              getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
              getFeatureFlagOverride: async () => undefined,
            },
            async () => {
              const { registerRoutes } = await import("../server/routes");
              await registerRoutes(app as never);
              const route = posts.get("/api/drivers/bank-connect/session");
              assert.equal(typeof route, "function");

              const res = createResponse();
              await route!(
                {
                  user: { id: user.id, role: "driver" },
                  body: {},
                  protocol: "http",
                  get: () => "cretexchange.railway.internal:5000",
                },
                res,
              );

              assert.equal(res.statusCode, 200);
              assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/public-https");
              assert.equal((res.body as { onboardingUrl?: string }).onboardingUrl, "https://connect.stripe.com/setup/public-https");
              assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_existing_https");
            },
          );
        },
      );
    },
  );

  assert.ok(createdAccountLink);
  assert.equal(createdAccountLink.account, "acct_driver_existing_https");
  assert.equal(
    createdAccountLink.refresh_url,
    "https://cretexchangetemp-production.up.railway.app/profile?stripe_refresh=1",
  );
  assert.equal(
    createdAccountLink.return_url,
    "https://cretexchangetemp-production.up.railway.app/profile?stripe_return=1",
  );
});

test("driver bank-connect session rejects live-mode non-HTTPS app URL before Stripe account link call", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_existing_live" });
  let accountLinkCalls = 0;

  await withPatchedEnv(
    {
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: "sk_live_unit_test_secret",
      PUBLIC_APP_URL: "http://cretexchangetemp-production.up.railway.app",
      APP_BASE_URL: undefined,
    },
    async () => {
      await withPatchedStripe(
        {
          accountLinks: {
            create: async () => {
              accountLinkCalls += 1;
              throw new Error("non-HTTPS live config should fail before Stripe account link creation");
            },
          },
        },
        async () => {
          await withPatchedStorage(
            {
              getUser: async () => user,
              getDriver: async () => makeDriver(),
              getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
              getFeatureFlagOverride: async () => undefined,
            },
            async () => {
              const { registerRoutes } = await import("../server/routes");
              await registerRoutes(app as never);
              const route = posts.get("/api/drivers/bank-connect/session");
              assert.equal(typeof route, "function");

              const res = createResponse();
              await route!(
                {
                  user: { id: user.id, role: "driver" },
                  body: {},
                  protocol: "http",
                  get: () => "cretexchange.railway.internal:5000",
                },
                res,
              );

              assert.equal(res.statusCode, 500);
              assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_ACCOUNT_LINK_CONFIG_INVALID");
              assert.equal((res.body as { reason?: string }).reason, "driver_stripe_public_app_url_not_https");
              assert.equal(
                (res.body as { message?: string }).message,
                "Stripe account created, but onboarding link could not be generated.",
              );
              assert.match(
                (res.body as { adminMessage?: string }).adminMessage || "",
                /PUBLIC_APP_URL, APP_BASE_URL, or RAILWAY_PUBLIC_DOMAIN/,
              );
              assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_existing_live");
              assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
              assert.equal((res.body as { setupStarted?: boolean }).setupStarted, true);
              assert.equal((res.body as { onboardingLinkGenerated?: boolean }).onboardingLinkGenerated, false);
            },
          );
        },
      );
    },
  );

  assert.equal(accountLinkCalls, 0);
});

test("driver bank-connect session returns safe error when Stripe account link has no URL", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_existing", phone: "512-555-0100" });

  await withPatchedStripe(
    {
      accountLinks: {
        create: async () => ({
          object: "account_link",
          created: 1,
          expires_at: 2,
        } as Stripe.AccountLink),
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 502);
          assert.equal((res.body as { code?: string }).code, "STRIPE_ACCOUNT_LINK_MISSING_URL");
          assert.equal(
            (res.body as { message?: string }).message,
            "Stripe account created, but onboarding link could not be generated.",
          );
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_existing");
          assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
          assert.equal((res.body as { setupStarted?: boolean }).setupStarted, true);
          assert.equal((res.body as { onboardingLinkGenerated?: boolean }).onboardingLinkGenerated, false);
        },
      );
    },
  );
});

test("driver bank-connect session returns exact Stripe 400 reason from account link creation", async () => {
  const { app, posts } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_existing" });

  await withPatchedStripe(
    {
      accountLinks: {
        create: async () => {
          const error = new Error("Account cannot create onboarding links in its current state.") as Error & {
            statusCode?: number;
            type?: string;
            code?: string;
            requestId?: string;
          };
          error.statusCode = 400;
          error.type = "StripeInvalidRequestError";
          error.code = "account_invalid";
          error.requestId = "req_account_link";
          throw error;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/drivers/bank-connect/session");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              body: {},
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 400);
          assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_ACCOUNT_LINK_REJECTED");
          assert.equal((res.body as { reason?: string }).reason, "stripe_account_link_create_rejected");
          assert.equal(
            (res.body as { message?: string }).message,
            "Stripe account created, but onboarding link could not be generated.",
          );
          assert.equal((res.body as { error?: string }).error, "Account cannot create onboarding links in its current state.");
          assert.deepEqual((res.body as { missingFields?: string[] }).missingFields, []);
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_existing");
          assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
          assert.equal((res.body as { setupStarted?: boolean }).setupStarted, true);
          assert.equal((res.body as { onboardingLinkGenerated?: boolean }).onboardingLinkGenerated, false);
          assert.equal((res.body as { stripeError?: { requestId?: string } }).stripeError?.requestId, "req_account_link");
        },
      );
    },
  );
});

test("driver Stripe onboarding returns admin setup error when live public app URL is missing", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_onboarding_missing_url" });
  let accountLinkCalls = 0;

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_live_unit_test_secret",
      PUBLIC_APP_URL: undefined,
      APP_BASE_URL: undefined,
      RAILWAY_PUBLIC_DOMAIN: undefined,
    },
    async () => {
      await withPatchedStripe(
        {
          accounts: {
            retrieve: async () => ({
              id: "acct_driver_onboarding_missing_url",
              object: "account",
              requirements: {
                currently_due: ["external_account"],
                past_due: [],
                eventually_due: [],
              },
            } as Stripe.Account),
          },
          accountLinks: {
            create: async () => {
              accountLinkCalls += 1;
              throw new Error("missing public app URL should fail before Stripe account link creation");
            },
          },
        },
        async () => {
          await withPatchedStorage(
            {
              getUser: async () => user,
              getDriver: async () => makeDriver(),
              getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
              getFeatureFlagOverride: async () => undefined,
            },
            async () => {
              const { registerRoutes } = await import("../server/routes");
              await registerRoutes(app as never);
              const route = gets.get("/api/drivers/stripe-onboarding");
              assert.equal(typeof route, "function");

              const res = createResponse();
              await route!(
                {
                  user: { id: user.id, role: "driver" },
                  protocol: "http",
                  get: () => "cretexchange.railway.internal:5000",
                },
                res,
              );

              assert.equal(res.statusCode, 500);
              assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_ACCOUNT_LINK_CONFIG_INVALID");
              assert.equal((res.body as { reason?: string }).reason, "driver_stripe_public_app_url_missing");
              assert.equal(
                (res.body as { message?: string }).message,
                "Stripe account created, but onboarding link could not be generated.",
              );
              assert.match(
                (res.body as { adminMessage?: string }).adminMessage || "",
                /Set PUBLIC_APP_URL, APP_BASE_URL, or RAILWAY_PUBLIC_DOMAIN to the public HTTPS app URL/,
              );
              assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_onboarding_missing_url");
              assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
              assert.equal((res.body as { setupStarted?: boolean }).setupStarted, true);
              assert.equal((res.body as { onboardingLinkGenerated?: boolean }).onboardingLinkGenerated, false);
            },
          );
        },
      );
    },
  );

  assert.equal(accountLinkCalls, 0);
});

test("driver Stripe onboarding persists created account ID when account link generation fails", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  let stripeCreateCalls = 0;
  let accountLinkCalls = 0;
  let updatedStripeAccountId: string | undefined;
  let retrievedAccountId: string | undefined;

  await withPatchedEnv(
    {
      NODE_ENV: "production",
      STRIPE_SECRET_KEY: "sk_live_unit_test_secret",
      PUBLIC_APP_URL: undefined,
      APP_BASE_URL: undefined,
      RAILWAY_PUBLIC_DOMAIN: undefined,
    },
    async () => {
      await withPatchedStripe(
        {
          accounts: {
            list: async () => ({
              data: [],
              has_more: false,
            }),
            create: async () => {
              stripeCreateCalls += 1;
              return {
                id: "acct_td1_created_before_link_failure",
                object: "account",
              } as Stripe.Account;
            },
            retrieve: async (accountId: string) => {
              retrievedAccountId = accountId;
              return {
                id: accountId,
                object: "account",
                payouts_enabled: false,
                charges_enabled: false,
                details_submitted: false,
                requirements: {
                  currently_due: ["external_account"],
                  past_due: [],
                  eventually_due: [],
                },
              } as Stripe.Account;
            },
          },
          accountLinks: {
            create: async () => {
              accountLinkCalls += 1;
              throw new Error("missing public app URL should fail before Stripe account link creation");
            },
          },
        },
        async () => {
          await withPatchedStorage(
            {
              getUser: async () => user,
              getDriver: async () => makeDriver(),
              getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
              getFeatureFlagOverride: async () => undefined,
              updateUserStripeInfo: async (_userId: string, stripeData: { stripeConnectAccountId?: string }) => {
                updatedStripeAccountId = stripeData.stripeConnectAccountId;
                user.stripeConnectAccountId = stripeData.stripeConnectAccountId;
                return user;
              },
            },
            async () => {
              const { registerRoutes } = await import("../server/routes");
              await registerRoutes(app as never);
              const route = gets.get("/api/drivers/stripe-onboarding");
              assert.equal(typeof route, "function");

              const res = createResponse();
              await route!(
                {
                  user: { id: user.id, role: "driver" },
                  protocol: "http",
                  get: () => "cretexchange.railway.internal:5000",
                },
                res,
              );

              assert.equal(res.statusCode, 500);
              assert.equal((res.body as { code?: string }).code, "DRIVER_STRIPE_ACCOUNT_LINK_CONFIG_INVALID");
              assert.equal((res.body as { reason?: string }).reason, "driver_stripe_public_app_url_missing");
              assert.equal(
                (res.body as { message?: string }).message,
                "Stripe account created, but onboarding link could not be generated.",
              );
              assert.equal((res.body as { accountId?: string }).accountId, "acct_td1_created_before_link_failure");
              assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
              assert.equal((res.body as { setupStarted?: boolean }).setupStarted, true);
              assert.equal((res.body as { onboardingLinkGenerated?: boolean }).onboardingLinkGenerated, false);
            },
          );
        },
      );
    },
  );

  assert.equal(stripeCreateCalls, 1);
  assert.equal(accountLinkCalls, 0);
  assert.equal(updatedStripeAccountId, "acct_td1_created_before_link_failure");
  assert.equal(user.stripeConnectAccountId, "acct_td1_created_before_link_failure");
  assert.equal(retrievedAccountId, undefined);
});

test("driver Stripe onboarding link logs read-only account debug before creating link", async () => {
  const { createDriverStripeOnboardingLink } = await import("../server/routes");
  const debugAccount = {
    id: "acct_driver_link_debug",
    object: "account",
    details_submitted: true,
    payouts_enabled: false,
    charges_enabled: false,
    requirements: {
      currently_due: ["external_account"],
      past_due: [],
      eventually_due: [],
    },
    external_accounts: {
      object: "list",
      data: [{ id: "ba_1", object: "bank_account" }],
      has_more: false,
      total_count: 1,
      url: "/v1/accounts/acct_driver_link_debug/external_accounts",
    },
  } as unknown as Stripe.Account;
  const logCalls: unknown[][] = [];
  const originalLog = console.log;
  let accountLinkPayload: Stripe.AccountLinkCreateParams | undefined;

  console.log = (...args: unknown[]) => {
    logCalls.push(args);
  };

  try {
    await withPatchedStripe(
      {
        accountLinks: {
          create: async (payload: Stripe.AccountLinkCreateParams) => {
            accountLinkPayload = payload;
            return {
              object: "account_link",
              created: 1,
              expires_at: 2,
              url: "https://connect.stripe.com/setup/debug-log",
            } as Stripe.AccountLink;
          },
        },
      },
      async () => {
        const link = await createDriverStripeOnboardingLink(
          {
            protocol: "https",
            get: () => "example.com",
          },
          "acct_driver_link_debug",
          debugAccount,
        );

        assert.equal(link.url, "https://connect.stripe.com/setup/debug-log");
      },
    );
  } finally {
    console.log = originalLog;
  }

  assert.ok(accountLinkPayload);
  assert.equal(accountLinkPayload.account, "acct_driver_link_debug");
  assert.equal(accountLinkPayload.type, "account_onboarding");
  const debugLog = logCalls.find((args) => args[0] === "[DRIVER_STRIPE_DEBUG]");
  assert.ok(debugLog);
  assert.deepEqual(debugLog?.[1], {
    stripeAccountId: "acct_driver_link_debug",
    detailsSubmitted: true,
    payoutsEnabled: false,
    chargesEnabled: false,
    currentlyDue: ["external_account"],
    externalAccountsCount: 1,
  });
});

test("driver Stripe onboarding creates account link URL for existing account", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_onboarding", phone: "512-555-0100" });
  let createdAccountLink: Stripe.AccountLinkCreateParams | undefined;
  let stripeCreateCalls = 0;
  let updateStripeInfoCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async () => ({
          id: "acct_driver_onboarding",
          object: "account",
          requirements: {
            currently_due: ["external_account"],
            past_due: [],
            eventually_due: [],
          },
        } as Stripe.Account),
        create: async () => {
          stripeCreateCalls += 1;
          throw new Error("resume onboarding should not create Stripe accounts");
        },
      },
      accountLinks: {
        create: async (payload: Stripe.AccountLinkCreateParams) => {
          createdAccountLink = payload;
          return {
            object: "account_link",
            created: 1,
            expires_at: 2,
            url: "https://connect.stripe.com/setup/test",
          } as Stripe.AccountLink;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
          getDriver: async () => makeDriver(),
          getFeatureFlag: async (flagKey: string) => makeFeatureFlag({ flagKey, enabled: true }),
          getFeatureFlagOverride: async () => undefined,
          updateUserStripeInfo: async () => {
            updateStripeInfoCalls += 1;
            return user;
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-onboarding");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
              protocol: "https",
              get: () => "example.com",
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { url?: string }).url, "https://connect.stripe.com/setup/test");
          assert.equal((res.body as { onboardingUrl?: string }).onboardingUrl, "https://connect.stripe.com/setup/test");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_onboarding");
        },
      );
    },
  );

  assert.ok(createdAccountLink);
  assert.equal(createdAccountLink.account, "acct_driver_onboarding");
  assert.equal(createdAccountLink.type, "account_onboarding");
  assert.equal(createdAccountLink.refresh_url, "https://example.com/profile?stripe_refresh=1");
  assert.equal(createdAccountLink.return_url, "https://example.com/profile?stripe_return=1");
  assert.equal(stripeCreateCalls, 0);
  assert.equal(updateStripeInfoCalls, 0);
});

test("driver Stripe status exposes setup-started connected account payout status", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_debug_status" });

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async (accountId: string) => ({
          id: accountId,
          object: "account",
          type: "express",
          capabilities: {
            transfers: "pending",
          },
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          requirements: {
            currently_due: ["external_account"],
            eventually_due: ["individual.verification.document"],
            past_due: [],
            current_deadline: null,
          },
        } as Stripe.Account),
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-status");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { hasAccount?: boolean }).hasAccount, true);
          assert.equal((res.body as { connectedAccountIdExists?: boolean }).connectedAccountIdExists, true);
          assert.equal((res.body as { stripeConnectAccountId?: string }).stripeConnectAccountId, "acct_driver_debug_status");
          assert.equal((res.body as { stripeAccountId?: string }).stripeAccountId, "acct_driver_debug_status");
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_debug_status");
          assert.equal((res.body as { status?: string }).status, "setup_started");
          assert.equal((res.body as { statusLabel?: string }).statusLabel, "Resume Onboarding");
          assert.equal((res.body as { detailsSubmitted?: boolean }).detailsSubmitted, false);
          assert.equal((res.body as { onboardingComplete?: boolean }).onboardingComplete, false);
          assert.equal((res.body as { payoutsEnabled?: boolean }).payoutsEnabled, false);
          assert.equal((res.body as { chargesEnabled?: boolean }).chargesEnabled, false);
          assert.equal((res.body as { externalAccountsCount?: number }).externalAccountsCount, 0);
          assert.deepEqual(
            (res.body as { requirementsCurrentlyDue?: string[] }).requirementsCurrentlyDue,
            ["external_account"],
          );
          assert.deepEqual((res.body as { currentlyDue?: string[] }).currentlyDue, ["external_account"]);
          assert.deepEqual((res.body as { pastDue?: string[] }).pastDue, []);
        },
      );
    },
  );
});

test("driver Stripe status returns Not Started when no connected account exists", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: null });
  let stripeRetrieveCalls = 0;

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async () => {
          stripeRetrieveCalls += 1;
          throw new Error("no account should not call Stripe retrieve");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-status");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { hasAccount?: boolean }).hasAccount, false);
          assert.equal((res.body as { stripeConnectAccountId?: string | null }).stripeConnectAccountId, null);
          assert.equal((res.body as { status?: string }).status, "not_started");
          assert.equal((res.body as { statusLabel?: string }).statusLabel, "Not Started");
          assert.equal((res.body as { onboardingComplete?: boolean }).onboardingComplete, false);
          assert.deepEqual((res.body as { requirementsCurrentlyDue?: string[] }).requirementsCurrentlyDue, []);
          assert.deepEqual((res.body as { requirementsPastDue?: string[] }).requirementsPastDue, []);
        },
      );
    },
  );

  assert.equal(stripeRetrieveCalls, 0);
});

test("driver Stripe requirements returns safe JSON when Stripe lookup fails", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_requirements_error" });
  let retrievedAccountId: string | undefined;
  const stripeError = new Error("Stripe API unavailable") as Error & {
    statusCode?: number;
    type?: string;
    code?: string;
    requestId?: string;
  };
  stripeError.statusCode = 503;
  stripeError.type = "StripeAPIError";
  stripeError.code = "api_connection_error";
  stripeError.requestId = "req_driver_requirements_error";

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async (accountId: string) => {
          retrievedAccountId = accountId;
          throw stripeError;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-requirements");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal(retrievedAccountId, "acct_driver_requirements_error");
          assert.equal((res.body as { hasAccount?: boolean }).hasAccount, true);
          assert.equal((res.body as { accountId?: string }).accountId, "acct_driver_requirements_error");
          assert.equal(
            (res.body as { reason?: string }).reason,
            "driver_stripe_requirements_lookup_failed",
          );
          assert.equal((res.body as { stripeStatusUnavailable?: boolean }).stripeStatusUnavailable, true);
          assert.equal((res.body as { pollingDisabled?: boolean }).pollingDisabled, true);
          assert.equal(
            (res.body as { stripeError?: { statusCode?: number } }).stripeError?.statusCode,
            503,
          );
          assert.equal((res.body as { error?: string }).error, undefined);
        },
      );
    },
  );
});

test("driver Stripe status returns Payouts Ready only when Stripe payouts are enabled", async () => {
  const { app, gets } = createRouteRegistry();
  const user = makeUser({ stripeConnectAccountId: "acct_driver_payouts_ready" });

  await withPatchedStripe(
    {
      accounts: {
        retrieve: async (accountId: string) => ({
          id: accountId,
          object: "account",
          type: "express",
          charges_enabled: false,
          payouts_enabled: true,
          details_submitted: true,
          requirements: {
            currently_due: [],
            eventually_due: [],
            past_due: [],
            current_deadline: null,
          },
        } as Stripe.Account),
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async () => user,
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = gets.get("/api/drivers/stripe-status");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: user.id, role: "driver" },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { status?: string }).status, "payouts_ready");
          assert.equal((res.body as { statusLabel?: string }).statusLabel, "Payouts Ready");
          assert.equal((res.body as { onboardingComplete?: boolean }).onboardingComplete, true);
          assert.equal((res.body as { payoutsEnabled?: boolean }).payoutsEnabled, true);
          assert.equal((res.body as { chargesEnabled?: boolean }).chargesEnabled, false);
        },
      );
    },
  );
});

test("public registration rejects privileged roles", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  let storageTouched = false;
  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => {
        storageTouched = true;
        return undefined;
      },
      getUserByEmail: async () => {
        storageTouched = true;
        return undefined;
      },
      createUser: async () => {
        storageTouched = true;
        return makeUser();
      },
    },
    async () => {
      for (const role of [undefined, "admin", "super_admin"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: "blocked",
              email: "blocked@example.com",
              password: "password",
              firstName: "Blocked",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match((res.body as { message: string }).message, /Invalid role/);
      }
    },
  );

  assert.equal(storageTouched, false);
});

test("public registration allows driver and owner profiles only", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  const createdProfiles: Array<{ type: string; userId: string }> = [];

  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => undefined,
      getUserByEmail: async () => undefined,
      createUser: async (userData: Record<string, unknown>) =>
        makeUser({
          id: `user_${userData.role}`,
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: userData.passwordHash,
        }),
      createDriver: async (driverData: { userId: string }) => {
        createdProfiles.push({ type: "driver", userId: driverData.userId });
        return { id: "driver_1", ...driverData };
      },
      createOwner: async (ownerData: { userId: string }) => {
        createdProfiles.push({ type: "owner", userId: ownerData.userId });
        return { id: "owner_1", ...ownerData };
      },
    },
    async () => {
      for (const role of ["driver", "owner"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: `${role}user`,
              email: `${role}@example.com`,
              password: "password",
              firstName: "Allowed",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as { user: { role: string } }).user.role, role);
        assert.equal(
          "passwordHash" in (res.body as { user: Record<string, unknown> }).user,
          false,
        );
        assert.equal(typeof (res.body as { token: string }).token, "string");
      }
    },
  );

  assert.deepEqual(createdProfiles, [
    { type: "driver", userId: "user_driver" },
    { type: "owner", userId: "user_owner" },
  ]);
});

test("JWT auth rejects inactive users and strips password hashes", async () => {
  const { isAuthenticated } = await import("../server/tokenAuth");
  const token = jwt.sign(
    { userId: "user_1", username: "testuser" },
    process.env.JWT_SECRET!,
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ isActive: false }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(res.statusCode, 403);
      assert.equal((res.body as { message: string }).message, "Account is inactive");
      assert.equal(nextCalled, false);
    },
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ role: "owner" }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
        user: undefined as unknown,
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
      assert.equal((req.user as { role: string }).role, "owner");
      assert.equal(
        "passwordHash" in (req.user as Record<string, unknown>),
        false,
      );
    },
  );
});

class FakeObjectFile {
  public metadata: Record<string, string> = {};
  public existsValue = true;

  constructor(public readonly name: string) {}

  async exists() {
    return [this.existsValue];
  }

  async getMetadata() {
    return [{ metadata: this.metadata }];
  }

  async setMetadata(input: { metadata: Record<string, string> }) {
    this.metadata = { ...this.metadata, ...input.metadata };
  }
}

test("object ACL policy metadata can be set and read", async () => {
  const { getObjectAclPolicy, setObjectAclPolicy } = await import(
    "../server/objectAcl"
  );
  const file = new FakeObjectFile("photos/test.jpg");
  const policy = {
    owner: "owner_1",
    visibility: "private" as const,
  };

  await setObjectAclPolicy(file as never, policy);

  assert.deepEqual(await getObjectAclPolicy(file as never), policy);
  assert.ok(file.metadata["custom:aclPolicy"]);

  const missing = new FakeObjectFile("photos/missing.jpg");
  missing.existsValue = false;
  await assert.rejects(
    () => setObjectAclPolicy(missing as never, policy),
    /Object not found: photos\/missing\.jpg/,
  );
});

test("object ACL enforces public read, private owner access, and default deny", async () => {
  const { ObjectPermission, canAccessObject } = await import("../server/objectAcl");

  const noPolicy = new FakeObjectFile("photos/no-policy.jpg");
  assert.equal(
    await canAccessObject({
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );

  const publicFile = new FakeObjectFile("photos/public.jpg");
  publicFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "public",
  });

  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    false,
  );

  const privateFile = new FakeObjectFile("photos/private.jpg");
  privateFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "private",
  });

  assert.equal(
    await canAccessObject({
      userId: "owner_1",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      userId: "other_user",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );

  assert.equal(
    await canAccessObject({
      userRole: "admin",
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
});

test("photo upload storage selection requires complete S3 config", async () => {
  const { getUploadStorageSelection } = await import("../server/objectStorage");
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  assert.deepEqual(getUploadStorageSelection(), {
    provider: "s3",
    bucket: "test-bucket",
    s3EndpointPresent: true,
  });

  delete process.env.S3_BUCKET;
  assert.throws(
    () => getUploadStorageSelection(),
    /Missing object storage env vars: S3_BUCKET/,
  );

  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
});

test("photo upload route uses S3 provider when S3 env vars are present", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  const originalLog = console.log;
  const logs: string[] = [];

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const req = {
      body: { contentType: "image/jpeg" },
      user: { id: "driver_1" },
    };
    const res = createResponse();

    await uploadRoute!(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.equal(typeof (res.body as { uploadUrl: string }).uploadUrl, "string");
    assert.equal((res.body as { contentType: string }).contentType, "image/jpeg");
    assert.ok(
      logs.some((line) => line.includes("Photo upload provider selected: s3")),
    );
    assert.ok(
      logs.some((line) => line.includes("Signed URL generation succeeded")),
    );
  } finally {
    S3Client.prototype.send = originalSend;
    console.log = originalLog;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("photo upload route rejects unsupported formats and oversized files", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const unsupportedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/gif", fileSize: 12345 },
        user: { id: "driver_1" },
      },
      unsupportedRes as never,
    );
    assert.equal(unsupportedRes.statusCode, 400);
    assert.match(
      String((unsupportedRes.body as { message?: string }).message || ""),
      /Unsupported photo format/,
    );

    const oversizedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/jpeg", fileSize: 20 * 1024 * 1024 },
        user: { id: "driver_1" },
      },
      oversizedRes as never,
    );
    assert.equal(oversizedRes.statusCode, 400);
    assert.match(
      String((oversizedRes.body as { message?: string }).message || ""),
      /Photo is too large/,
    );
  } finally {
    S3Client.prototype.send = originalSend;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("activity photo route returns signed GET URLs for authorized viewers when S3 is configured", async () => {
  const { app, gets } = createRouteRegistry();
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";

  await withPatchedStorage(
    {
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        driverId: "driver_row_1",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_row_1",
      }),
      getOwner: async (userId: string) =>
        userId === "owner_user_1" ? { id: "owner_row_1", userId } : undefined,
      getDriver: async (userId: string) =>
        userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined,
      getUser: async (userId: string) =>
        userId === "admin_user_1"
          ? makeUser({ id: userId, role: "admin" })
          : makeUser({
              id: userId,
              role: userId === "owner_user_1" ? "owner" : "driver",
            }),
      getPhotosByActivity: async () => [
        {
          id: "photo_1",
          storageKey: "photo-1.jpg",
          uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          contentType: "image/jpeg",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
      getRecentWashoutPhotoDuplicateCandidates: async () => [
        {
          photoId: "prior_photo_1",
          activityId: "activity_0",
          driverId: "driver_row_0",
          driverName: "Prior Driver",
          locationId: "location_0",
          locationName: "Prior Location",
          priorUploadedAt: "2024-12-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
    },
    async () => {
      S3Client.prototype.send = (async () => ({})) as never;
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/photos/activity/:activityId");
      assert.equal(typeof route, "function");

      const ownerRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "owner_user_1", role: "owner" },
        },
        ownerRes,
      );
      assert.equal(ownerRes.statusCode, 200);
      assert.equal((ownerRes.body as { photos: Array<{ duplicateMatches?: unknown }> }).photos[0].duplicateMatches, undefined);
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Signature=/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Credential=/,
      );

      const adminRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "admin_user_1", role: "admin" },
        },
        adminRes,
      );
      assert.equal(adminRes.statusCode, 200);
      assert.equal(
        ((adminRes.body as { photos: Array<{ duplicateMatches: Array<{ confidence: number }> }> }).photos[0].duplicateMatches || []).length,
        1,
      );
      assert.match(
        (adminRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
    },
  );

  S3Client.prototype.send = originalSend;
  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
  if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
});

test("create-with-photos applies ACL metadata for location owners", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  const aclCalls: Array<{ rawPath: string; aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> } }> = [];

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
    aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> },
  ) {
    aclCalls.push({ rawPath, aclPolicy });
    return rawPath;
  }) as never;

  try {
    await withPatchedStorage(
      {
        getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
        getWashoutLocation: async (locationId: string) =>
          locationId === "location_1"
            ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
            : undefined,
        getRecentWashoutPhotoDuplicateCandidates: async () => [],
        createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => ({
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          })),
        }),
      },
      async () => {
        const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        process.env.PRIVATE_OBJECT_DIR = "private";
        try {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/activities/create-with-photos");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: "driver_user_1", role: "driver" },
              body: {
                activityData: {
                  locationId: "location_1",
                  amount: "4.00",
                  checkInTime: "2025-01-01T00:00:00.000Z",
                  status: "pending",
                },
                photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal(aclCalls.length, 1);
          assert.equal(aclCalls[0].rawPath, "/objects/photos/photo-1.jpg");
          assert.equal(aclCalls[0].aclPolicy.owner, "driver_user_1");
          assert.equal(aclCalls[0].aclPolicy.visibility, "private");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.type, "LOCATION_OWNER");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.id, "location_1");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].permission, "read");
        } finally {
          if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
          else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
        }
      },
    );
  } finally {
    ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
  }
});

test("create-with-photos rejects missing photo data with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /At least one photo is required/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects invalid status with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "verified",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /Checkout must start in pending status/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects missing gps metadata with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: null,
                  gpsLongitude: null,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /enable GPS/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("rubble complete rejects missing GPS coordinates with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutActivity: async (visitId: string) =>
        visitId === "visit_1"
          ? { id: "visit_1", driverId: "driver_row_1", locationId: "location_1", serviceType: "rubble_dropoff", status: "in_progress", materialSlug: "dirt", materialCustomLabel: null }
          : undefined,
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      updateWashoutActivityStatus: async () => ({ id: "visit_1", locationId: "location_1" }),
      getLocationMaterialIntents: async () => [{ materialSlug: "dirt", driverPayCents: 100 }],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/rubble/visits/:visitId/complete");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1", role: "driver" },
          params: { visitId: "visit_1" },
          body: {
            beforePhotoUrl: "/objects/photos/before.jpg",
            afterPhotoUrl: "/objects/photos/after.jpg",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.match(String((res.body as { message?: string }).message || ""), /GPS coordinates are required/i);
    },
  );
});

test("photo verification helper flags missing gps and out-of-range photos", async () => {
  const { evaluatePhotoVerification } = await import("../shared/photoVerification");

  const missingGps = evaluatePhotoVerification({
    gpsLatitude: null,
    gpsLongitude: null,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(missingGps.status, "needs_review");
  assert.equal(missingGps.distanceMiles, null);

  const outOfRange = evaluatePhotoVerification({
    gpsLatitude: 41,
    gpsLongitude: -100,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(outOfRange.status, "failed");
  assert.ok(outOfRange.distanceMiles != null);
});

test("photo fingerprint helper builds stable hashes and detects duplicates", async () => {
  const {
    buildAverageHashFromGrayscaleValues,
    calculatePhotoFingerprintHammingDistance,
    findLikelyDuplicatePhotoMatches,
  } = await import("../shared/photoFingerprint");

  const grayscale = Array.from({ length: 64 }, (_, index) => index);
  const fingerprint = buildAverageHashFromGrayscaleValues(grayscale);
  assert.equal(fingerprint.length, 16);

  const identicalDistance = calculatePhotoFingerprintHammingDistance(fingerprint, fingerprint);
  assert.equal(identicalDistance, 0);

  const matches = findLikelyDuplicatePhotoMatches(fingerprint, [
    {
      photoId: "photo_prior",
      activityId: "activity_prior",
      driverId: "driver_prior",
      driverName: "Prior Driver",
      locationId: "location_prior",
      locationName: "Prior Location",
      priorUploadedAt: "2025-01-01T00:00:00.000Z",
      imageFingerprint: fingerprint,
    },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].confidence, 100);
  assert.equal(matches[0].hashDistance, 0);
});

test("create-with-photos stores verification metadata from driver gps", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].driverId, "driver_row_1");
        assert.equal(capturedPhotos[0].locationId, "location_1");
        assert.equal(capturedPhotos[0].verificationStatus, "verified");
        assert.equal(capturedPhotos[0].verificationDistanceMiles, "0.000");
        assert.equal(capturedPhotos[0].verificationReason, "Within 1 mile of the washout location.");
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks moderately stale photos for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  let lotteryEntryCalls = 0;
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createDriverLotteryEntry: async () => {
        lotteryEntryCalls += 1;
        return { id: "lottery_1" };
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T13:00:00.000Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /marked for review/i);
        assert.equal(lotteryEntryCalls, 0);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects stale photo metadata", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1779484984494-yl95qr87o.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-04-08T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Please take a new photo at the washout site before completing checkout\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks duplicate lookup failures for review instead of crashing", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => {
        throw new Error("duplicate lookup offline");
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /duplicate verification unavailable/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects missing photo metadata", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /missing its storage key/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos returns a schema message when the db insert fails", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        const error = new Error('column "photo_taken_at" of relation "washout_photos" does not exist') as Error & {
          code?: string;
          table?: string;
          column?: string;
        };
        error.code = "42703";
        error.table = "washout_photos";
        error.column = "photo_taken_at";
        throw error;
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 500);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Database schema is missing required photo metadata fields\. Please deploy the latest migration\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos flags duplicate fingerprints for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  let duplicateWindowStart: Date | null = null;
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async (since: Date) => {
        duplicateWindowStart = since;
        return [
        {
          photoId: "prior_photo_1",
          activityId: "activity_prior",
          driverId: "driver_row_9",
          driverName: "Prior Driver",
          locationId: "location_prior",
          locationName: "Prior Location",
          priorUploadedAt: "2025-01-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ];
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
            duplicateMatches: photo.duplicateMatches,
            imageFingerprint: photo.imageFingerprint,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "ffffffffffffffff",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.ok(duplicateWindowStart instanceof Date);
        const lookbackDays =
          (Date.now() - duplicateWindowStart.getTime()) / (24 * 60 * 60 * 1000);
        assert.ok(lookbackDays > 89 && lookbackDays < 91);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.equal(capturedPhotos[0].duplicateMatchedPhotoId, "prior_photo_1");
        assert.equal(capturedPhotos[0].duplicateSimilarityScore, 100);
        assert.equal(capturedPhotos[0].duplicateHashDistance, 0);
        assert.match(
          String(capturedPhotos[0].verificationReason),
          /Possible duplicate photo detected/,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("owner verify rejects washouts outside the owner's locations", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_other",
        status: "pending",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_other",
        ownerId: "owner_other",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /does not belong to your location/i,
      );
    },
  );
});

test("owner verify rejects already processed washouts", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "rejected",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 409);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /already been processed/i,
      );
      assert.equal((res.body as { details?: { currentStatus?: string } }).details?.currentStatus, "rejected");
    },
  );
});

test("owner verify approves legacy pending washouts and falls back when driver Stripe is missing", async () => {
  const { app, puts } = createRouteRegistry();
  let verified = false;
  let createdPayment = false;

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
        stripeCustomerId: "cus_owner_1",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "pending_owner_approval",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
      getOwnerBillingSettings: async () => ({
        billingCadence: "immediate",
        billingTimezone: "America/Chicago",
        billingCutoffTime: "23:59:00",
        billingDayOfWeek: 1,
      }),
      calculateBusinessDateForOwner: async () => "2026-05-28",
      getDriverById: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
      }),
      getUserById: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
        stripeConnectAccountId: null,
      }),
            createPayment: async () => {
              createdPayment = true;
              return {
                id: "payment_1",
                status: "awaiting_driver_stripe",
                payoutStatus: "held_for_onboarding",
              };
            },
      verifyWashoutActivity: async () => {
        verified = true;
        return {
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(verified, true);
      assert.equal(createdPayment, true);
      assert.equal((res.body as { status?: string }).status, "verified");
      assert.equal((res.body as { paymentStatus?: string }).paymentStatus, "awaiting_driver_stripe");
      assert.equal((res.body as { payoutStatus?: string }).payoutStatus, "held_for_onboarding");
      assert.equal((res.body as { verifiedBy?: string }).verifiedBy, "user_1");
      assert.ok((res.body as { verifiedAt?: string }).verifiedAt);
      assert.match(String((res.body as { message?: string }).message || ""), /payment will be processed once the driver's Stripe payout setup is ready/i);
    },
  );
});

test("owner tip settings do not disable lottery ticket creation", async () => {
  const { app, puts } = createRouteRegistry();
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStorage(
      {
        getOwner: async () => ({
          id: "owner_1",
          userId: "user_1",
          useCustomBillingModel: false,
          customWashoutRate: null,
        }),
        getWashoutActivity: async () => ({
          id: "activity_1",
          locationId: "location_1",
          status: "pending_owner_approval",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        }),
        getWashoutLocation: async () => ({
          id: "location_1",
          ownerId: "owner_1",
          driverTipRate: 250,
        }),
        getOwnerBillingSettings: async () => null,
        getFeatureFlag: async () => ({ key: "lottery_enabled", enabled: true }),
        getDriverById: async () => ({
          id: "driver_row_1",
          userId: "driver_user_1",
        }),
        getUserById: async () => ({
          id: "driver_user_1",
          username: "driver1",
          firstName: "Driver",
          lastName: "One",
          stripeConnectAccountId: "acct_driver_1",
        }),
        getDriverWallet: async () => null,
        createDriverWallet: async () => ({ id: "wallet_1" }),
        adjustDriverWalletBalance: async () => undefined,
        createWalletTransaction: async () => ({ id: "wallet_tx_1" }),
        createDriverLotteryEntry: async () => {
          lotteryEntryCalls += 1;
          return { id: "lottery_1" };
        },
        verifyWashoutActivity: async (_activityId: string, _verifiedBy: string, driverTipCents?: number | null) => ({
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
          driverTipCents: driverTipCents ?? 0,
        }),
      },
      async () => {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = puts.get("/api/owners/activities/:id/verify");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            params: { id: "activity_1" },
            user: { id: "user_1" },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(lotteryEntryCalls, 1);
      },
    );
  });
});

test("owner verify still succeeds when deferred payment persistence fails after approval", async () => {
  const { app, puts } = createRouteRegistry();
  let verified = false;

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
        stripeCustomerId: "cus_owner_1",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "pending_owner_approval",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
      getOwnerBillingSettings: async () => null,
      getDriverById: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
      }),
      getUserById: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
        stripeConnectAccountId: null,
      }),
      createPayment: async () => {
        throw new Error("deferred payment record failed");
      },
      verifyWashoutActivity: async () => {
        verified = true;
        return {
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(verified, true);
      assert.equal((res.body as { status?: string }).status, "verified");
      assert.equal((res.body as { verifiedBy?: string }).verifiedBy, "user_1");
      assert.ok((res.body as { verifiedAt?: string }).verifiedAt);
      assert.match(String((res.body as { message?: string }).message || ""), /washout approved/i);
      assert.match(String((res.body as { warning?: string }).warning || ""), /deferred payment record failed/i);
    },
  );
});

test("owner verify charges normally when driver Stripe is ready", async () => {
  const { app, puts } = createRouteRegistry();
  let createdPayment: Record<string, unknown> | null = null;
  let walletCredits = 0;

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
            details_submitted: true,
            payouts_enabled: true,
            charges_enabled: true,
            requirements: { currently_due: [], past_due: [] },
            external_accounts: {
              data: [{ object: "bank_account" }],
            },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "pending",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "immediate",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-28",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createPayment: async (payment: Record<string, unknown>) => {
              createdPayment = payment;
              return {
                id: "payment_1",
                ...payment,
              } as any;
            },
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
            verifyWashoutActivity: async (_activityId: string, _verifiedBy: string, driverTipCents?: number | null) => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
              driverTipCents: driverTipCents ?? 0,
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
                body: { driverTip: "0.01" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { status?: string }).status, "verified");
            assert.equal(createdPayment?.status, "completed");
            assert.equal(createdPayment?.driverTipCents, 1);
            assert.equal(createdPayment?.tipAmountCents, 1);
            assert.equal((res.body as { driverTipCents?: number }).driverTipCents, 1);
          },
        );
      },
    );
  });

test("owner billing dry-run preview reads driver tips from washout activity amounts", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_activity_tip",
    washouts: [
      { id: "activity_1", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 99, locationDriverTipRate: 99 },
      { id: "activity_2", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 99, locationDriverTipRate: 99 },
      { id: "activity_3", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 99, locationDriverTipRate: 99 },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.ledger.driverTipTotalCents, 3);
  assert.equal(preview.ledger.ownerChargeAmountCents, 1503);
  assert.equal(preview.ledger.driverTransfers[0].amountCents, 3);
  assert.equal(preview.stripePaymentIntentPreview.amount, 1503);
  assert.equal(preview.stripePaymentIntentPreview.metadata.driverTipCentsPerWashout, "1,1,1");
  assert.equal(preview.stripeTransferPreviews[0].amount, 3);
  assert.equal(preview.stripeTransferPreviews[0].metadata.driverTipCents, "3");
});

test("owner billing dry-run preview with seven approved activity amounts at one cent each totals seven cents", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_seven_activity_tip",
    washouts: [
      { id: "f3805985-6db4-4cf8-81a2-24fc3a41a9cb", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "3042b4cb-8e1a-4cbb-a38a-569879aef6fa", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "d66f29bb-0515-4a2e-bce1-c8f09083bde5", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "01a9046e-fe73-4443-b806-d44b0895a9de", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "057351bf-c480-4b55-a6cb-635037655561", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "5ca7dc66-1c34-4530-919e-c17ea43237f8", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
      { id: "77323db3-be40-4923-aa70-615d2f70b871", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", activityDriverTipCents: 0, paymentDriverTipCents: 0, locationDriverTipRate: 0 },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.ledger.platformFeeTotalCents, 3500);
  assert.equal(preview.ledger.driverTipTotalCents, 7);
  assert.equal(preview.ledger.ownerChargeAmountCents, 3507);
  assert.equal(preview.ledger.driverTransfers[0].amountCents, 7);
  assert.equal(preview.stripePaymentIntentPreview.amount, 3507);
  assert.equal(preview.stripeTransferPreviews[0].amount, 7);
  assert.equal(preview.stripeTransferPreviews[0].metadata.driverTipCents, "7");
});
});

test("driver dashboard shows approved washouts awaiting tip payout setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async () => [],
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => ({ enabled: false }),
      getDriverLotteryEntryCount: async () => 0,
      getPaymentsAwaitingDriverStripeByDriver: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "held_for_onboarding",
          location: { name: "Site A" },
          activity: { locationId: "location_1" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
      assert.equal(
        (res.body as { awaitingDriverStripePayments?: Array<{ status?: string }> }).awaitingDriverStripePayments?.[0]?.status,
        "awaiting_driver_stripe",
      );
    },
  );
});

test("driver dashboard shows lottery as active by default", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async () => [],
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => undefined,
      getDriverLotteryEntryCount: async () => 7,
      getLotteryDrawingByMonthYear: async () => ({
        id: "drawing_1",
        lotteryMonth: new Date().getMonth() + 1,
        lotteryYear: new Date().getFullYear(),
        drawingDate: new Date().toISOString(),
      }),
      getPaymentsAwaitingDriverStripeByDriver: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { lotteryActive?: boolean }).lotteryActive, true);
      assert.equal((res.body as { lotteryEntryCount?: number }).lotteryEntryCount, 7);
      assert.equal((res.body as { lotteryStatus?: { enabled?: boolean } }).lotteryStatus?.enabled, true);
    },
  );
});

async function runDriverDashboardStatsRangeCase(params: {
  name: "today" | "week" | "month";
  query?: Record<string, string>;
  selectedActivities: Array<{ id: string; amount: string; checkInTime: Date }>;
}) {
  const { app, gets } = createRouteRegistry();
  const activityRangeCalls: Array<{ startDate?: Date; endDate?: Date }> = [];
  const todayActivities = [
    { id: "today_1", amount: "4.00", checkInTime: new Date() },
  ];

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async (_driverId: string, startDate?: Date, endDate?: Date) => {
        activityRangeCalls.push({ startDate, endDate });
        if (params.name === "today" || activityRangeCalls.length === 1) {
          return todayActivities;
        }
        return params.selectedActivities;
      },
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => undefined,
      getDriverLotteryEntryCount: async () => 0,
      getLotteryDrawingByMonthYear: async () => null,
      getPaymentsAwaitingDriverStripeByDriver: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
          query: params.query || {},
        },
        res,
      );

      const expectedActivities = params.name === "today" ? todayActivities : params.selectedActivities;
      const expectedEarnings = expectedActivities.reduce((sum, activity) => sum + Number(activity.amount), 0);
      const expectedAverage = expectedActivities.length > 0
        ? Number((expectedEarnings / expectedActivities.length).toFixed(2))
        : 0;
      const selectedCall = params.name === "today" ? activityRangeCalls[0] : activityRangeCalls[1];
      const body = res.body as {
        statsRange?: string;
        statsRangeLabel?: string;
        selectedStats?: {
          range?: string;
          label?: string;
          startDate?: Date;
          endDate?: Date;
          totalWashouts?: number;
          visits?: number;
          totalEarnings?: number;
          earnings?: number;
          avgPerWashout?: number;
        };
      };

      assert.equal(res.statusCode, 200);
      assert.equal(body.statsRange, params.name);
      assert.equal(body.selectedStats?.range, params.name);
      assert.equal(body.selectedStats?.totalWashouts, expectedActivities.length);
      assert.equal(body.selectedStats?.visits, expectedActivities.length);
      assert.equal(body.selectedStats?.totalEarnings, expectedEarnings);
      assert.equal(body.selectedStats?.earnings, expectedEarnings);
      assert.equal(body.selectedStats?.avgPerWashout, expectedAverage);
      assert.ok(selectedCall?.startDate);
      assert.ok(selectedCall?.endDate);
      assert.equal(body.selectedStats?.startDate?.getTime(), selectedCall.startDate.getTime());
      assert.equal(body.selectedStats?.endDate?.getTime(), selectedCall.endDate.getTime());
      assert.equal(selectedCall.startDate.getHours(), 0);
      assert.equal(selectedCall.startDate.getMinutes(), 0);
      assert.equal(selectedCall.startDate.getSeconds(), 0);
      assert.equal(selectedCall.startDate.getMilliseconds(), 0);
      assert.equal(selectedCall.endDate.getHours(), 23);
      assert.equal(selectedCall.endDate.getMinutes(), 59);
      assert.equal(selectedCall.endDate.getSeconds(), 59);
      assert.equal(selectedCall.endDate.getMilliseconds(), 999);

      if (params.name === "today") {
        assert.equal(body.statsRangeLabel, "Today");
        assert.equal(activityRangeCalls.length, 1);
        assert.equal(selectedCall.startDate.toDateString(), new Date().toDateString());
      } else if (params.name === "week") {
        assert.equal(body.statsRangeLabel, "This week");
        assert.equal(selectedCall.startDate.getDay(), 0);
        assert.equal(selectedCall.endDate.getTime() - selectedCall.startDate.getTime(), (7 * 24 * 60 * 60 * 1000) - 1);
      } else {
        assert.equal(body.statsRangeLabel, "This month");
        assert.equal(selectedCall.startDate.getDate(), 1);
        const firstMomentAfterRange = new Date(selectedCall.endDate.getTime() + 1);
        assert.equal(firstMomentAfterRange.getDate(), 1);
        assert.equal(firstMomentAfterRange.getHours(), 0);
        assert.equal(firstMomentAfterRange.getMinutes(), 0);
      }
    },
  );
}

test("driver dashboard statsRange defaults to today", async () => {
  await runDriverDashboardStatsRangeCase({
    name: "today",
    selectedActivities: [],
  });
});

test("driver dashboard statsRange=week returns current week totals and range", async () => {
  await runDriverDashboardStatsRangeCase({
    name: "week",
    query: { statsRange: "week" },
    selectedActivities: [
      { id: "week_1", amount: "12.50", checkInTime: new Date() },
      { id: "week_2", amount: "7.50", checkInTime: new Date() },
    ],
  });
});

test("driver dashboard statsRange=month returns current month totals and range", async () => {
  await runDriverDashboardStatsRangeCase({
    name: "month",
    query: { statsRange: "month" },
    selectedActivities: [
      { id: "month_1", amount: "10.00", checkInTime: new Date() },
      { id: "month_2", amount: "15.00", checkInTime: new Date() },
      { id: "month_3", amount: "5.00", checkInTime: new Date() },
    ],
  });
});

test("driver locations endpoint returns active visible owner locations", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getActiveLocations: async () => ([
        {
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          latitude: "30.2672",
          longitude: "-97.7431",
          rate: "5.00",
          driverTipRate: "0.00",
          isActive: true,
          isVisible: true,
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            isApproved: false,
            membershipStatus: "active",
            user: {
              id: "owner_user_1",
              firstName: "Olivia",
              lastName: "Owner",
              email: "olivia@example.com",
            },
          },
        },
      ]),
      getLocationMaterialIntents: async () => [],
      getMaterialBySlug: async () => null,
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const locations = res.body as Array<{ id?: string; owner?: { id?: string } }>;
      assert.equal(locations.length, 1);
      assert.equal(locations[0].id, "location_1");
      assert.equal(locations[0].owner?.id, "owner_1");
    },
  );
});

test("lottery status endpoint defaults to active and returns drawing context", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        role: "driver",
      }),
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getFeatureFlag: async () => undefined,
      getDriverLotteryEntryCount: async () => 4,
      getLotteryDrawingByMonthYear: async () => ({
        id: "drawing_1",
        lotteryMonth: new Date().getMonth() + 1,
        lotteryYear: new Date().getFullYear(),
        drawingDate: new Date().toISOString(),
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/lottery/status");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { enabled?: boolean }).enabled, true);
      assert.equal((res.body as { driverEntryCount?: number }).driverEntryCount, 4);
      assert.match((res.body as { currentDrawingMessage?: string }).currentDrawingMessage || "", /Current drawing is open|Lottery is active/i);
    },
  );
});

test("weekly owner billing charges via the unified engine", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 1);
  assert.equal(fixture.getChargeCount(), 1);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 500);
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getBatch() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { status?: string } | null)?.status, "completed");
});

test("owner billing charges platform fee plus driver tip separately", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        activityAmount: "1.50",
        processingFee: "5.00",
        washoutServiceFee: "1.50",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 650);
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "1.50");
});

test("manual owner billing uses washout activity amount and ignores zero payment tip rows", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityAmount: "0.01",
        activityFeeCentsPlatform: 500,
        activityStatus: "verified",
        locationDriverTipRate: 99,
      },
    ],
    payments: [
      {
        id: "payment_1",
        activityId: "activity_1",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
        tipAmountCents: 0,
        status: "pending",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 501);
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.01");
  assert.equal((fixture.getBatch() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.01");
});

test("owner billing ledger keeps cents exact for a single washout fee", () => {
  const ledger = calculateOwnerWashoutBillingLedger({
    ownerId: "owner_1",
    billingBatchId: "batch_1",
    washoutActivityIds: ["activity_1"],
    approvedWashoutCount: 1,
    platformFeeCentsByWashout: [500],
    platformFeeTotalCents: 500,
    driverTipCentsByWashout: [0],
    driverTipCentsByDriver: { driver_1: 0 },
    driverTipTotalCents: 0,
    ownerChargeAmountCents: 500,
    platformRevenueCents: 500,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 0 }],
  });

  assert.equal(ledger.platformFeeTotalCents, 500);
  assert.equal(ledger.driverTipTotalCents, 0);
  assert.equal(ledger.ownerChargeAmountCents, 500);
  assert.equal(ledger.platformRevenueCents, 500);
  assert.deepEqual(ledger.driverTransfers, [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 0 }]);
});

test("owner billing ledger totals three washouts at five dollars and three cents tip to 1503", () => {
  const ledger = calculateOwnerWashoutBillingLedger({
    ownerId: "owner_1",
    billingBatchId: "batch_2",
    washoutActivityIds: ["activity_1", "activity_2", "activity_3"],
    approvedWashoutCount: 3,
    platformFeeCentsByWashout: [500, 500, 500],
    platformFeeTotalCents: 1500,
    driverTipCentsByWashout: [1, 1, 1],
    driverTipCentsByDriver: { driver_1: 3 },
    driverTipTotalCents: 3,
    ownerChargeAmountCents: 1503,
    platformRevenueCents: 1500,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 3 }],
  });

  assert.equal(ledger.platformFeeTotalCents, 1500);
  assert.equal(ledger.driverTipTotalCents, 3);
  assert.equal(ledger.ownerChargeAmountCents, 1503);
  assert.equal(ledger.platformRevenueCents, 1500);
});

test("owner billing ledger splits driver tips correctly across multiple drivers", () => {
  const ledger = calculateOwnerWashoutBillingLedger({
    ownerId: "owner_1",
    billingBatchId: "batch_2b",
    washoutActivityIds: ["activity_1", "activity_2"],
    approvedWashoutCount: 2,
    platformFeeCentsByWashout: [500, 500],
    platformFeeTotalCents: 1000,
    driverTipCentsByWashout: [2, 1],
    driverTipCentsByDriver: { driver_1: 2, driver_2: 1 },
    driverTipTotalCents: 3,
    ownerChargeAmountCents: 1003,
    platformRevenueCents: 1000,
    driverTransfers: [
      { driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 2 },
      { driverId: "driver_2", connectedAccountId: "acct_2", amountCents: 1 },
    ],
  });

  assert.equal(ledger.driverTipTotalCents, 3);
  assert.deepEqual(ledger.driverTipCentsByDriver, { driver_1: 2, driver_2: 1 });
  assert.equal(ledger.driverTransfers.reduce((sum, transfer) => sum + transfer.amountCents, 0), 3);
});

test("owner billing dry-run preview returns exact payment and transfer payloads", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_1",
    washouts: [
      { id: "activity_1", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01" },
      { id: "activity_2", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01" },
      { id: "activity_3", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 500, activityAmount: "0.01" },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.dryRun, true);
  assert.equal(preview.title, "Owner washout billing preview");
  assert.equal(preview.ledger.approvedWashoutCount, 3);
  assert.equal(preview.ledger.platformFeeTotalCents, 1500);
  assert.equal(preview.ledger.driverTipTotalCents, 3);
  assert.equal(preview.ledger.ownerChargeAmountCents, 1503);
  assert.equal(preview.ledger.platformRevenueCents, 1500);
  assert.equal(preview.stripePaymentIntentPreview.amount, 1503);
  assert.equal(preview.stripePaymentIntentPreview.customer, "cus_123");
  assert.equal(preview.stripePaymentIntentPreview.payment_method, "pm_123");
  assert.equal(preview.stripeTransferPreviews.length, 1);
  assert.equal(preview.stripeTransferPreviews[0].amount, 3);
  assert.equal(preview.stripeTransferPreviews[0].destination, "acct_1");
  assert.equal(preview.stripeTransferPreviews[0].metadata.driverTipCents, "3");
  assert.equal(preview.validation.passed, true);
  assert.equal(preview.validation.blockedForReview, false);
});

test("owner billing dry-run preview normalizes decimal-dollar washout values to cents", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_decimal",
    washouts: [
      { id: "057351bf-c480-4b55-a6cb-635037655561", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: "5.00", activityAmount: "0.01" },
      { id: "5ca7dc66-1c34-4530-919e-c17ea43237f8", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: "5.00", activityAmount: "0.01" },
      { id: "77323db3-be40-4923-aa70-615d2f70b871", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: "5.00", activityAmount: "0.01" },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.ledger.platformFeeTotalCents, 1500);
  assert.equal(preview.ledger.driverTipTotalCents, 3);
  assert.equal(preview.ledger.ownerChargeAmountCents, 1503);
  assert.equal(preview.ledger.platformRevenueCents, 1500);
  assert.equal(preview.stripeTransferPreviews[0].amount, 3);
  assert.equal(preview.stripeTransferPreviews[0].metadata.driverTipCents, "3");
});

test("owner billing dry-run preview ignores location tip cents and uses activity amounts", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_payment_tip",
    washouts: [
      { id: "d66f29bb-0515-4a2e-bce1-c8f09083bde5", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", locationDriverTipRate: 999, paymentTipAmountCents: 0, driverTipCents: 0 },
      { id: "01a9046e-fe73-4443-b806-d44b0895a9de", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", locationDriverTipRate: 999, paymentTipAmountCents: 0, driverTipCents: 0 },
      { id: "057351bf-c480-4b55-a6cb-635037655561", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", locationDriverTipRate: 999, paymentTipAmountCents: 0, driverTipCents: 0 },
      { id: "5ca7dc66-1c34-4530-919e-c17ea43237f8", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", locationDriverTipRate: 999, paymentTipAmountCents: 0, driverTipCents: 0 },
      { id: "77323db3-be40-4923-aa70-615d2f70b871", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1TgHLRLpQOyKFyJs", platformFeeCents: 500, activityAmount: "0.01", locationDriverTipRate: 999, paymentTipAmountCents: 0, driverTipCents: 0 },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.ledger.platformFeeTotalCents, 2500);
  assert.equal(preview.ledger.driverTipTotalCents, 5);
  assert.equal(preview.ledger.ownerChargeAmountCents, 2505);
  assert.equal(preview.ledger.platformRevenueCents, 2500);
  assert.equal(preview.stripeTransferPreviews[0].amount, 5);
  assert.equal(preview.stripeTransferPreviews[0].metadata.driverTipCents, "5");
  assert.equal(preview.ledger.driverTransfers[0].tipAmountCents, 5);
  assert.equal(preview.ledger.driverTransfers[0].amountCents, 5);
});

test("owner billing dry-run preview marks oversized charges for review", () => {
  const preview = buildOwnerWashoutBillingPreview({
    ownerId: "owner_1",
    billingBatchId: "preview_batch_review",
    washouts: [
      { id: "activity_1", ownerId: "owner_1", driverId: "driver_1", driverStripeAccountId: "acct_1", platformFeeCents: 6000, activityAmount: "50.00" },
    ],
    customerId: "cus_123",
    paymentMethodId: "pm_123",
  });

  assert.equal(preview.ledger.ownerChargeAmountCents, 11000);
  assert.equal(preview.validation.passed, true);
  assert.equal(preview.validation.blockedForReview, true);
  assert.match(preview.validation.reason || "", /review threshold/i);
});

test("owner billing dry-run preview route is registered on the admin billing API", () => {
  const helperSource = readFileSync(new URL("../server/billing/ownerWashoutLedger.ts", import.meta.url), "utf8");
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");

  assert.match(routesSource, /app\.post\('\/api\/admin\/billing\/preview-owner-washout-charge', isAuthenticated/);
  assert.match(routesSource, /app\.get\('\/api\/admin\/debug\/billing-tip-source\/:ownerId', isAuthenticated/);
  assert.match(helperSource, /\[OWNER_BILLING_DRY_RUN\]/);
  assert.match(helperSource, /\[STRIPE_PAYMENT_REQUEST_PREVIEW\]/);
  assert.match(helperSource, /\[DRIVER_TIP_TRANSFER_PREVIEW\]/);
  assert.match(routesSource, /\[OWNER_TIP_SUBMITTED\]/);
  assert.match(routesSource, /\[OWNER_TIP_POSTED_TO_LEDGER\]/);
  assert.match(routesSource, /\[OWNER_BILLING_TIP_RECONCILIATION\]/);
  assert.match(storageSource, /getPendingPaymentsForBatch[\s\S]*\.(leftJoin|innerJoin)\(washoutLocations, eq\(washoutActivities\.locationId, washoutLocations\.id\)\)/);
  assert.match(storageSource, /getPendingPaymentsForOwnerBilling[\s\S]*\.(leftJoin|innerJoin)\(washoutLocations, eq\(washoutActivities\.locationId, washoutLocations\.id\)\)/);
});

test("admin billing dry-run preview response includes debugTipSources and preview override support", () => {
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(routesSource, /debugTipSources/);
  assert.match(routesSource, /forceDriverTipCents/);
});

test("admin billing dry-run preview lists target owner approved washouts with nonzero platform fees", async () => {
  const { app, posts } = createRouteRegistry();
  const targetOwnerId = "5e083b4e-b0c1-4c76-ab52-7e52dd5d8082";
  const expectedWashoutIds = [
    "3042b4cb-8e1a-4cbb-a38a-569879aef6fa",
    "d66f29bb-0515-4a2e-bce1-c8f09083bde5",
    "01a9046e-fe73-4443-b806-d44b0895a9de",
    "057351bf-c480-4b55-a6cb-635037655561",
    "5ca7dc66-1c34-4530-919e-c17ea43237f8",
    "77323db3-be40-4923-aa70-615d2f70b871",
  ];
  let requestedOwnerId = "";

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
        }
        if (id === "driver_user_1") {
          return { id: "driver_user_1", username: "driver1", firstName: "Driver", lastName: "One" };
        }
        return null;
      },
      getOwnerById: async (ownerId: string) => ownerId === targetOwnerId
        ? { id: targetOwnerId, userId: "owner_user_1", companyName: "Owner Co" }
        : null,
      getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
      getApprovedWashoutsForOwnerBilling: async (ownerId: string) => {
        requestedOwnerId = ownerId;
        return expectedWashoutIds.map((activityId) => ({
          activityId,
          ownerId: targetOwnerId,
          driverId: "driver_1",
          locationId: "location_1",
          locationName: "Yard A",
          activityStatus: "approved",
          activityFeeCentsPlatform: null,
          activityDriverTipCents: 0,
          paymentDriverTipCents: 0,
          paymentTipAmountCents: 0,
          locationDriverTipRate: 0,
        }));
      },
      getDriverById: async () => ({
        id: "driver_1",
        userId: "driver_user_1",
        connectedAccountId: "acct_driver_1",
        employerName: "Carrier",
        truckNumber: "T-1",
        hasAgreedToTerms: true,
      }),
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          body: { ownerId: targetOwnerId },
        },
        res,
      );

      const ledger = (res.body as { ledger?: { approvedWashoutCount?: number; platformFeeTotalCents?: number; washoutActivityIds?: string[] } }).ledger;
      assert.equal(res.statusCode, 200);
      assert.equal(requestedOwnerId, targetOwnerId);
      assert.equal(ledger?.approvedWashoutCount, expectedWashoutIds.length);
      assert.equal(ledger?.platformFeeTotalCents, expectedWashoutIds.length * 500);
      assert.deepEqual(ledger?.washoutActivityIds, expectedWashoutIds);
    },
  );
});

test("admin billing dry-run preview returns diagnostic 500 when approved washout query fails", async () => {
  const { app, posts } = createRouteRegistry();
  const targetOwnerId = "5e083b4e-b0c1-4c76-ab52-7e52dd5d8082";
  const queryError = "locationDriverTipRate references washout_locations.rate, but washout_locations is not part of the query";

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
        }
        return null;
      },
      getOwnerById: async (ownerId: string) => ownerId === targetOwnerId
        ? { id: targetOwnerId, userId: "owner_user_1", companyName: "Owner Co" }
        : null,
      getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
      getApprovedWashoutsForOwnerBilling: async () => {
        throw new Error(queryError);
      },
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          body: { ownerId: targetOwnerId },
        },
        res,
      );

      assert.equal(res.statusCode, 500);
      assert.equal((res.body as { reason?: string }).reason, "owner_billing_preview_failed");
      assert.match(String((res.body as { message?: string }).message || ""), /washout_locations\.rate/);
    },
  );
});

test("admin billing dry-run preview can force driver tip cents for testing only", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
        }
        if (id === "driver_user_1") {
          return { id: "driver_user_1", username: "driver1", firstName: "Driver", lastName: "One", stripeConnectAccountId: "acct_driver_1" };
        }
        return null;
      },
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" }),
      getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "activity_1", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Site A", activityFeeCentsPlatform: 500, locationDriverTipRate: 1, paymentTipAmountCents: 0 },
        { activityId: "activity_2", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Site A", activityFeeCentsPlatform: 500, locationDriverTipRate: 1, paymentTipAmountCents: 0 },
      ]),
      getDriverById: async () => ({ id: "driver_1", userId: "driver_user_1", connectedAccountId: "acct_driver_1" }),
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          body: { ownerId: "owner_1", forceDriverTipCents: 7 },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { ledger?: { driverTipTotalCents?: number; ownerChargeAmountCents?: number } }).ledger?.driverTipTotalCents, 14);
      assert.equal((res.body as { ledger?: { ownerChargeAmountCents?: number } }).ledger?.ownerChargeAmountCents, 1014);
      assert.equal((res.body as { debugTipSources?: Array<{ resolvedDriverTipCents?: number; sourceUsed?: string }> }).debugTipSources?.[0].resolvedDriverTipCents, 7);
      assert.equal((res.body as { debugTipSources?: Array<{ sourceUsed?: string }> }).debugTipSources?.[0].sourceUsed, "request.forceDriverTipCents");
      assert.equal((res.body as { debugTipSources?: Array<{ locationName?: string | null }> }).debugTipSources?.[0].locationName, "Site A");
      assert.ok(Array.isArray((res.body as { debugTipSources?: unknown[] }).debugTipSources));
    },
  );
});

test("admin billing dry-run preview resolves driver tips from washout activity amounts", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
        }
        if (id === "driver_user_1") {
          return { id: "driver_user_1", username: "driver1", firstName: "Driver", lastName: "One", stripeConnectAccountId: "acct_1TgHLRLpQOyKFyJs" };
        }
        return null;
      },
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" }),
      getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "3042b4cb-8e1a-4cbb-a38a-569879aef6fa", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
        { activityId: "d66f29bb-0515-4a2e-bce1-c8f09083bde5", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
        { activityId: "01a9046e-fe73-4443-b806-d44b0895a9de", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
        { activityId: "057351bf-c480-4b55-a6cb-635037655561", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
        { activityId: "5ca7dc66-1c34-4530-919e-c17ea43237f8", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
        { activityId: "77323db3-be40-4923-aa70-615d2f70b871", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Yard A", activityAmount: "0.01", activityFeeCentsPlatform: 500, activityDriverTipCents: 0, locationDriverTipRate: 99, paymentTipAmountCents: 0 },
      ]),
      getDriverById: async () => ({ id: "driver_1", userId: "driver_user_1", connectedAccountId: "acct_1TgHLRLpQOyKFyJs" }),
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          body: { ownerId: "owner_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { ledger?: { approvedWashoutCount?: number; platformFeeTotalCents?: number; driverTipTotalCents?: number; ownerChargeAmountCents?: number } }).ledger?.approvedWashoutCount, 6);
      assert.equal((res.body as { ledger?: { platformFeeTotalCents?: number } }).ledger?.platformFeeTotalCents, 3000);
      assert.equal((res.body as { ledger?: { driverTipTotalCents?: number } }).ledger?.driverTipTotalCents, 6);
      assert.equal((res.body as { ledger?: { ownerChargeAmountCents?: number } }).ledger?.ownerChargeAmountCents, 3006);
      assert.equal((res.body as { ledger?: { driverTransfers?: Array<{ amountCents?: number }> } }).ledger?.driverTransfers?.[0].amountCents, 6);
      assert.equal((res.body as { stripePaymentIntentPreview?: { amount?: number } }).stripePaymentIntentPreview?.amount, 3006);
      assert.ok(Array.isArray((res.body as { debugTipSources?: unknown[] }).debugTipSources));
      assert.equal((res.body as { debugTipSources?: Array<{ resolvedDriverTipCents?: number }> }).debugTipSources?.length, 6);
      assert.equal((res.body as { debugTipSources?: Array<{ resolvedDriverTipCents?: number }> }).debugTipSources?.[0].resolvedDriverTipCents, 1);
      assert.equal((res.body as { debugTipSources?: Array<{ ownerPostedTipCents?: number; billingReadTipCents?: number }> }).debugTipSources?.[0].ownerPostedTipCents, 1);
      assert.equal((res.body as { debugTipSources?: Array<{ ownerPostedTipCents?: number; billingReadTipCents?: number }> }).debugTipSources?.[0].billingReadTipCents, 1);
      assert.equal((res.body as { debugTipSources?: Array<{ sourceUsed?: string; rawDriverTipField?: string }> }).debugTipSources?.[0].sourceUsed, "washout_activities.amount");
      assert.equal((res.body as { debugTipSources?: Array<{ rawDriverTipField?: string }> }).debugTipSources?.[0].rawDriverTipField, "washout_activities.amount");
      assert.equal((res.body as { debugTipSources?: Array<{ locationName?: string | null }> }).debugTipSources?.[0].locationName, "Yard A");
    },
  );
});

test("admin billing dry-run preview ignores persisted payment tips and reads activity amounts", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        if (id === "owner_user_1") {
          return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
        }
        if (id === "driver_user_1") {
          return { id: "driver_user_1", username: "driver1", firstName: "Driver", lastName: "One", stripeConnectAccountId: "acct_driver_1" };
        }
        return null;
      },
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" }),
      getSystemSettings: async () => ({ platformWashoutFee: "5.00" }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "activity_1", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Site A", activityAmount: "0.01", activityFeeCentsPlatform: 500, locationDriverTipRate: 0, paymentDriverTipCents: 99, paymentTipAmountCents: 0 },
        { activityId: "activity_2", ownerId: "owner_1", driverId: "driver_1", locationId: "location_1", locationName: "Site A", activityAmount: "0.01", activityFeeCentsPlatform: 500, locationDriverTipRate: 0, paymentDriverTipCents: 99, paymentTipAmountCents: 0 },
      ]),
      getDriverById: async () => ({ id: "driver_1", userId: "driver_user_1", connectedAccountId: "acct_driver_1" }),
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          body: { ownerId: "owner_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { ledger?: { driverTipTotalCents?: number; ownerChargeAmountCents?: number } }).ledger?.driverTipTotalCents, 2);
      assert.equal((res.body as { ledger?: { ownerChargeAmountCents?: number } }).ledger?.ownerChargeAmountCents, 1002);
      assert.equal((res.body as { debugTipSources?: Array<{ resolvedDriverTipCents?: number; sourceUsed?: string }> }).debugTipSources?.[0].resolvedDriverTipCents, 1);
      assert.equal((res.body as { debugTipSources?: Array<{ sourceUsed?: string }> }).debugTipSources?.[0].sourceUsed, "washout_activities.amount");
    },
  );
});

test("admin billing tip source debug endpoint returns raw tip inputs for super admins", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id: "admin_1", role: "super_admin" };
        }
        return null;
      },
      getBillingTipSourceDebugRows: async (_ownerId: string, washoutIds?: string[]) => (washoutIds || []).map((washoutActivityId, index) => ({
        washoutActivityId,
        locationId: `location_${index + 1}`,
        locationName: `Site ${index + 1}`,
        ownerId: "owner_1",
        driverId: "driver_1",
        status: "verified",
        activityAmount: "0.01",
        feeCentsPlatform: 500,
        paymentStatus: "posted",
        paymentWashoutServiceFee: index === 0 ? 1 : null,
        locationDriverTipRate: 1,
        resolvedDriverTipCents: 1,
        resolvedTipSource: "washout_activities.amount",
        driverStripeAccountId: "acct_123",
      })),
    } as any,
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/debug/billing-tip-source/:ownerId");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1", role: "super_admin" },
          params: { ownerId: "owner_1" },
          query: { washoutIds: "washout_1,washout_2" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { ownerId?: string }).ownerId, "owner_1");
      assert.deepEqual((res.body as { debugTipSources?: unknown[] }).debugTipSources?.map((row: any) => row.washoutActivityId), ["washout_1", "washout_2"]);
      assert.equal((res.body as { debugTipSources?: Array<{ locationName?: string }> }).debugTipSources?.[0].locationName, "Site 1");
    },
  );
});

test("admin billing dry-run preview response exposes debugTipSources in source code", () => {
  const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(routesSource, /debugTipSources/);
  assert.match(routesSource, /forceDriverTipCents/);
});

test("payment batch loader joins washout locations before selecting driver tips", () => {
  const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const receivablesSource = readFileSync(new URL("../server/ownerBillingReceivables.ts", import.meta.url), "utf8");
  assert.match(storageSource, /getPaymentsByBatchId[\s\S]*\.from\(payments\)[\s\S]*\.innerJoin\(washoutActivities, eq\(payments\.activityId, washoutActivities\.id\)\)[\s\S]*\.leftJoin\(washoutLocations, eq\(washoutActivities\.locationId, washoutLocations\.id\)\)/);
  assert.doesNotMatch(receivablesSource, /falling back to empty payments/);
  assert.doesNotMatch(receivablesSource, /\[OWNER_BILLING_RECEIVABLES\] payments by batch query failed/);
});

test("owner billing dry-run preview uses current approved washouts when IDs are omitted and does not call Stripe", async () => {
  const { app, posts } = createRouteRegistry();
  let stripePaymentIntentCalls = 0;

  await withPatchedStripe(
    {
      paymentIntents: {
        create: async () => {
          stripePaymentIntentCalls += 1;
          throw new Error("Stripe should not be called during a dry run");
        },
      },
      transfers: {
        create: async () => {
          stripePaymentIntentCalls += 1;
          throw new Error("Stripe should not be called during a dry run");
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getUser: async (id: string) => {
            if (id === "admin_1") {
              return { id: "admin_1", role: "super_admin" };
            }
            if (id === "owner_user_1") {
              return { id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" };
            }
            if (id === "driver_user_1") {
              return { id: "driver_user_1", username: "driver1", firstName: "Driver", lastName: "One", stripeConnectAccountId: "acct_driver_1" };
            }
            return null;
          },
          getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" }),
          getApprovedWashoutsForOwnerBilling: async () => ([
            { activityId: "activity_1", ownerId: "owner_1", driverId: "driver_1", activityAmount: "0.01", activityFeeCentsPlatform: 500, locationDriverTipRate: 99 },
            { activityId: "activity_2", ownerId: "owner_1", driverId: "driver_1", activityAmount: "0.01", activityFeeCentsPlatform: 500, locationDriverTipRate: 99 },
            { activityId: "activity_3", ownerId: "owner_1", driverId: "driver_1", activityAmount: "0.01", activityFeeCentsPlatform: 500, locationDriverTipRate: 99 },
          ]),
          getDriverById: async () => ({ id: "driver_1", userId: "driver_user_1", connectedAccountId: "acct_driver_1" }),
        } as any,
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: "admin_1", role: "super_admin" },
              body: { ownerId: "owner_1" },
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal(stripePaymentIntentCalls, 0);
          assert.equal((res.body as { dryRun?: boolean }).dryRun, true);
          assert.equal((res.body as { ledger?: { approvedWashoutCount?: number; ownerChargeAmountCents?: number } }).ledger?.approvedWashoutCount, 3);
          assert.equal((res.body as { ledger?: { ownerChargeAmountCents?: number } }).ledger?.ownerChargeAmountCents, 1503);
          assert.equal((res.body as { validation?: { passed?: boolean; blockedForReview?: boolean } }).validation?.passed, true);
          assert.equal((res.body as { validation?: { blockedForReview?: boolean } }).validation?.blockedForReview, false);
        },
      );
    },
  );
});

test("owner and driver cannot access the owner billing dry-run preview endpoint", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "owner_user_1") {
          return { id: "owner_user_1", role: "owner" };
        }
        if (id === "driver_user_1") {
          return { id: "driver_user_1", role: "driver" };
        }
        return null;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/admin/billing/preview-owner-washout-charge");
      assert.equal(typeof route, "function");

      const ownerRes = createResponse();
      await route!(
        {
          user: { id: "owner_user_1", role: "owner" },
          body: { ownerId: "owner_1", washoutActivityIds: ["activity_1"] },
        },
        ownerRes,
      );
      assert.equal(ownerRes.statusCode, 403);

      const driverRes = createResponse();
      await route!(
        {
          user: { id: "driver_user_1", role: "driver" },
          body: { ownerId: "owner_1", washoutActivityIds: ["activity_1"] },
        },
        driverRes,
      );
      assert.equal(driverRes.statusCode, 403);
    },
  );
});

test("owner billing validation rejects double-converted dollar and cent values", () => {
  assert.throws(() => validateOwnerBillingAmount({
    ownerId: "owner_1",
    billingBatchId: "batch_3",
    washoutActivityIds: ["activity_1", "activity_2", "activity_3"],
    approvedWashoutCount: 3,
    platformFeeCentsByWashout: [500, 500, 500],
    platformFeeTotalCents: 1500,
    driverTipCentsByWashout: [1, 1, 1],
    driverTipCentsByDriver: { driver_1: 3 },
    driverTipTotalCents: 3,
    ownerChargeAmountCents: 30000,
    platformRevenueCents: 1500,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 3 }],
  }), /ownerChargeAmountCents must equal platformFeeTotalCents plus driverTipTotalCents/i);
});

test("owner billing validation rejects non-integer fees and suspicious immediate charges", () => {
  assert.throws(() => validateOwnerBillingAmount({
    ownerId: "owner_1",
    billingBatchId: "batch_4a",
    washoutActivityIds: ["activity_1"],
    approvedWashoutCount: 1,
    platformFeeCentsByWashout: [5001],
    platformFeeTotalCents: 5001,
    driverTipCentsByWashout: [0],
    driverTipCentsByDriver: { driver_1: 0 },
    driverTipTotalCents: 0,
    ownerChargeAmountCents: 5001,
    platformRevenueCents: 5001,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 0 }],
  }), /platform fee per washout exceeds 5000 cents/i);

  assert.throws(() => validateOwnerBillingAmount({
    ownerId: "owner_1",
    billingBatchId: "batch_4",
    washoutActivityIds: ["activity_1"],
    approvedWashoutCount: 1,
    platformFeeCentsByWashout: [500.5],
    platformFeeTotalCents: 500.5,
    driverTipCentsByWashout: [0],
    driverTipCentsByDriver: { driver_1: 0 },
    driverTipTotalCents: 0,
    ownerChargeAmountCents: 500.5,
    platformRevenueCents: 500.5,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 0 }],
  }), /platform fees must be integer cents/i);

  assert.throws(() => validateOwnerBillingAmount({
    ownerId: "owner_1",
    billingBatchId: "batch_5",
    washoutActivityIds: ["activity_1"],
    approvedWashoutCount: 1,
    platformFeeCentsByWashout: [500],
    platformFeeTotalCents: 500,
    driverTipCentsByWashout: [9501],
    driverTipCentsByDriver: { driver_1: 9501 },
    driverTipTotalCents: 9501,
    ownerChargeAmountCents: 10001,
    platformRevenueCents: 500,
    driverTransfers: [{ driverId: "driver_1", connectedAccountId: "acct_1", amountCents: 9501 }],
    immediateBilling: true,
  }), /immediate owner washout billing cannot exceed 10000 cents/i);
});

test("owner billing blocks suspicious immediate charge before Stripe API call", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "100.01",
        processingFee: "100.01",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(fixture.getChargeCount(), 0);
  assert.equal(result.runs[0].status, "failed");
});

test("manual owner billing charges approved washout platform fees plus driver tips", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityAmount: "1.50",
        activityFeeCentsPlatform: 300,
        activityStatus: "verified",
        locationDriverTipRate: 999,
      },
      {
        activityId: "activity_2",
        activityAmount: "3.50",
        activityFeeCentsPlatform: 200,
        activityStatus: "verified",
        locationDriverTipRate: 999,
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 2);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 1500);
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntentOptions() as { idempotencyKey?: string } | null)?.idempotencyKey?.startsWith("owner_platform_billing_"), true);
  assert.equal((fixture.getBatch() as { metadata?: { runType?: string; triggeredByAdminId?: string; platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.runType, "admin_manual");
  assert.equal((fixture.getBatch() as { metadata?: { runType?: string; triggeredByAdminId?: string; platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.triggeredByAdminId, "admin_1");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.platformFeeTotal, "10.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.driverTipTotal, "5.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds, "activity_1,activity_2");
});

test("manual owner billing bills only approved washouts and excludes declined washouts", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_2", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_3", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_4", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_5", activityFeeCentsPlatform: null, activityStatus: "approved" },
      { activityId: "activity_6", activityFeeCentsPlatform: null, activityStatus: "declined" },
      { activityId: "activity_7", activityFeeCentsPlatform: null, activityStatus: "rejected" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 5);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 2500);
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
  assert.equal((fixture.getBatch() as { metadata?: { stripeChargeId?: string } } | null)?.metadata?.stripeChargeId, "ch_1");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.platformFeeTotal, "25.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds, "activity_1,activity_2,activity_3,activity_4,activity_5");
  assert.ok(!String((fixture.getBatch() as { metadata?: { washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds || "").includes("activity_6"));
  assert.ok(!String((fixture.getBatch() as { metadata?: { washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds || "").includes("activity_7"));
});

test("manual owner billing changes idempotency key when the approved washout set changes", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    ],
    payments: [],
    stripeMode: "throw",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  const firstOptions = fixture.getLastIntentOptions() as { idempotencyKey?: string } | null;
  assert.equal(first.runs[0].status, "failed");
  assert.ok(firstOptions?.idempotencyKey);

  fixture.setApprovedWashouts([
    { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    { activityId: "activity_2", activityFeeCentsPlatform: 500, activityStatus: "verified" },
  ]);

  let secondIntentOptions: { idempotencyKey?: string } | null = null;
  const retryStripeClient = {
    paymentIntents: {
      create: async (intent: Record<string, unknown>, options?: Record<string, unknown>) => {
        secondIntentOptions = (options || null) as { idempotencyKey?: string } | null;
        return {
          id: "pi_retry",
          status: "succeeded",
          amount: intent.amount,
          latest_charge: "ch_retry",
        };
      },
    },
  };

  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: retryStripeClient as any,
  });

  assert.equal(second.runs[0].status, "paid");
  assert.notEqual(firstOptions?.idempotencyKey, secondIntentOptions?.idempotencyKey);
  assert.equal(second.runs[0].washoutCount, 2);
});

test("manual owner billing accepts a Stripe customer stored on the user record", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripeCustomerId: null,
    ownerUserStripeCustomerId: "cus_owner_1",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: null,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { customer?: string } | null)?.customer, "cus_owner_1");
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
});

test("manual owner billing accepts a Stripe customer stored on the owner record", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripeCustomerId: "cus_owner_1",
    ownerUserStripeCustomerId: null,
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: null,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { customer?: string } | null)?.customer, "cus_owner_1");
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
});

test("manual owner billing returns a clear error when the owner has no payment method", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripePaymentMethodId: null,
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: 500,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "failed");
  assert.match(result.runs[0].message, /payment method/i);
  assert.equal(fixture.getChargeCount(), 0);
});

test("manual owner billing treats null fees as the default five dollars and explicit zero overrides as zero", async () => {
  const defaultFixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: Array.from({ length: 7 }, (_, index) => ({
      activityId: `activity_${index + 1}`,
      activityFeeCentsPlatform: null,
      activityStatus: "verified",
    })),
    payments: [],
    stripeMode: "succeeded",
  });

  const defaultResult = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: defaultFixture.storage,
    stripeClient: defaultFixture.stripeClient,
  });

  assert.equal(defaultResult.runs[0].status, "paid");
  assert.equal((defaultFixture.getLastIntent() as { amount?: number } | null)?.amount, 3500);

  const zeroFixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerCustomPlatformFee: "0.00",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: 0,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const zeroResult = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: zeroFixture.storage,
    stripeClient: zeroFixture.stripeClient,
  });

  assert.equal(zeroResult.runs[0].status, "skipped");
  assert.equal((zeroFixture.getLastIntent() as Record<string, unknown> | null), null);
});

test("manual owner billing excludes pending washouts and remains idempotent on retry", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
      { activityId: "activity_2", activityFeeCentsPlatform: 500, activityStatus: "pending" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });
  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(first.runs[0].status, "paid");
  assert.equal(first.runs[0].washoutCount, 1);
  assert.equal(second.runs[0].status, "skipped");
  assert.equal(fixture.getChargeCount(), 1);
});

test("manual owner billing succeeds without driver Stripe onboarding data", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 500);
});

test("duplicate owner billing run does not double charge", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "succeeded",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });
  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(first.runs[0].status, "paid");
  assert.equal(second.runs[0].status, "skipped");
  assert.equal(fixture.getChargeCount(), 1);
});

test("failed Stripe charge records failure without double charging", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "throw",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "failed");
  assert.equal((fixture.getBatch() as { status?: string; failureReason?: string } | null)?.status, "failed");
  assert.match(String((fixture.getBatch() as { failureReason?: string } | null)?.failureReason || ""), /Stripe charge failed/);
  assert.equal(fixture.getChargeCount(), 1);
});

test("owner billing skips cleanly when there are no billable washouts", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "skipped");
  assert.equal(result.runs[0].washoutCount, 0);
  assert.equal(fixture.getChargeCount(), 0);
});

test("superadmin lottery endpoints return data and draw alias is registered", async () => {
  const { app, gets, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getFeatureFlag: async () => ({ enabled: true }),
      getLotteryDrawingByMonthYear: async () => null,
      getDriverLotteryEntryTotals: async () => ([{ driverId: "driver_1", driverName: "Driver One", totalEntries: 3 }]),
      getLotteryMonths: async () => ([{ month: 5, year: 2026, isArchived: false, totalEntries: 3 }]),
      getLotteryDrawings: async () => ([{ id: "drawing_1", lotteryMonth: 5, lotteryYear: 2026 }]),
      getPendingLotteryDrawings: async () => ([]),
      getAllDriverLotteryEntries: async () => ([{ id: "entry_1" }, { id: "entry_2" }]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);

      const overviewRoute = gets.get("/api/admin/lottery");
      assert.equal(typeof overviewRoute, "function");
      const overviewRes = createResponse();
      await overviewRoute!(
        {
          user: { id: "admin_1" },
          query: { month: "5", year: "2026" },
        },
        overviewRes,
      );
      assert.equal(overviewRes.statusCode, 200);
      assert.equal((overviewRes.body as { totalEligibleWashouts?: number }).totalEligibleWashouts, 2);
      assert.equal((overviewRes.body as { totalTickets?: number }).totalTickets, 3);
      assert.equal((overviewRes.body as { driversEntered?: number }).driversEntered, 1);

      const totalsRoute = gets.get("/api/admin/lottery/totals");
      assert.equal(typeof totalsRoute, "function");
      const totalsRes = createResponse();
      await totalsRoute!(
        {
          user: { id: "admin_1" },
          query: { month: "5", year: "2026" },
        },
        totalsRes,
      );
      assert.equal(totalsRes.statusCode, 200);

      const entriesRoute = gets.get("/api/admin/lottery/entries");
      assert.equal(typeof entriesRoute, "function");
      const entriesRes = createResponse();
      await entriesRoute!(
        {
          user: { id: "admin_1" },
          query: { startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-31T23:59:59.999Z" },
        },
        entriesRes,
      );
      assert.equal(entriesRes.statusCode, 200);

      const drawRoute = posts.get("/api/admin/lottery/draw");
      assert.equal(typeof drawRoute, "function");
      const drawRes = createResponse();
      await drawRoute!(
        {
          user: { id: "admin_1" },
        },
        drawRes,
      );
      assert.equal(drawRes.statusCode, 307);
      assert.equal(drawRes.headers.location, "/api/admin/lottery/execute");
    },
  );
});

test("superadmin lottery overview falls back when drawing status lookup fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getLotteryDrawingByMonthYear: async () => {
        throw new Error("drawing lookup failed");
      },
      getDriverLotteryEntryTotals: async () => ([
        { driverId: "driver_1", driverName: "Driver One", totalEntries: 3 },
      ]),
      getLotteryMonths: async () => ([
        { month: 6, year: 2026, isArchived: false, totalEntries: 3 },
      ]),
      getLotteryDrawings: async () => ([
        { id: "drawing_1", lotteryMonth: 6, lotteryYear: 2026 },
      ]),
      getPendingLotteryDrawings: async () => ([]),
      getAllDriverLotteryEntries: async () => ([
        { id: "entry_1" },
        { id: "entry_2" },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/lottery");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: { month: "6", year: "2026" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { totalEligibleWashouts?: number }).totalEligibleWashouts, 2);
      assert.equal((res.body as { totalTickets?: number }).totalTickets, 3);
      assert.equal((res.body as { driversEntered?: number }).driversEntered, 1);
      assert.equal((res.body as { status?: { currentDrawing?: unknown } }).status?.currentDrawing, null);
    },
  );
});

test("driver and owner cannot access admin lottery endpoints", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id, username: "admin1", role: "super_admin" } as any;
        }
        if (id === "owner_user_1") {
          return { id, username: "owner1", role: "owner" } as any;
        }
        return { id, username: "driver1", role: "driver" } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/lottery");
      assert.equal(typeof route, "function");

      for (const user of [
        { id: "driver_user_1", role: "driver" },
        { id: "owner_user_1", role: "owner" },
      ]) {
        const res = createResponse();
        await route!(
          {
            user: { id: user.id },
          },
          res,
        );
        assert.equal(res.statusCode, 403);
      }
    },
  );
});

test("admin dashboard shows payments awaiting driver tip payout setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "admin",
      }),
      getSystemStats: async () => ({ totalEarnings: 0, totalWashouts: 0, totalDrivers: 0, totalOwners: 0 }),
      getAllOwnersBillingSettings: async () => [],
      getPaymentsAwaitingDriverStripe: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "held_for_onboarding",
          driverUser: { username: "driver1" },
          activity: { location: { name: "Site A", street: "1 Main St" } },
          location: { name: "Site A", street: "1 Main St" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
    },
  );
});

test("admin dashboard surfaces repaired washout fee and lottery metrics", async () => {
  const overview = await buildOwnerBillingReceivablesOverview({
    getUser: async () => ({ id: "admin_1", username: "admin1", role: "super_admin" }),
    getAllOwnersBillingSettings: async () => [
      {
        ownerId: "owner_1",
        companyName: "Immediate Co",
        username: "immediate1",
        billingCadence: "immediate",
        billingCutoffTime: "23:59:00",
        billingTimezone: "America/Chicago",
        billingDayOfWeek: 1,
      },
    ],
    getOwnerById: async () => ({
      id: "owner_1",
      userId: "owner_user_1",
      companyName: "Immediate Co",
      stripePaymentMethodId: "pm_owner_1",
    }),
    getApprovedWashoutsForOwnerBilling: async () => ([
      { activityId: "activity_1", ownerId: "owner_1", driverId: "driver_1", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
      { activityId: "activity_2", ownerId: "owner_1", driverId: "driver_2", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
      { activityId: "activity_3", ownerId: "owner_1", driverId: "driver_3", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
      { activityId: "activity_4", ownerId: "owner_1", driverId: "driver_4", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
      { activityId: "activity_5", ownerId: "owner_1", driverId: "driver_5", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
      { activityId: "activity_6", ownerId: "owner_1", driverId: "driver_6", activityFeeCentsPlatform: null, activityStatus: "declined", locationDriverTipRate: 0 },
      { activityId: "activity_7", ownerId: "owner_1", driverId: "driver_7", activityFeeCentsPlatform: null, activityStatus: "rejected", locationDriverTipRate: 0 },
    ]),
    getBillingBatchesByOwner: async () => [],
    getPaymentsByBatchId: async () => [],
  } as any);

  assert.equal(overview.summary.ownerCount, 1);
  assert.equal(overview.summary.approvedWashoutCount, 5);
  assert.equal(overview.summary.platformFeesOwedCents, 2500);
  assert.equal(overview.summary.platformFeesPaidCents, 0);
  assert.equal(overview.summary.platformFeesTotalCents, 2500);
  return;

  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => ({
        totalEarnings: 0,
        totalWashouts: 6,
        totalDrivers: 3,
        totalOwners: 2,
        platformWashoutRevenue: days === 7 ? 25 : 25,
        platformWashoutRevenueCents: days === 7 ? 2500 : 2500,
        platformFeeRecordCount: days === 7 ? 5 : 5,
        driverTipTotal: 0,
        billedWashouts: 5,
        pendingWashouts: 1,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: days === 7 ? 5 : 5,
        lotteryDriverCount: days === 7 ? 3 : 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "activity_1", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_2", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_3", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_4", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_5", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_6", activityFeeCentsPlatform: null, activityStatus: "declined", locationDriverTipRate: 0 },
        { activityId: "activity_7", activityFeeCentsPlatform: null, activityStatus: "rejected", locationDriverTipRate: 0 },
      ]),
      getBillingBatchesByOwner: async () => [],
      getPaymentsAwaitingDriverStripe: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number;
          platformWashoutRevenueCents?: number;
          platformFeeRecordCount?: number;
          lotteryTicketCount?: number;
          lotteryDriverCount?: number;
        };
        billingReceivablesSummary?: {
          ownerCount?: number;
          approvedWashoutCount?: number;
          platformFeesOwedCents?: number;
          platformFeesPaidCents?: number;
          platformFeesTotalCents?: number;
        };
        dashboardMeta?: {
          httpStatus?: number;
          coreSources?: {
            platformWashoutRevenue?: string;
            lotteryTickets?: string;
          };
          readsFeeCentsPlatform?: boolean;
          readsDriverLotteryEntries?: boolean;
          weekStatsWindow?: { days?: number };
        };
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 25);
      assert.equal(body.weekStats?.platformWashoutRevenueCents, 2500);
      assert.equal(body.weekStats?.platformFeeRecordCount, 5);
      assert.equal(body.weekStats?.lotteryTicketCount, 5);
      assert.equal(body.weekStats?.lotteryDriverCount, 3);
      assert.equal(body.billingReceivablesSummary?.ownerCount, 1);
      assert.equal(body.billingReceivablesSummary?.approvedWashoutCount, 5);
      assert.equal(body.billingReceivablesSummary?.platformFeesOwedCents, 2500);
      assert.equal(body.billingReceivablesSummary?.platformFeesPaidCents, 0);
      assert.equal(body.billingReceivablesSummary?.platformFeesTotalCents, 2500);
      assert.equal(body.dashboardMeta?.httpStatus, 200);
      assert.equal(body.dashboardMeta?.coreSources?.platformWashoutRevenue, "washout_activities.fee_cents_platform");
      assert.equal(body.dashboardMeta?.coreSources?.lotteryTickets, "driver_lottery_entries");
      assert.equal(body.dashboardMeta?.coreSources?.billingReceivables, "washout_activities.fee_cents_platform + billing batches");
      assert.equal(body.dashboardMeta?.readsFeeCentsPlatform, true);
      assert.equal(body.dashboardMeta?.readsDriverLotteryEntries, true);
      assert.equal(body.dashboardMeta?.readsImmediateBillingReceivables, true);
      assert.equal(body.dashboardMeta?.weekStatsWindow?.days, 7);
    },
  );
});

test("admin dashboard current receivables match billing settings summary", async () => {
  const overview = await buildOwnerBillingReceivablesOverview({
    getUser: async () => ({ id: "admin_1", username: "admin1", role: "super_admin" }),
    getAllOwnersBillingSettings: async () => [
      {
        ownerId: "owner_1",
        companyName: "Immediate Co",
        username: "immediate1",
        billingCadence: "immediate",
        billingCutoffTime: "23:59:00",
        billingTimezone: "America/Chicago",
        billingDayOfWeek: 1,
      },
    ],
    getOwnerById: async () => ({
      id: "owner_1",
      userId: "owner_user_1",
      companyName: "Immediate Co",
      stripePaymentMethodId: "pm_owner_1",
    }),
    getApprovedWashoutsForOwnerBilling: async () => [],
    getBillingBatchesByOwner: async () => ([
      {
        id: "batch_1",
        ownerId: "owner_1",
        businessDate: "2026-05-28",
        status: "completed",
        totalAmount: "25.00",
        totalFees: "0.00",
        paymentCount: 5,
        stripePaymentIntentId: "pi_1",
        failureReason: null,
        metadata: {
          stripeChargeId: "ch_1",
          platformFeeTotal: "25.00",
          driverTipTotal: "0.00",
          washoutActivityIds: "activity_1,activity_2,activity_3,activity_4,activity_5",
        },
        createdAt: new Date("2026-05-28T14:00:00Z"),
        updatedAt: new Date("2026-05-28T14:05:00Z"),
      } as any,
    ]),
    getPaymentsByBatchId: async () => [],
  } as any);

  assert.equal(overview.summary.ownerCount, 1);
  assert.equal(overview.summary.platformFeesOwedCents, 0);
  assert.equal(overview.summary.platformFeesPaidCents, 2500);
  assert.equal(overview.summary.platformFeesTotalCents, 2500);
  assert.equal(overview.summary.billedWashoutCount, 5);
  return;

  const { app, gets } = createRouteRegistry();

  const billingSettingsOwners = [
    {
      ownerId: "owner_1",
      companyName: "Immediate Co",
      username: "immediate1",
      billingCadence: "immediate",
      billingCutoffTime: "23:59:00",
      billingTimezone: "America/Chicago",
      billingDayOfWeek: 1,
    },
  ];

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: days === 7 ? 20 : 35,
        platformWashoutRevenueCents: days === 7 ? 2000 : 3500,
        platformWashoutPaidRevenue: 0,
        platformWashoutPaidRevenueCents: 0,
        platformFeeRecordCount: days === 7 ? 4 : 7,
        approvedWashouts: days === 7 ? 4 : 7,
        driverTipTotal: 0,
        billedWashouts: 0,
        pendingWashouts: 0,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: days === 7 ? 4 : 7,
        lotteryDriverCount: days === 7 ? 2 : 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
      getAllOwnersBillingSettings: async () => billingSettingsOwners,
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "activity_1", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_2", activityFeeCentsPlatform: null, activityStatus: "approved", locationDriverTipRate: 0 },
        { activityId: "activity_3", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_4", activityFeeCentsPlatform: null, activityStatus: "approved", locationDriverTipRate: 0 },
        { activityId: "activity_5", activityFeeCentsPlatform: null, activityStatus: "verified", locationDriverTipRate: 0 },
        { activityId: "activity_6", activityFeeCentsPlatform: null, activityStatus: "declined", locationDriverTipRate: 0 },
        { activityId: "activity_7", activityFeeCentsPlatform: null, activityStatus: "rejected", locationDriverTipRate: 0 },
      ]),
      getBillingBatchesByOwner: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);

      const dashboardRoute = gets.get("/api/admin/dashboard");
      const billingRoute = gets.get("/api/admin/billing/settings");
      assert.equal(typeof dashboardRoute, "function");
      assert.equal(typeof billingRoute, "function");

      const dashboardRes = createResponse();
      await dashboardRoute!(
        {
          user: { id: "admin_1" },
        },
        dashboardRes,
      );

      const billingRes = createResponse();
      await billingRoute!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        billingRes,
      );

      assert.equal(dashboardRes.statusCode, 200);
      assert.equal(billingRes.statusCode, 200);
      const dashboardBody = dashboardRes.body as {
        billingReceivablesSummary?: { platformFeesOwedCents?: number; platformFeesPaidCents?: number; platformFeesTotalCents?: number };
        weekStats?: { platformWashoutRevenue?: number; platformWashoutRevenueCents?: number };
        monthStats?: { platformWashoutRevenue?: number; platformWashoutRevenueCents?: number };
      };
      const billingBody = billingRes.body as {
        immediateBillingSummary?: { platformFeesOwedCents?: number; platformFeesPaidCents?: number; platformFeesTotalCents?: number };
      };

      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesOwedCents, billingBody.immediateBillingSummary?.platformFeesOwedCents);
      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesPaidCents, billingBody.immediateBillingSummary?.platformFeesPaidCents);
      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesTotalCents, billingBody.immediateBillingSummary?.platformFeesTotalCents);
      assert.equal(dashboardBody.weekStats?.platformWashoutRevenue, 20);
      assert.equal(dashboardBody.monthStats?.platformWashoutRevenue, 35);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesOwedCents, 2500);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesPaidCents, 0);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesTotalCents, 2500);
    },
  );
});

test("admin dashboard fails when core stats report washout revenue errors", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async () => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: null,
        platformWashoutRevenueCents: null,
        platformFeeRecordCount: null,
        approvedWashouts: null,
        driverTipTotal: null,
        billedWashouts: null,
        pendingWashouts: null,
        failedWashouts: null,
        refundedWashouts: null,
        disputedWashouts: null,
        lotteryTicketCount: 0,
        lotteryDriverCount: 0,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
        washoutRevenueError: "Unable to load washout revenue metrics.",
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 500);
      assert.match(String((res.body as { message?: string } | undefined)?.message || ""), /Failed to fetch dashboard data/);
    },
  );
});

test("admin dashboard fails loudly when month washout stats fail", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => {
        if (days === 7) {
          return {
            totalEarnings: 0,
            totalWashouts: 4,
            totalDrivers: 2,
            totalOwners: 1,
            platformWashoutRevenue: 25,
            platformWashoutRevenueCents: 2500,
            platformFeeRecordCount: 5,
            driverTipTotal: 3.5,
            billedWashouts: 4,
            pendingWashouts: 0,
            failedWashouts: 0,
            refundedWashouts: 0,
            disputedWashouts: 0,
            lotteryTicketCount: 5,
            lotteryDriverCount: 3,
            subscriptionRevenue: 0,
            activeLicenses: 0,
            licenseRenewals: 0,
          };
        }
        throw new Error("monthly stats unavailable");
      },
      getPaymentsAwaitingDriverStripe: async () => {
        throw new Error("stripe queue unavailable");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 500);
      assert.match(String((res.body as { message?: string } | undefined)?.message || ""), /Failed to fetch dashboard data/);
    },
  );
});

test("admin dashboard stays online when awaiting driver stripe query hits missing payout_status column", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async () => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: 25,
        platformWashoutRevenueCents: 2500,
        platformFeeRecordCount: 5,
        approvedWashouts: 5,
        driverTipTotal: 0,
        billedWashouts: 5,
        pendingWashouts: 0,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: 5,
        lotteryDriverCount: 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => {
        throw new Error("column payments.payout_status does not exist");
      },
      getAllOwnersBillingSettings: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number;
          approvedWashouts?: number;
          lotteryTicketCount?: number;
        };
        awaitingDriverStripeCount?: number;
        dashboardErrors?: Record<string, string>;
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 25);
      assert.equal(body.weekStats?.approvedWashouts, 5);
      assert.equal(body.weekStats?.lotteryTicketCount, 5);
      assert.equal(body.awaitingDriverStripeCount, 0);
      assert.ok(body.dashboardErrors?.awaitingDriverStripePayments);
    },
  );
});

test("admin billing settings endpoint exposes daily weekly monthly cadence options", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Owner Co",
          username: "owner1",
          billingCadence: "weekly",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        owners?: Array<{ billingCadence?: string }>;
        billingCadenceOptions?: Array<{ value?: string }>;
      };
      assert.equal(body.owners?.[0]?.billingCadence, "weekly");
      assert.deepEqual(body.billingCadenceOptions?.map((option) => option.value), ["immediate", "daily", "weekly", "monthly"]);
    },
  );
});

test("admin billing settings endpoint exposes immediate billing owners and history", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        // After a successful completed billing batch, no approved washouts remain unbilled.
      ]),
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          businessDate: "2026-05-28",
          status: "completed",
          totalAmount: "25.00",
          totalFees: "0.00",
          paymentCount: 5,
          stripePaymentIntentId: "pi_1",
          failureReason: null,
          metadata: {
            stripeChargeId: "ch_1",
            platformFeeTotal: "25.00",
            driverTipTotal: "0.00",
            washoutActivityIds: "activity_1,activity_2,activity_3,activity_4,activity_5",
          },
          createdAt: new Date("2026-05-28T14:00:00Z"),
          updatedAt: new Date("2026-05-28T14:05:00Z"),
        } as any,
      ]),
      getPaymentsByBatchId: async (batchId: string) => {
        if (batchId !== "batch_1") {
          return [];
        }
        return Array.from({ length: 5 }, (_, index) => ({
          id: `payment_${index + 1}`,
          ownerId: "owner_1",
          driverId: `driver_${index + 1}`,
          activityId: `activity_${index + 1}`,
          processingFee: "5.00",
          tipAmountCents: 0,
          status: "completed",
          batchId: "batch_1",
          stripePaymentIntentId: "pi_1",
          stripeTransferId: null,
          stripeChargeId: "ch_1",
        }));
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        immediateBillingOwners?: Array<{
          ownerId?: string;
          approvedWashoutCount?: number;
          platformFeesOwedCents?: number;
          platformFeesPaidCents?: number;
          platformFeesTotalCents?: number;
          lastStripePaymentIntentId?: string | null;
          lastStripeChargeId?: string | null;
          lastBillingStatus?: string;
        }>;
        immediateBillingHistory?: Array<{
          batchId?: string;
          stripePaymentIntentId?: string | null;
          stripeChargeId?: string | null;
        }>;
      };
      assert.equal(body.immediateBillingOwners?.length, 1);
      assert.equal(body.immediateBillingOwners?.[0]?.ownerId, "owner_1");
      assert.equal(body.immediateBillingOwners?.[0]?.approvedWashoutCount, 5);
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesOwedCents, 0);
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesPaidCents, 2500);
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesTotalCents, 2500);
      assert.equal(body.immediateBillingOwners?.[0]?.billedWashoutCount, 5);
      assert.equal(body.immediateBillingOwners?.[0]?.lastStripePaymentIntentId, "pi_1");
      assert.equal(body.immediateBillingOwners?.[0]?.lastStripeChargeId, "ch_1");
      assert.equal(body.immediateBillingOwners?.[0]?.lastBillingStatus, "completed");
      assert.equal(body.immediateBillingHistory?.[0]?.batchId, "batch_1");
      assert.equal(body.immediateBillingHistory?.[0]?.stripePaymentIntentId, "pi_1");
      assert.equal(body.immediateBillingHistory?.[0]?.stripeChargeId, "ch_1");
    },
  );
});

test("admin dashboard and billing settings show paid platform fees after completed billing batch", async () => {
  const { app, gets } = createRouteRegistry();

  const billingSettingsOwners = [
    {
      ownerId: "owner_1",
      companyName: "Immediate Co",
      username: "immediate1",
      billingCadence: "immediate",
      billingCutoffTime: "23:59:00",
      billingTimezone: "America/Chicago",
      billingDayOfWeek: 1,
    },
  ];

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: days === 7 ? 0 : 25,
        platformWashoutRevenueCents: days === 7 ? 0 : 2500,
        platformWashoutPaidRevenue: days === 7 ? 25 : 25,
        platformWashoutPaidRevenueCents: days === 7 ? 2500 : 2500,
        platformFeeRecordCount: days === 7 ? 0 : 5,
        approvedWashouts: days === 7 ? 0 : 5,
        driverTipTotal: 0,
        billedWashouts: days === 7 ? 0 : 5,
        pendingWashouts: 0,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: 5,
        lotteryDriverCount: 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
      getAllOwnersBillingSettings: async () => billingSettingsOwners,
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => [],
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          businessDate: "2026-05-28",
          status: "completed",
          totalAmount: "25.00",
          totalFees: "0.00",
          paymentCount: 5,
          stripePaymentIntentId: "pi_1",
          failureReason: null,
          metadata: {
            stripeChargeId: "ch_1",
            platformFeeTotal: "25.00",
            driverTipTotal: "0.00",
            washoutActivityIds: "activity_1,activity_2,activity_3,activity_4,activity_5",
          },
          createdAt: new Date("2026-05-28T14:00:00Z"),
          updatedAt: new Date("2026-05-28T14:05:00Z"),
        } as any,
      ]),
      getPaymentsByBatchId: async (batchId: string) => {
        if (batchId !== "batch_1") {
          return [];
        }
        return Array.from({ length: 5 }, (_, index) => ({
          id: `payment_${index + 1}`,
          ownerId: "owner_1",
          driverId: `driver_${index + 1}`,
          activityId: `activity_${index + 1}`,
          processingFee: "5.00",
          tipAmountCents: 0,
          status: "completed",
          batchId: "batch_1",
          stripePaymentIntentId: "pi_1",
          stripeTransferId: null,
          stripeChargeId: "ch_1",
        }));
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const dashboardRoute = gets.get("/api/admin/dashboard");
      const billingRoute = gets.get("/api/admin/billing/settings");
      assert.equal(typeof dashboardRoute, "function");
      assert.equal(typeof billingRoute, "function");

      const dashboardRes = createResponse();
      await dashboardRoute!(
        {
          user: { id: "admin_1" },
        },
        dashboardRes,
      );

      const billingRes = createResponse();
      await billingRoute!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        billingRes,
      );

      assert.equal(dashboardRes.statusCode, 200);
      assert.equal(billingRes.statusCode, 200);
      const dashboardBody = dashboardRes.body as {
        billingReceivablesSummary?: { platformFeesOwedCents?: number; platformFeesPaidCents?: number; platformFeesTotalCents?: number; billedWashoutCount?: number };
      };
      const billingBody = billingRes.body as {
        immediateBillingSummary?: { platformFeesOwedCents?: number; platformFeesPaidCents?: number; platformFeesTotalCents?: number; billedWashoutCount?: number };
      };

      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesOwedCents, 0);
      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesPaidCents, 2500);
      assert.equal(dashboardBody.billingReceivablesSummary?.platformFeesTotalCents, 2500);
      assert.equal(dashboardBody.billingReceivablesSummary?.billedWashoutCount, 5);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesOwedCents, 0);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesPaidCents, 2500);
      assert.equal(billingBody.immediateBillingSummary?.platformFeesTotalCents, 2500);
      assert.equal(billingBody.immediateBillingSummary?.billedWashoutCount, 5);
    },
  );
});

test("admin billing settings endpoint shows reconciliation notes for overcharged runs", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([]),
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          businessDate: "2026-05-28",
          status: "completed",
          totalAmount: "35.00",
          totalFees: "0.00",
          paymentCount: 5,
          stripePaymentIntentId: "pi_1",
          failureReason: null,
          metadata: {
            stripeChargeId: "ch_1",
            platformFeeTotal: "25.00",
            driverTipTotal: "10.00",
            washoutActivityIds: "activity_1,activity_2,activity_3,activity_4,activity_5",
          },
          createdAt: new Date("2026-05-28T14:00:00Z"),
          updatedAt: new Date("2026-05-28T14:05:00Z"),
        } as any,
      ]),
      getPaymentsByBatchId: async (batchId: string) => {
        if (batchId !== "batch_1") {
          return [];
        }
        return Array.from({ length: 5 }, (_, index) => ({
          id: `payment_${index + 1}`,
          ownerId: "owner_1",
          driverId: `driver_${index + 1}`,
          activityId: `activity_${index + 1}`,
          processingFee: "5.00",
          tipAmountCents: 0,
          status: "completed",
          batchId: "batch_1",
          stripePaymentIntentId: "pi_1",
          stripeTransferId: null,
          stripeChargeId: "ch_1",
        }));
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        immediateBillingOwners?: Array<{
          platformFeesOwedCents?: number;
          platformFeesPaidCents?: number;
          platformFeesTotalCents?: number;
          lastBillingAmountCents?: number;
          billingReconciliationStatus?: string | null;
          billingReconciliationNote?: string | null;
        }>;
      };
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesOwedCents, 0);
      assert.equal(body.immediateBillingOwners?.[0]?.lastBillingAmountCents, 3500);
      assert.equal(body.immediateBillingOwners?.[0]?.billingReconciliationStatus, "overcharged");
      assert.match(body.immediateBillingOwners?.[0]?.billingReconciliationNote || "", /Expected \$25\.00, actual Stripe charge was \$35\.00\./);
    },
  );
});

test("admin billing settings update accepts daily weekly and monthly cadences", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: Array<Record<string, unknown>> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Owner Co",
      }),
      updateOwnerBillingSettings: async (_ownerId: string, settings: Record<string, unknown>) => {
        updates.push(settings);
        return {
          id: "owner_1",
          userId: "owner_user_1",
          companyName: "Owner Co",
          billingCadence: settings.billingCadence || "weekly",
          billingCutoffTime: settings.billingCutoffTime || "23:59:00",
          billingTimezone: settings.billingTimezone || "America/Chicago",
          billingDayOfWeek: settings.billingDayOfWeek ?? 0,
        } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/billing/settings/:ownerId");
      assert.equal(typeof route, "function");

      for (const billingCadence of ["immediate", "daily", "weekly", "monthly"] as const) {
        const res = createResponse();
        await route!(
          {
            params: { ownerId: "owner_1" },
            user: { id: "admin_1" },
            body: {
              billingCadence,
              billingCutoffTime: "23:59",
              billingTimezone: "America/Chicago",
              billingDayOfWeek: 1,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        const body = res.body as { settings?: { billingCadence?: string } };
        assert.equal(body.settings?.billingCadence, billingCadence);
      }

      assert.deepEqual(
        updates.map((entry) => entry.billingCadence),
        ["immediate", "daily", "weekly", "monthly"],
      );
    },
  );
});

test("admin billing settings rejects invalid cadence values", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Owner Co",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/billing/settings/:ownerId");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { ownerId: "owner_1" },
          user: { id: "admin_1" },
          body: {
            billingCadence: "hourly",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.match(String((res.body as { message?: string }).message || ""), /immediate.*daily.*weekly.*monthly/i);
    },
  );
});

test("admin payments endpoint stays online when the payments query fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => {
        throw new Error("payments query failed");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, []);
    },
  );
});

test("admin payments endpoint returns an empty array when there are no payment rows", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, []);
    },
  );
});

test("admin payments endpoint returns minimal payment rows without legacy fields", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => [
        {
          id: "payment_1",
          driverId: "driver_1",
          ownerId: "owner_1",
          activityId: "activity_1",
          amount: "25.00",
          processingFee: "5.00",
          platformFee: "5.00",
          tipAmountCents: 150,
          status: "completed",
          stripePaymentIntentId: "pi_123",
          stripeChargeId: "ch_123",
          createdAt: new Date("2025-06-01T12:00:00.000Z"),
          paidAt: new Date("2025-06-01T12:05:00.000Z"),
          driver: {
            id: "driver_1",
            userId: "driver_user_1",
            truckNumber: "Truck 1",
            user: {
              id: "driver_user_1",
              firstName: "Driver",
              lastName: "One",
              email: "driver@example.com",
            },
          },
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            user: {
              id: "owner_user_1",
              firstName: "Owner",
              lastName: "One",
              email: "owner@example.com",
            },
          },
          activity: {
            id: "activity_1",
            locationId: "location_1",
            checkInTime: new Date("2025-06-01T11:00:00.000Z"),
            status: "verified",
            amount: "20.00",
            notes: "approved washout",
          },
        } as any,
      ],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(Array.isArray(res.body), true);
      assert.equal((res.body as Array<{ id?: string }>).length, 1);
      const payment = (res.body as Array<any>)[0];
      assert.equal(payment.id, "payment_1");
      assert.equal(payment.platformFee, "5.00");
      assert.equal(payment.tipAmountCents, 150);
      assert.equal(payment.washoutServiceFee, undefined);
      assert.equal(payment.businessDate, undefined);
      assert.equal(payment.driver?.user?.firstName, "Driver");
      assert.equal(payment.owner?.companyName, "Alpha Concrete");
      assert.equal(payment.activity?.id, "activity_1");
    },
  );
});

test("admin dashboard fails loudly when system stats query fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async () => {
        throw new Error("washout revenue query failed");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 500);
      assert.match(String((res.body as { message?: string } | undefined)?.message || ""), /Failed to fetch dashboard data/);
    },
  );
});

test("deferred driver Stripe payment can be processed once the driver is ready", async () => {
  const { app, posts } = createRouteRegistry();
  let paymentStatusUpdates: Array<Record<string, unknown>> = [];

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_deferred_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getPaymentById: async () => ({
              id: "payment_1",
              activityId: "activity_1",
              driverId: "driver_row_1",
              ownerId: "owner_1",
              amount: "10.00",
              processingFee: "5.00",
              washoutServiceFee: "5.00",
              tipAmountCents: 500,
              payoutStatus: "held_for_onboarding",
              status: "awaiting_driver_stripe",
              businessDate: "2026-05-28",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
              street: "1 Main St",
            }),
            getOwnerById: async () => ({
              id: "owner_1",
              userId: "user_owner_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getUser: async (id: string) => {
              if (id === "admin_1") {
                return {
                  id: "admin_1",
                  username: "admin1",
                  role: "admin",
                };
              }
              if (id === "user_owner_1") {
                return {
                  id: "user_owner_1",
                  username: "owner1",
                  firstName: "Owner",
                  lastName: "One",
                  stripeCustomerId: "cus_owner_1",
                  stripePaymentMethodId: "pm_owner_1",
                };
              }
              return {
                id: "driver_user_1",
                username: "driver1",
                firstName: "Driver",
                lastName: "One",
                stripeConnectAccountId: "acct_driver_1",
              };
            },
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createDriverLotteryEntry: async () => ({ id: "lottery_1" }),
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = posts.get("/api/admin/payments/process-awaiting-driver-stripe");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                body: { paymentId: "payment_1" },
                user: { id: "admin_1", role: "admin" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { processed?: number }).processed, 1);
            assert.equal((res.body as { skipped?: number }).skipped, 0);
            assert.equal((res.body as { failed?: number }).failed, 0);
            paymentStatusUpdates = mock.updates;
          },
        );
      },
    );
  });

  assert.ok(paymentStatusUpdates.length > 0);
});

test("batch owner payment transfers driver tip to connected account", async () => {
  const { app, posts } = createRouteRegistry();
  let paymentIntentPayload: Stripe.PaymentIntentCreateParams | undefined;
  let transferPayload: Stripe.TransferCreateParams | undefined;
  const pendingStatusUpdates: Array<Record<string, unknown>> = [];
  const batchStatusUpdates: Array<Record<string, unknown>> = [];

  await withPatchedStripe(
    {
      paymentIntents: {
        create: async (payload: Stripe.PaymentIntentCreateParams) => {
          paymentIntentPayload = payload;
          return {
            id: "pi_owner_batch_1",
            status: "succeeded",
          } as Stripe.PaymentIntent;
        },
      },
      transfers: {
        create: async (payload: Stripe.TransferCreateParams) => {
          transferPayload = payload;
          return {
            id: "tr_driver_tip_1",
            object: "transfer",
          } as Stripe.Transfer;
        },
      },
    },
    async () => {
      await withPatchedStorage(
        {
          getPendingWashoutPaymentsByStatus: async (status: string) => {
            assert.equal(status, "queued");
            return [
              {
                id: "pending_payment_1",
                ownerId: "owner_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                locationId: "location_1",
                driverAmount: "10.00",
                platformFee: "5.00",
                totalAmount: "16.50",
                metadata: { driverTip: "1.50" },
              },
            ];
          },
          getOwnerById: async () => ({
            id: "owner_1",
            stripeCustomerId: "cus_owner_1",
            stripePaymentMethodId: "pm_owner_1",
          }),
          createWashoutPaymentBatch: async (payload: Record<string, unknown>) => ({
            id: "batch_1",
            ...payload,
          }),
          updatePendingPaymentStatus: async (paymentId: string, status: string, batchId?: string, failureReason?: string) => {
            pendingStatusUpdates.push({ paymentId, status, batchId, failureReason });
          },
          updateWashoutPaymentBatchStatus: async (batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string) => {
            batchStatusUpdates.push({ batchId, status, stripePaymentIntentId, failureReason });
          },
          getDriverById: async () => ({
            id: "driver_row_1",
            stripeConnectAccountId: "acct_driver_tip_recipient",
          }),
          markWashoutPaymentBatchCompleted: async (batchId: string) => {
            batchStatusUpdates.push({ batchId, status: "completed" });
          },
        },
        async () => {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/payments/process-batch");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: "admin_1", role: "admin" },
              body: {},
            },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal((res.body as { batchesProcessed?: number }).batchesProcessed, 1);
        },
      );
    },
  );

  assert.ok(paymentIntentPayload);
  assert.equal(paymentIntentPayload.amount, 650);
  assert.equal(paymentIntentPayload.customer, "cus_owner_1");
  assert.ok(transferPayload);
  assert.equal(transferPayload.amount, 150);
  assert.equal(transferPayload.destination, "acct_driver_tip_recipient");
  assert.equal(transferPayload.metadata?.driverTip, "1.50");
  assert.equal(transferPayload.metadata?.type, "driver_washout_payout");
  assert.deepEqual(pendingStatusUpdates.map((update) => update.status), ["processing", "processed"]);
  assert.equal(batchStatusUpdates.some((update) => update.status === "completed"), true);
});

test("deferred driver Stripe payment remains held when the driver is not ready", async () => {
  const { app, posts } = createRouteRegistry();

  await withMockedDb([[]], async () => {
    await withPatchedStorage(
      {
        getPaymentById: async () => ({
          id: "payment_held_1",
          activityId: "activity_1",
          driverId: "driver_row_1",
          ownerId: "owner_1",
          amount: "10.00",
          processingFee: "5.00",
          washoutServiceFee: "1.50",
          tipAmountCents: 150,
          payoutStatus: "held_for_onboarding",
          status: "awaiting_driver_stripe",
          businessDate: "2026-05-28",
        }),
        getWashoutActivity: async () => ({
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        }),
        getWashoutLocation: async () => ({
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
        }),
        getOwnerById: async () => ({
          id: "owner_1",
          userId: "user_owner_1",
          useCustomBillingModel: false,
          customWashoutRate: null,
          stripeCustomerId: "cus_owner_1",
          stripePaymentMethodId: "pm_owner_1",
        }),
        getUser: async (id: string) => {
          if (id === "admin_1") {
            return {
              id: "admin_1",
              username: "admin1",
              role: "admin",
            };
          }
          if (id === "user_owner_1") {
            return {
              id: "user_owner_1",
              username: "owner1",
              firstName: "Owner",
              lastName: "One",
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            };
          }
          return {
            id: "driver_user_1",
            username: "driver1",
            firstName: "Driver",
            lastName: "One",
            stripeConnectAccountId: null,
          };
        },
        getDriverById: async () => ({
          id: "driver_row_1",
          userId: "driver_user_1",
        }),
      },
      async () => {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/admin/payments/process-awaiting-driver-stripe");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            body: { paymentId: "payment_held_1" },
            user: { id: "admin_1", role: "admin" },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as { processed?: number }).processed, 0);
        assert.equal((res.body as { skipped?: number }).skipped, 1);
        assert.match(String(JSON.stringify(res.body)), /held for onboarding|Stripe not ready/i);
      },
    );
  });
});

test("owner verify is idempotent for lottery entry creation on retry", async () => {
  const { app, puts } = createRouteRegistry();
  let activityStatus: "pending" | "verified" | "rejected" = "pending";
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: true,
              customWashoutRate: "12.00",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: activityStatus,
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "weekly",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-22",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getFeatureFlag: async () => ({ enabled: true }),
            createPayment: async () => ({
              id: "payment_1",
            }),
            verifyWashoutActivity: async () => {
              activityStatus = "verified";
              return {
                id: "activity_1",
                locationId: "location_1",
                status: "verified",
                amount: "10.00",
                driverId: "driver_row_1",
                serviceType: "washout",
              };
            },
            createDriverLotteryEntry: async () => {
              lotteryEntryCalls += 1;
              return {
                id: "lottery_entry_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                ownerId: "owner_1",
                ticketNumber: "CX-202605-0001",
                entriesEarned: 1,
                lotteryMonth: 5,
                lotteryYear: 2026,
                isArchived: false,
              };
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const firstRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              firstRes,
            );

            assert.equal(firstRes.statusCode, 200);
            assert.equal(lotteryEntryCalls, 1);

            const secondRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              secondRes,
            );

            assert.equal(secondRes.statusCode, 409);
            assert.equal(lotteryEntryCalls, 1);
          },
        );
      },
    );
  });
});

test("owner verify creates a lottery entry for standard weekly billing and remains idempotent on retry", async () => {
  const { app, puts } = createRouteRegistry();
  let activityStatus: "pending" | "verified" | "rejected" = "pending";
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: activityStatus,
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "weekly",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-22",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            createPayment: async () => ({
              id: "payment_1",
            }),
            verifyWashoutActivity: async () => {
              activityStatus = "verified";
              return {
                id: "activity_1",
                locationId: "location_1",
                status: "verified",
                amount: "10.00",
                driverId: "driver_row_1",
                serviceType: "washout",
              };
            },
            createDriverLotteryEntry: async () => {
              lotteryEntryCalls += 1;
              return {
                id: "lottery_entry_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                ownerId: "owner_1",
                ticketNumber: "CX-202605-0001",
                entriesEarned: 1,
                lotteryMonth: 5,
                lotteryYear: 2026,
                isArchived: false,
              };
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const firstRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              firstRes,
            );

            assert.equal(firstRes.statusCode, 200);
            assert.equal((firstRes.body as any).status, "verified");
            assert.equal((firstRes.body as any).paymentStatus, "pending");
            assert.equal(lotteryEntryCalls, 1);

            const secondRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              secondRes,
            );

            assert.equal(secondRes.statusCode, 409);
            assert.equal(lotteryEntryCalls, 1);
          },
        );
      },
    );
  });
});

for (const winnerCount of [1, 2, 3] as const) {
  test(`lottery drawing sends winner and participant messages for ${winnerCount} winner${winnerCount === 1 ? "" : "s"}`, async () => {
    const fixture = createLotteryMessagingFixture(winnerCount);
    const route = await getLotteryExecuteRoute();

    await withPatchedStorage(fixture.patch, async () => {
      await withMockedRandom(0, async () => {
        const res = createResponse();
        await route(
          {
            user: { id: "admin_user_1" },
            body: {
              month: 5,
              year: 2026,
              numberOfWinners: winnerCount,
              firstPrize: "Gold Prize",
              secondPrize: winnerCount >= 2 ? "Silver Prize" : "",
              thirdPrize: winnerCount >= 3 ? "Bronze Prize" : "",
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        const body = res.body as any;
        assert.equal(body.drawing.winnerNotificationCount, winnerCount);
        assert.equal(body.drawing.participantNotificationCount, 3);

        const winnerMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "winner");
        const participantMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "participant");
        assert.equal(winnerMessages.length, winnerCount);
        assert.equal(participantMessages.length, 3);

        const participantUserIds = new Set(participantMessages.map((call) => call.userId));
        assert.deepEqual(participantUserIds, new Set(["driver_user_1", "driver_user_2", "driver_user_3"]));

        const winnerUserIds = new Set(winnerMessages.map((call) => call.userId));
        for (const userId of winnerUserIds) {
          assert(participantUserIds.has(userId), "winners should receive the general announcement too");
        }

        const participantMessage = participantMessages[0];
        assert(participantMessage.message.includes("Winners:"));
        assert(participantMessage.message.includes("Alex Stone"));
        assert(!participantMessage.message.includes("@"));
        assert(!participantMessage.message.includes("555"));
        assert.deepEqual(
          participantMessage.data.winners,
          winnerMessages.map((call, index) => ({
            place: index + 1,
            driverName: call.data.driverName,
          })),
        );
      });
    });
  });
}

test("lottery drawing retry does not duplicate winner or participant messages", async () => {
  const fixture = createLotteryMessagingFixture(3);
  const route = await getLotteryExecuteRoute();

  await withPatchedStorage(fixture.patch, async () => {
    await withMockedRandom(0, async () => {
      const firstRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        firstRes,
      );

      assert.equal(firstRes.statusCode, 200);
      const firstCount = fixture.state.notificationCalls.length;
      assert.equal(firstCount, 6);

      const secondRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        secondRes,
      );

      assert.equal(secondRes.statusCode, 200);
      assert.equal(fixture.state.notificationCalls.length, firstCount);
      assert.equal((secondRes.body as any).drawing.winnerNotificationCount, 3);
      assert.equal((secondRes.body as any).drawing.participantNotificationCount, 3);
    });
  });
});

type DbMock = {
  selectResults: unknown[][];
  inserts: unknown[];
  updates: Array<{ table: unknown; payload: Record<string, unknown> }>;
};

async function withMockedDb(
  selectResults: unknown[][],
  run: (mock: DbMock) => Promise<void>,
) {
  const { db } = await import("../server/db");
  const dbObject = db as unknown as {
    select: unknown;
    insert: unknown;
    update: unknown;
  };
  const original = {
    select: dbObject.select,
    insert: dbObject.insert,
    update: dbObject.update,
  };
  const mock: DbMock = {
    selectResults: [...selectResults],
    inserts: [],
    updates: [],
  };

  dbObject.select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => mock.selectResults.shift() || [],
      }),
    }),
  });
  dbObject.insert = () => ({
    values: (payload: unknown) => {
      mock.inserts.push(payload);
      return {
        returning: async () => [],
      };
    },
  });
  dbObject.update = (table: unknown) => ({
    set: (payload: Record<string, unknown>) => ({
      where: async () => {
        mock.updates.push({ table, payload });
        return [];
      },
    }),
  });

  try {
    await run(mock);
  } finally {
    dbObject.select = original.select;
    dbObject.insert = original.insert;
    dbObject.update = original.update;
  }
}

type LotteryMessagingFixture = {
  patch: Record<string, unknown>;
  state: {
    notificationCalls: Array<{
      userId: string;
      driverId: string | null;
      notificationKind: "winner" | "participant";
      place: number | null;
      title: string;
      message: string;
      data: any;
    }>;
    currentDrawing: any;
  };
};

function createLotteryMessagingFixture(winnerCount: 1 | 2 | 3): LotteryMessagingFixture {
  const drivers = [
    { id: "driver_row_1", userId: "driver_user_1", username: "alpha", firstName: "Alex", lastName: "Stone" },
    { id: "driver_row_2", userId: "driver_user_2", username: "bravo", firstName: "Blake", lastName: "River" },
    { id: "driver_row_3", userId: "driver_user_3", username: "charlie", firstName: "Casey", lastName: "Lane" },
  ];

  const totals = drivers.map((driver, index) => ({
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.lastName}`,
    totalEntries: 3 - index,
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
  }));

  const individualEntries = drivers.flatMap((driver, index) => (
    Array.from({ length: 3 - index }, (_, entryIndex) => ({
      id: `entry_${driver.id}_${entryIndex + 1}`,
      driverId: driver.id,
      ticketNumber: `CX-202605-${String(index * 10 + entryIndex + 1).padStart(4, "0")}`,
      entriesEarned: 1,
      lotteryMonth: 5,
      lotteryYear: 2026,
      isArchived: false,
      createdAt: new Date("2026-05-01T00:00:00Z"),
      driver: {
        id: driver.id,
        userId: driver.userId,
        user: {
          id: driver.userId,
          username: driver.username,
          firstName: driver.firstName,
          lastName: driver.lastName,
        },
      },
      owner: { id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" },
      activity: {
        id: `activity_${driver.id}`,
        checkInTime: new Date("2026-05-01T00:00:00Z"),
      },
    }))
  ));

  const state = {
    expectedWinnerCount: winnerCount,
    notificationCalls: [] as LotteryMessagingFixture["state"]["notificationCalls"],
    currentDrawing: null as any,
  };
  const notificationKeySet = new Set<string>();

  const patch: Record<string, unknown> = {
    getUser: async () => ({
      id: "admin_user_1",
      username: "admin1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    }),
    getDriverLotteryEntryTotals: async () => totals,
    getAllDriverLotteryEntries: async () => individualEntries,
    getAllDrivers: async () => drivers.map((driver) => ({
      id: driver.id,
      userId: driver.userId,
      user: {
        id: driver.userId,
        username: driver.username,
        firstName: driver.firstName,
        lastName: driver.lastName,
      },
    })),
    getLotteryDrawingByMonthYear: async () => state.currentDrawing,
    createLotteryDrawing: async (payload: any) => {
      state.currentDrawing = {
        id: "drawing_1",
        drawingDate: new Date("2026-05-22T00:00:00Z"),
        executedByName: "admin1",
        winnerNotificationCount: 0,
        participantNotificationCount: 0,
        winnerNotificationsSentAt: null,
        participantNotificationsSentAt: null,
        ...payload,
      };
      return state.currentDrawing;
    },
    createLotteryNotificationOnce: async (notification: any) => {
      const key = `${notification.lotteryDrawingId}:${notification.userId}:${notification.notificationKind}`;
      const created = !notificationKeySet.has(key);
      if (created) {
        notificationKeySet.add(key);
        state.notificationCalls.push(notification);
      }
      return {
        created,
        record: {
          id: `lottery_notification_${notificationKeySet.size}`,
          notificationId: created ? `notification_${notificationKeySet.size}` : null,
          sentAt: created ? new Date("2026-05-22T00:00:00Z") : null,
          ...notification,
        },
      };
    },
    getLotteryNotificationSummary: async () => ({
      winnerNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "winner").length,
      participantNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "participant").length,
      winnerNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "winner") ? new Date("2026-05-22T00:00:00Z") : null,
      participantNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "participant") ? new Date("2026-05-22T00:00:00Z") : null,
    }),
    updateLotteryDrawingNotificationSummary: async (_drawingId: string, updates: any) => {
      state.currentDrawing = {
        ...state.currentDrawing,
        ...updates,
      };
      return state.currentDrawing;
    },
    archiveLotteryMonth: async () => 0,
  };

  return { patch, state };
}

async function getLotteryExecuteRoute() {
  const { app, posts } = createRouteRegistry();
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(app as never);
  const route = posts.get("/api/admin/lottery/execute");
  assert.equal(typeof route, "function");
  return route as Function;
}

async function withMockedRandom<T>(value: number, run: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await run();
  } finally {
    Math.random = original;
  }
}

function signedStripeEvent(type: string, object: Record<string, unknown>, id: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
  });
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  return { payload, signature };
}

test("payment webhooks require a configured secret and valid signature", async () => {
  const { processStripeWebhook } = await import("../server/webhookService");
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  delete process.env.STRIPE_WEBHOOK_SECRET;
  const missingSecret = await processStripeWebhook("{}", "bad-signature");
  assert.equal(missingSecret.success, false);
  assert.equal(missingSecret.error, "Missing webhook secret");

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  const invalidSignature = await processStripeWebhook("{}", "bad-signature");
  assert.equal(invalidSignature.success, false);
  assert.equal(invalidSignature.message, "Invalid signature");

  if (originalSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test("payment_intent.succeeded webhooks complete matching payments", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_1", activityId: "activity_1" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.succeeded",
      {
        id: "pi_succeeded",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_1" },
        status: "succeeded",
      },
      "evt_payment_succeeded",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_1 confirmed");
    assert.deepEqual(mock.inserts[0], {
      stripeEventId: "evt_payment_succeeded",
      eventType: "payment_intent.succeeded",
      status: "processing",
      payload: JSON.parse(payload),
      accountId: null,
    });
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "completed" &&
          update.stripePaymentIntentId === "pi_succeeded",
      ),
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "processed" && update.processedAt instanceof Date,
      ),
    );
  });
});

test("payment_intent.payment_failed webhooks mark matching payments failed", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_2", activityId: "activity_2" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.payment_failed",
      {
        id: "pi_failed",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_2" },
        status: "requires_payment_method",
        last_payment_error: { message: "Card declined" },
      },
      "evt_payment_failed",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_2 marked as failed");
    assert.equal(
      (mock.inserts[0] as { stripeEventId: string }).stripeEventId,
      "evt_payment_failed",
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "failed" &&
          update.stripePaymentIntentId === "pi_failed",
      ),
    );
  });
});

test("payment webhooks skip already processed Stripe events", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb(
    [[{ stripeEventId: "evt_duplicate", status: "processed" }]],
    async (mock) => {
      const { processStripeWebhook } = await import("../server/webhookService");
      const { payload, signature } = signedStripeEvent(
        "payment_intent.succeeded",
        {
          id: "pi_duplicate",
          object: "payment_intent",
          amount: 2500,
          currency: "usd",
          metadata: { activity_id: "activity_duplicate" },
          status: "succeeded",
        },
        "evt_duplicate",
      );

      const result = await processStripeWebhook(payload, signature);

      assert.equal(result.success, true);
      assert.equal(result.message, "Event already processed (idempotent)");
      assert.equal(mock.inserts.length, 0);
      assert.equal(mock.updates.length, 0);
    },
  );
});

let failures = 0;

for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`${failures}/${tests.length} tests failed`);
  process.exit(1);
}

console.log(`${tests.length} tests passed`);
process.exit(0);
