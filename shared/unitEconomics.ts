import { z } from "zod";

export const unitEconomicsMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const unitEconomicsCostInputSchema = z.object({
  month: unitEconomicsMonthSchema,
  provider: z.string().trim().min(1).max(80),
  category: z.enum(["hosting", "database", "email", "domain_dns", "evidence_storage", "payments", "other"]),
  amountCents: z.number().int().min(0).max(100_000_000),
  notes: z.string().trim().max(500).optional().default(""),
  sourceUrl: z.string().trim().url().max(500).or(z.literal("")).optional().default(""),
});
export const unitEconomicsAssumptionInputSchema = z.object({
  month: unitEconomicsMonthSchema,
  feePerValidatedLoadCents: z.number().int().min(0).max(100_000),
  paymentProcessingPercent: z.number().min(0).max(100),
  paymentProcessingFixedCents: z.number().int().min(0).max(10_000),
  evidenceStorageProvider: z.string().trim().min(1).max(80),
  evidenceStorageNotes: z.string().trim().max(500).optional().default(""),
});
const scenarioOverrideSchema = z.object({
  lowMonthlyCostCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  expectedMonthlyCostCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  highMonthlyCostCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  launchUsageAssumptions: z.string().trim().max(500).optional(),
});
export const unitEconomicsScenarioOverridesSchema = z.record(z.string().trim().min(1).max(80), scenarioOverrideSchema);

export type UnitEconomicsCostInput = z.infer<typeof unitEconomicsCostInputSchema>;
export type UnitEconomicsAssumptionInput = z.infer<typeof unitEconomicsAssumptionInputSchema>;
export type UnitEconomicsScenarioOverrides = z.infer<typeof unitEconomicsScenarioOverridesSchema>;

export type UnitEconomicsCostStatus = "confirmed" | "estimated" | "usage_based" | "unconfirmed" | "free";
export type UnitEconomicsBillingCadence = "monthly" | "annual" | "per_transaction" | "per_unit";
export type UnitEconomicsCostModel = "fixed" | "variable";

export type UnitEconomicsProviderBaseline = {
  provider: string;
  category: UnitEconomicsCostInput["category"];
  amountCents: number | null;
  lowMonthlyCostCents: number | null;
  expectedMonthlyCostCents: number | null;
  highMonthlyCostCents: number | null;
  status: UnitEconomicsCostStatus;
  evidenceStatus: "confirmed" | "estimated" | "usage_based" | "account_quote_required" | "not_configured";
  billingCadence: UnitEconomicsBillingCadence;
  costModel: UnitEconomicsCostModel;
  currentPlan: string;
  productionPlan: string;
  fixedCommitment: string;
  includedUsage: string;
  meteredRates: string;
  launchUsageAssumptions: string;
  formula: string;
  notes: string;
  sourceUrl: string;
  researchDate: string;
  includedInCalculation: boolean;
  separatelyCalculated?: boolean;
};

// Public list prices and explicitly labeled planning scenarios. Account plans,
// invoice amounts, and usage are not available from repository configuration.
const UNIT_ECONOMICS_RESEARCH_DATE = "2026-10-02";

export const unitEconomicsProviderBaseline: UnitEconomicsProviderBaseline[] = [
  {
    provider: "Railway application hosting", category: "hosting", amountCents: 2_000, lowMonthlyCostCents: 2_000, expectedMonthlyCostCents: 2_000, highMonthlyCostCents: 6_000,
    status: "estimated", evidenceStatus: "estimated", billingCadence: "monthly", costModel: "variable",
    currentPlan: "Account plan not confirmed", productionPlan: "Pro workspace plan (production-oriented public list plan)",
    fixedCommitment: "$20/workspace/month; includes $20 monthly usage credits",
    includedUsage: "The $20 credit offsets metered service resource use; it is not additional credit above the plan fee.",
    meteredRates: "Memory $10/GB-month; CPU $20/vCPU-month; volume $0.15/GB-month; service egress $0.05/GB.",
    launchUsageAssumptions: "Illustrative low/expected/high total metered resource use before credit: $10/$20/$60 per month. Replace from Railway usage/invoice.",
    formula: "max($20 plan fee, metered memory + CPU + volume + service egress).",
    notes: "Railway is documented as the production host. Workspace plan and actual resource breakdown are not exposed by repository configuration; low/expected/high are usage scenarios, not invoice facts.",
    sourceUrl: "https://railway.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Railway Object Storage", category: "evidence_storage", amountCents: 150, lowMonthlyCostCents: 75, expectedMonthlyCostCents: 150, highMonthlyCostCents: 750,
    status: "estimated", evidenceStatus: "estimated", billingCadence: "per_unit", costModel: "variable",
    currentPlan: "Bucket name orderly-duffel is recorded in prior operating context; active provider/account is not confirmed by repository configuration",
    productionPlan: "Railway Storage Bucket, Standard tier; Pro has unlimited capacity",
    fixedCommitment: "$0 fixed bucket fee; storage is metered",
    includedUsage: "S3 operations and bucket egress are unlimited/free; Free plan capacity is limited and bucket access suspends on credit exhaustion.",
    meteredRates: "$0.015/GB-month stored; uploading from a Railway service separately incurs Railway service egress at $0.05/GB (counted under Railway hosting, not again here).",
    launchUsageAssumptions: "50/100/500 GB-month stored (illustrative, editable in monthly usage assumptions); storage only in this row.",
    formula: "stored GB-month × $0.015; upload egress is counted once in Railway application hosting.",
    notes: "Evidence-storage code supports S3-compatible, GCS, and Replit storage; deployed environment selection and bucket invoice are unavailable. Retain orderly-duffel reference, verify active backend, and replace volume with measured usage.",
    sourceUrl: "https://docs.railway.com/storage-buckets/billing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Neon PostgreSQL", category: "database", amountCents: 2_429, lowMonthlyCostCents: 1_145, expectedMonthlyCostCents: 2_429, highMonthlyCostCents: 12_105,
    status: "estimated", evidenceStatus: "estimated", billingCadence: "per_unit", costModel: "variable",
    currentPlan: "Neon production database documented; account plan, compute history, restore retention, and invoice not in repository",
    productionPlan: "Scale modeled for production private networking, longer restore history, IP allow rules, SLA, and support; confirm purchased plan",
    fixedCommitment: "No monthly minimum on public Scale pricing; support/agreement charges may require account confirmation",
    includedUsage: "500 GB-month public egress per project; Scale includes private networking capability, protected branches, up to 30-day history, and SLA.",
    meteredRates: "Compute $0.222/CU-hour; Postgres storage $0.35/GB-month; instant restore $0.20/GB-month; snapshots $0.09/GB-month; private transfer $0.01/GB; public egress above 500 GB $0.10/GB.",
    launchUsageAssumptions: "CU-hours 50/100/500; storage 1/5/10 GB; restore history 0/1/5 GB-month; snapshots 0/1/5 GB-month; private transfer 0/5/10 GB; public egress overage 0/0/50 GB. All illustrative.",
    formula: "CU-hours×$0.222 + storage GB-month×$0.35 + restore GB-month×$0.20 + snapshot GB-month×$0.09 + private GB×$0.01 + max(0, public egress GB−500)×$0.10.",
    notes: "Production Scale is modeled instead of entry Free/Launch because the official plan comparison lists SLA/private networking/support and longer recovery history on Scale. Account-required features and chosen compute sizing still need confirmation.",
    sourceUrl: "https://neon.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Vercel", category: "hosting", amountCents: 2_000, lowMonthlyCostCents: 2_000, expectedMonthlyCostCents: 2_000, highMonthlyCostCents: 15_178,
    status: "estimated", evidenceStatus: "estimated", billingCadence: "monthly", costModel: "variable",
    currentPlan: "No Vercel deployment project or runtime configuration found in the repository; actual use unconfirmed",
    productionPlan: "Pro, one deploying developer seat if Vercel is an active production service; Enterprise quote for contractual SLA/support needs",
    fixedCommitment: "$20/month per Pro developer seat; Pro has 10M CDN requests and 1 TB transfer listed as included",
    includedUsage: "$20/seat/month; 10M CDN requests and 1 TB fast data transfer/month; validate included usage allocation and invoice credit with account.",
    meteredRates: "CDN requests starting $2/million; fast transfer starting $0.15/GB; Fluid CPU $0.128/hour, provisioned memory $0.0106/GB-hour, function invocations $0.60/million.",
    launchUsageAssumptions: "Scenario assumes one Pro deploying seat; high case adds 1,000 Fluid CPU-hours, 300 GB-hours memory, 1M invocations, 5M CDN requests, and 200 GB transfer over listed allowance.",
    formula: "$20/seat + CDN/transfer overages + Fluid CPU + provisioned memory + function invocations. Vercel deployment is conditional and excluded from totals until active deployment is verified.",
    notes: "Repository config documents Railway hosting and contains no Vercel project/deployment config; scenario is shown for reconciliation only, not treated as an actual active vendor charge.",
    sourceUrl: "https://vercel.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false,
  },
  {
    provider: "Squarespace email", category: "email", amountCents: null, lowMonthlyCostCents: null, expectedMonthlyCostCents: null, highMonthlyCostCents: null,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "monthly", costModel: "fixed",
    currentPlan: "Google Workspace through Squarespace has been referenced, but no active account, seat count, plan, or bill is available",
    productionPlan: "Confirm Workspace edition, seat count, billing commitment, and Squarespace reseller rate",
    fixedCommitment: "Unknown until reseller agreement/invoice is reviewed",
    includedUsage: "Depends on Workspace edition; organization storage and user features vary by plan.",
    meteredRates: "Unknown Squarespace reseller price; do not substitute a Google direct price without confirming the reseller agreement.",
    launchUsageAssumptions: "One mailbox is a placeholder for volume only; per-seat reseller rate is unknown.",
    formula: "mailbox seats × confirmed reseller monthly seat rate + any confirmed add-ons/overages.",
    notes: "Squarespace billing documentation and account invoice are not available here. Cost remains unpriced/unknown rather than $0.",
    sourceUrl: "https://support.squarespace.com/hc/en-us/articles/205812258-Google-Workspace-pricing-billing-and-invoices", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false,
  },
  {
    provider: "Squarespace domains", category: "domain_dns", amountCents: null, lowMonthlyCostCents: null, expectedMonthlyCostCents: null, highMonthlyCostCents: null,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "annual", costModel: "fixed",
    currentPlan: "Registrar/account and domains/TLDs not confirmed from deploy config or invoices",
    productionPlan: "Renew actual registered domain(s) at their specific TLD renewal rates",
    fixedCommitment: "Annual renewal total unknown; no annual amount is assumed",
    includedUsage: "Not applicable; renewal is domain/TLD-specific",
    meteredRates: "No universal rate: exact TLD, premium status, and renewal invoice required.",
    launchUsageAssumptions: "One domain placeholder; domain count and annual renewal price are unknown.",
    formula: "sum(confirmed domain renewal invoices)/12.",
    notes: "Annual cost must be obtained from the domain account/invoice; the prior $40 allowance was not supported by account evidence and is removed.",
    sourceUrl: "https://support.squarespace.com/hc/en-us/articles/218193418-Squarespace-domain-renewals", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false,
  },
  {
    provider: "Cloudflare DNS and proxy", category: "domain_dns", amountCents: 20_000, lowMonthlyCostCents: 2_000, expectedMonthlyCostCents: 20_000, highMonthlyCostCents: 25_000,
    status: "estimated", evidenceStatus: "estimated", billingCadence: "monthly", costModel: "fixed",
    currentPlan: "Cloudflare DNS for cretexchange.app is documented; zone plan/account invoice not available",
    productionPlan: "Business annual plan modeled where production SLA/support is required; confirm actual chosen plan",
    fixedCommitment: "Pro $20/mo annual or $25 monthly; Business $200/mo annual or $250 monthly",
    includedUsage: "DNS, DDoS protection, CDN, SSL included; Business includes 100% uptime SLA and ticket/chat support. Free has no uptime SLA.",
    meteredRates: "Plan/annual commitment; applicable add-ons are separate and not assumed.",
    launchUsageAssumptions: "Low Pro annual $20; expected Business annual $200; high Business month-to-month $250. These are alternatives, not concurrent subscriptions.",
    formula: "selected Cloudflare zone plan charge; do not add a second plan for DNS and proxy on the same zone.",
    notes: "Production DNS is documented; selected plan and billing cadence are not. Business scenario is used for expected production cost because Cloudflare lists its SLA/support; lower Pro option is shown transparently.",
    sourceUrl: "https://www.cloudflare.com/plans/network-cdn/", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Cloudflare Workers", category: "hosting", amountCents: 0, lowMonthlyCostCents: 0, expectedMonthlyCostCents: 0, highMonthlyCostCents: 840,
    status: "unconfirmed", evidenceStatus: "not_configured", billingCadence: "monthly", costModel: "variable",
    currentPlan: "No Worker deployment or binding found in repository; inactive/not configured",
    productionPlan: "Paid Workers Standard only if a Worker is deployed; not an app requirement evidenced today",
    fixedCommitment: "$5/month/account paid-plan minimum; not incurred unless enabled",
    includedUsage: "Paid includes 10M requests and 30M CPU-ms/month; Free has 100k requests/day and 10ms CPU/invocation hard limits.",
    meteredRates: "$0.30/million requests over allowance; $0.02/million CPU-ms over allowance; no egress/bandwidth charge.",
    launchUsageAssumptions: "Current modeled use is disabled/zero because no Worker exists in the repository. High scenario is conditional: 20M requests and 50M CPU-ms on paid plan.",
    formula: "0 while no Worker is deployed; otherwise $5 + request and CPU overages.",
    notes: "Zero is the modeled current cost because no product is configured, not a claim that a production Workers allowance is a sustainable $0 plan.",
    sourceUrl: "https://developers.cloudflare.com/workers/platform/pricing/", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Stripe payment processing", category: "payments", amountCents: 4_500, lowMonthlyCostCents: 1_125, expectedMonthlyCostCents: 4_500, highMonthlyCostCents: 22_500,
    status: "usage_based", evidenceStatus: "usage_based", billingCadence: "per_transaction", costModel: "variable",
    currentPlan: "Stripe Payments integration exists in code; live account pricing/region/method mix and current enabled state not verified",
    productionPlan: "Standard US domestic online card pricing used as a transparent reference case; negotiated, international, and non-card rates require account invoice",
    fixedCommitment: "No monthly platform commitment assumed for standard card processing",
    includedUsage: "No free-use allowance assumed",
    meteredRates: "US domestic online card reference: 2.9% + $0.30 per successful card transaction; other methods, international cards, currency conversion, disputes, and negotiated rates differ.",
    launchUsageAssumptions: "25/100/500 verified loads and $5.00 average processed amount per load (platform fee only); driver incentive/other charge amount is not present in this estimate.",
    formula: "verified-load card transactions × (average processed amount × 2.9% + $0.30); amount model is a floor until actual average owner charge and payment mix are provided.",
    notes: "Kept separate from fixed provider costs and customer revenue. Do not add a second Stripe processing amount on top of the formula; a recorded monthly Stripe processing invoice replaces the modeled processing total.",
    sourceUrl: "https://stripe.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true, separatelyCalculated: true,
  },
  {
    provider: "Stripe Connect and payouts", category: "payments", amountCents: null, lowMonthlyCostCents: null, expectedMonthlyCostCents: null, highMonthlyCostCents: null,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "per_transaction", costModel: "variable",
    currentPlan: "Stripe Connect APIs/account onboarding and transfer code exist; account configuration, connected-account pricing model, active accounts, and payout mix are unavailable",
    productionPlan: "Confirm Stripe Connect pricing model and settlement/payout terms with the platform account",
    fixedCommitment: "Account-specific fees/commitment not confirmed",
    includedUsage: "Depends on Connect account type, fee payer, charge type, and pricing agreement.",
    meteredRates: "Connect account and payout charges depend on account/pricing configuration; no account rate is invented. Standard vs instant payout rates differ.",
    launchUsageAssumptions: "Connected accounts, active accounts, transfers, standard payouts, instant payouts, reversals, and account country mix unknown.",
    formula: "active connected accounts × confirmed account rate + payout count × confirmed payout rate + any confirmed percentage/network fees.",
    notes: "Keep Connect/payout charges separate from Stripe card processing. Obtain Stripe Dashboard pricing/invoice and payout method mix; amount remains unknown until then.",
    sourceUrl: "https://stripe.com/connect/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false, separatelyCalculated: true,
  },
  {
    provider: "Google Maps Platform", category: "other", amountCents: 0, lowMonthlyCostCents: 0, expectedMonthlyCostCents: 0, highMonthlyCostCents: 10_500,
    status: "estimated", evidenceStatus: "usage_based", billingCadence: "per_unit", costModel: "variable",
    currentPlan: "Google Maps JavaScript API key references in UI; account, billing configuration, actual map loads/SKU invoice not available",
    productionPlan: "Google Maps Platform pay-as-you-go, Dynamic Maps Essentials SKU if the maps are billable under that SKU",
    fixedCommitment: "No fixed fee modeled",
    includedUsage: "Dynamic Maps: 10,000 free billable events/month, per Google published global pricing at research date.",
    meteredRates: "Dynamic Maps $7/1,000 events through 100,000 monthly events; progressive lower volume tiers at higher usage.",
    launchUsageAssumptions: "500/5,000/25,000 Dynamic Maps events/month. A Places library is loaded by one map picker, but no Places API requests were found; not charged as a separate Places SKU.",
    formula: "max(0, Dynamic Maps events−10,000) × $7/1,000 for the first paid tier; higher tiers use Google’s published progressive rates.",
    notes: "Google Geocoding API is not used in the inspected flows; address autocomplete and server address lookup use Mapbox. Usage remains editable and must be reconciled to Cloud Billing SKUs.",
    sourceUrl: "https://developers.google.com/maps/billing-and-pricing/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Mapbox Geocoding", category: "other", amountCents: null, lowMonthlyCostCents: null, expectedMonthlyCostCents: null, highMonthlyCostCents: null,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "per_unit", costModel: "variable",
    currentPlan: "Mapbox Geocoding API v5 is called for address autocomplete and server geocoding; billing account/rate unavailable",
    productionPlan: "Commercial Application License required for production vehicle use; obtain Mapbox license/price agreement",
    fixedCommitment: "Commercial Application License annual subscription/seat pricing is quote-specific and not published as a fixed amount here",
    includedUsage: "Usage-dependent geocoding requests; current monthly request volume unknown.",
    meteredRates: "Public pricing page did not expose a stable request rate in this research fetch; enter current account rate/invoice rather than assume one.",
    launchUsageAssumptions: "100/1,000/10,000 forward geocoding requests/month are illustrative; actual request counts unavailable.",
    formula: "commercial license annual fee/12 + request count × confirmed geocoding rate/1,000.",
    notes: "Production vehicle-use licensing requirements apply per Mapbox pricing notice. Current rates and commercial license quote were not available; cost remains unknown pending account quote.",
    sourceUrl: "https://www.mapbox.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false,
  },
  {
    provider: "Platform notifications", category: "email", amountCents: 2_000, lowMonthlyCostCents: 2_000, expectedMonthlyCostCents: 2_000, highMonthlyCostCents: 3_500,
    status: "estimated", evidenceStatus: "not_configured", billingCadence: "monthly", costModel: "variable",
    currentPlan: "No outbound transactional-email provider/integration found; current password reset returns a token but does not send email",
    productionPlan: "Resend Pro shown only as an illustrative production-capable option; not selected or integrated",
    fixedCommitment: "Resend Pro public list tier $20/month for 50,000 emails; no annual discount",
    includedUsage: "50,000 emails/month; paid plans do not have Free plan's 100-email/day cap",
    meteredRates: "$0.90 per additional 1,000 emails for the $20 Pro tier (higher volume plan tiers also published)",
    launchUsageAssumptions: "1,000/25,000/60,000 emails/month, illustrative. Resend is a benchmark only; actual provider/contract unknown.",
    formula: "If Resend Pro is selected: $20 + max(0, emails−50,000)×$0.90/1,000. Not counted in current costs until adopted; replace vendor/rate.",
    notes: "Do not describe Resend as an existing CreteXchange vendor. Repo inspection found no outbound email integration. This scenario demonstrates a public price benchmark only.",
    sourceUrl: "https://resend.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: false,
  },
];

export type UnitEconomicsRecordedCost = {
  id?: string | null;
  provider: string;
  category?: UnitEconomicsCostInput["category"];
  amountCents: number;
  notes?: string | null;
  sourceUrl?: string | null;
};

export type UnitEconomicsProviderCost = UnitEconomicsProviderBaseline & {
  id: string | null;
  isRecorded: boolean;
};

function recordedStatus(row: UnitEconomicsRecordedCost): UnitEconomicsCostStatus {
  const notes = String(row.notes || "").toLowerCase();
  if (row.amountCents === 0 && notes.includes("free")) return "free";
  if (notes.includes("estimate") || notes.includes("estimated") || notes.includes("pending invoice")) return "estimated";
  return "confirmed";
}

export function buildUnitEconomicsProviderRegister(
  recordedCosts: UnitEconomicsRecordedCost[],
  scenarioOverrides: UnitEconomicsScenarioOverrides = {},
): UnitEconomicsProviderCost[] {
  const providerKey = (provider: string) => provider.trim().toLowerCase();
  const recordedByProvider = new Map(recordedCosts.map((row) => [providerKey(row.provider), row]));
  const baselineKeys = new Set(unitEconomicsProviderBaseline.map((entry) => providerKey(entry.provider)));
  const baseline = unitEconomicsProviderBaseline.map((entry) => {
    const recorded = recordedByProvider.get(providerKey(entry.provider));
    if (!recorded) {
      const override = scenarioOverrides[entry.provider];
      const lowMonthlyCostCents = override?.lowMonthlyCostCents ?? entry.lowMonthlyCostCents;
      const expectedMonthlyCostCents = override?.expectedMonthlyCostCents ?? entry.expectedMonthlyCostCents;
      const highMonthlyCostCents = override?.highMonthlyCostCents ?? entry.highMonthlyCostCents;
      const hasExpectedOverride = override?.expectedMonthlyCostCents != null;
      return {
        id: null,
        ...entry,
        amountCents: expectedMonthlyCostCents,
        lowMonthlyCostCents,
        expectedMonthlyCostCents,
        highMonthlyCostCents,
        launchUsageAssumptions: override?.launchUsageAssumptions ?? entry.launchUsageAssumptions,
        status: hasExpectedOverride && entry.evidenceStatus === "account_quote_required" ? "estimated" as const : entry.status,
        evidenceStatus: hasExpectedOverride && entry.evidenceStatus === "account_quote_required" ? "estimated" as const : entry.evidenceStatus,
        includedInCalculation: entry.includedInCalculation || hasExpectedOverride,
        notes: hasExpectedOverride ? `${entry.notes} Scenario cost entered locally; confirm against usage or invoice.` : entry.notes,
        isRecorded: false,
      };
    }
    return {
      ...entry,
      ...recorded,
      id: recorded.id ?? null,
      category: recorded.category ?? entry.category,
      amountCents: recorded.amountCents,
      lowMonthlyCostCents: recorded.amountCents,
      expectedMonthlyCostCents: recorded.amountCents,
      highMonthlyCostCents: recorded.amountCents,
      status: recordedStatus(recorded),
      evidenceStatus: "confirmed" as const,
      notes: recorded.notes ?? "",
      sourceUrl: recorded.sourceUrl ?? "",
      isRecorded: true,
      includedInCalculation: true,
    };
  });
  const custom = recordedCosts.filter((row) => !baselineKeys.has(providerKey(row.provider))).map((row) => ({
    id: row.id ?? null,
    provider: row.provider,
    category: row.category ?? "other",
    amountCents: row.amountCents,
    lowMonthlyCostCents: row.amountCents,
    expectedMonthlyCostCents: row.amountCents,
    highMonthlyCostCents: row.amountCents,
    notes: row.notes ?? "",
    sourceUrl: row.sourceUrl ?? "",
    status: recordedStatus(row),
    evidenceStatus: "confirmed" as const,
    billingCadence: "monthly" as const,
    costModel: "fixed" as const,
    currentPlan: "Recorded monthly amount",
    productionPlan: "Recorded monthly amount",
    fixedCommitment: "Actual monthly amount overrides any published estimate",
    includedUsage: "Recorded invoice/cost override",
    meteredRates: "Recorded invoice/cost override",
    launchUsageAssumptions: "Not modeled; actual record is authoritative",
    formula: "Recorded selected-month amount (overrides provider scenario)",
    researchDate: UNIT_ECONOMICS_RESEARCH_DATE,
    isRecorded: true,
    includedInCalculation: true,
  }));
  return [...baseline, ...custom];
}

export function calculateUnitEconomicsModeledMonthlyCosts(
  costs: UnitEconomicsProviderCost[],
  scenario: "low" | "expected" | "high" = "expected",
): number {
  const costField = `${scenario}MonthlyCostCents` as const;
  return costs.reduce((total, cost) => total +
    (cost.includedInCalculation && !cost.separatelyCalculated ? cost[costField] || 0 : 0), 0);
}

export function calculateUnitEconomicsScenarioMonthlyCost(
  costs: UnitEconomicsProviderCost[],
  scenario: "low" | "expected" | "high" = "expected",
): number {
  const costField = `${scenario}MonthlyCostCents` as const;
  return costs.reduce((total, cost) => total +
    (cost.includedInCalculation ? cost[costField] || 0 : 0), 0);
}

export function calculateUnitEconomicsMonth(input: {
  month: string; validatedLoads: number; feePerValidatedLoadCents: number;
  paymentProcessingPercent: number; paymentProcessingFixedCents: number; fixedCostsCents: number;
  averageStripeChargeCents?: number;
  recordedStripeProcessingCents?: number | null;
  recordedOtherVariableCostsCents?: number;
}) {
  const averageStripeChargeCents = input.averageStripeChargeCents ?? input.feePerValidatedLoadCents;
  const processingPerLoadCents = Math.round(averageStripeChargeCents * input.paymentProcessingPercent / 100) + input.paymentProcessingFixedCents;
  const grossRevenueCents = input.validatedLoads * input.feePerValidatedLoadCents;
  const variableCostsCents = input.recordedStripeProcessingCents == null
    ? input.validatedLoads * processingPerLoadCents
    : input.recordedStripeProcessingCents;
  const totalVariableCostsCents = variableCostsCents + (input.recordedOtherVariableCostsCents ?? 0);
  const contributionProfitCents = grossRevenueCents - totalVariableCostsCents - input.fixedCostsCents;
  const contributionPerLoadCents = input.feePerValidatedLoadCents - processingPerLoadCents;
  return { ...input, processingPerLoadCents, grossRevenueCents, variableCostsCents: totalVariableCostsCents, contributionProfitCents,
    contributionMarginPercent: grossRevenueCents ? contributionProfitCents / grossRevenueCents * 100 : 0,
    breakEvenLoads: contributionPerLoadCents > 0 ? Math.ceil(input.fixedCostsCents / contributionPerLoadCents) : null,
    profitPerValidatedLoadCents: input.validatedLoads ? Math.round(contributionProfitCents / input.validatedLoads) : null,
    isFiveDollarFeeProfitable: contributionProfitCents >= 0 };
}

export function buildUnitEconomicsCsv(report: {
  month: string;
  profitabilityComplete: boolean;
  missingProviderCount: number;
  scenarioMonthlyCostsCents: { low: number; expected: number; high: number };
  metrics: ReturnType<typeof calculateUnitEconomicsMonth>;
  costs: UnitEconomicsProviderCost[];
}): string {
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines: unknown[][] = [
    ["CreteXchange Unit Economics", report.month],
    ["Validated loads", report.metrics.validatedLoads],
    ["Customer fee per validated load", report.metrics.feePerValidatedLoadCents / 100],
    ["Revenue", report.metrics.grossRevenueCents / 100],
    ["Expected modeled monthly provider costs (scenario)", report.scenarioMonthlyCostsCents.expected / 100],
    ["Low modeled monthly provider costs (scenario)", report.scenarioMonthlyCostsCents.low / 100],
    ["High modeled monthly provider costs (scenario)", report.scenarioMonthlyCostsCents.high / 100],
    ["Current month recorded/modeled operating costs", report.metrics.fixedCostsCents / 100],
    ["Stripe processing and recorded Connect/payout costs", report.metrics.variableCostsCents / 100],
    ["Contribution after modeled costs", report.metrics.contributionProfitCents / 100],
    ["Profitability complete", report.profitabilityComplete ? "Yes" : "No"],
    ["Provider entries incomplete or not included", report.missingProviderCount],
    ["Break-even loads at $5 fee", report.metrics.breakEvenLoads],
    ["Revenue treatment", "Recorded month verified-load count × approved $5.00 planning fee; projection is separate"],
    [],
    [
      "Provider", "Category", "Current plan / use evidence", "Production plan/agreement",
      "Fixed commitment", "Included usage/credits", "Metered and overage rates",
      "Low monthly cost", "Expected monthly cost", "High monthly cost", "Launch usage assumptions",
      "Calculation formula", "Evidence classification", "Status", "Billing cadence", "Cost model",
      "Recorded override", "Included in expected total", "Calculated separately",
      "Notes", "Official source URL", "Research/effective date",
    ],
    ...report.costs.map((cost) => [
      cost.provider, cost.category, cost.currentPlan, cost.productionPlan, cost.fixedCommitment,
      cost.includedUsage, cost.meteredRates,
      cost.lowMonthlyCostCents == null ? "Unknown" : cost.lowMonthlyCostCents / 100,
      cost.expectedMonthlyCostCents == null ? "Unknown" : cost.expectedMonthlyCostCents / 100,
      cost.highMonthlyCostCents == null ? "Unknown" : cost.highMonthlyCostCents / 100,
      cost.launchUsageAssumptions, cost.formula, cost.evidenceStatus, cost.status,
      cost.billingCadence, cost.costModel, cost.isRecorded ? "Yes" : "No",
      cost.includedInCalculation ? "Yes" : "No", cost.separatelyCalculated ? "Yes" : "No",
      cost.notes, cost.sourceUrl, cost.researchDate,
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}
