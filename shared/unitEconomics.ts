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
  usageInputs: z.record(z.string().trim().min(1).max(80), z.object({
    low: z.number().min(0).max(100_000_000).optional(),
    expected: z.number().min(0).max(100_000_000).optional(),
    high: z.number().min(0).max(100_000_000).optional(),
  })).optional(),
  unitRatesCentsPerUnit: z.record(z.string().trim().min(1).max(80), z.number().min(0).max(100_000_000)).optional(),
  percentageRates: z.record(z.string().trim().min(1).max(80), z.number().min(0).max(100)).optional(),
  launchUsageAssumptions: z.string().trim().max(500).optional(),
});
export const unitEconomicsScenarioOverridesSchema = z.record(z.string().trim().min(1).max(80), scenarioOverrideSchema);

export type UnitEconomicsCostInput = z.infer<typeof unitEconomicsCostInputSchema>;
export type UnitEconomicsAssumptionInput = z.infer<typeof unitEconomicsAssumptionInputSchema>;
export type UnitEconomicsScenarioOverrides = z.infer<typeof unitEconomicsScenarioOverridesSchema>;

export type UnitEconomicsCostStatus = "confirmed" | "estimated" | "usage_based" | "unconfirmed" | "free";
export type UnitEconomicsBillingCadence = "monthly" | "annual" | "per_transaction" | "per_unit";
export type UnitEconomicsCostModel = "fixed" | "variable";

export type UnitEconomicsScenario = "low" | "expected" | "high";
export type UnitEconomicsUsageValues = Record<string, Partial<Record<UnitEconomicsScenario, number>>>;
export type UnitEconomicsCostComponent = {
  id: string;
  label: string;
  unit: string;
  unitRateCents: number;
  includedUnits?: number;
  percentageRate?: number;
  percentageBasisInput?: string;
  quantityInput?: string;
  isDerived?: boolean;
  roundPercentagePerUnit?: boolean;
};

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
  baseMonthlyCents: number;
  minimumMonthlyCents: number;
  usageComponents: UnitEconomicsCostComponent[];
  defaultUsageInputs: Record<string, Record<UnitEconomicsScenario, number>>;
};

// Public list prices and explicitly labeled planning scenarios. Account plans,
// invoice amounts, and usage are not available from repository configuration.
const UNIT_ECONOMICS_RESEARCH_DATE = "2026-10-02";

const unitEconomicsProviderDefinitions: Omit<UnitEconomicsProviderBaseline, "baseMonthlyCents" | "minimumMonthlyCents" | "usageComponents" | "defaultUsageInputs">[] = [
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
    provider: "Vercel", category: "hosting", amountCents: 2_000, lowMonthlyCostCents: 0, expectedMonthlyCostCents: 2_000, highMonthlyCostCents: 19_178,
    status: "estimated", evidenceStatus: "not_configured", billingCadence: "monthly", costModel: "variable",
    currentPlan: "No Vercel deployment project or runtime configuration found in the repository; actual use unconfirmed",
    productionPlan: "Pro, one deploying developer seat if Vercel is an active production service; Enterprise quote for contractual SLA/support needs",
    fixedCommitment: "$20/month per Pro developer seat; Pro has 10M CDN requests and 1 TB transfer listed as included",
    includedUsage: "$20/seat/month; 10M CDN requests and 1 TB fast data transfer/month; validate included usage allocation and invoice credit with account.",
    meteredRates: "CDN requests starting $2/million; fast transfer starting $0.15/GB; Fluid CPU $0.128/hour, provisioned memory $0.0106/GB-hour, function invocations $0.60/million.",
    launchUsageAssumptions: "Conditional plan adoption range 0/1/1 Pro seats. High case adds 1,000 Fluid CPU-hours, 300 GB-hours memory, 1M invocations, 5M CDN requests over the included 10M, and 200 GB transfer over the included 1 TB.",
    formula: "Pro seats×$20 + CDN requests above 10M×$2/M + transfer above 1TB×$0.15/GB + Fluid CPU hours×$0.128 + provisioned memory GB-hours×$0.0106 + invocations×$0.60/M.",
    notes: "Repository config documents Railway hosting and contains no Vercel project/deployment config. Conditional Pro-seat cost is included only in expected/high scenarios to show the production plan if Vercel is adopted; actual usage is unconfirmed.",
    sourceUrl: "https://vercel.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Squarespace email", category: "email", amountCents: 1_500, lowMonthlyCostCents: 700, expectedMonthlyCostCents: 1_500, highMonthlyCostCents: 3_000,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "monthly", costModel: "fixed",
    currentPlan: "Google Workspace through Squarespace has been referenced, but no active account, seat count, plan, or bill is available",
    productionPlan: "Confirm Workspace edition, seat count, billing commitment, and Squarespace reseller rate",
    fixedCommitment: "Unknown until reseller agreement/invoice is reviewed",
    includedUsage: "Depends on Workspace edition; organization storage and user features vary by plan.",
    meteredRates: "Unknown Squarespace reseller price; do not substitute a Google direct price without confirming the reseller agreement.",
    launchUsageAssumptions: "One mailbox; unconfirmed monthly reseller-price planning proxy of $7/$15/$30 per mailbox. These are transparent budget bounds, not Squarespace/Google list quotes.",
    formula: "mailbox count × editable monthly reseller-price proxy; replace proxy with confirmed Squarespace Workspace invoice and add-ons.",
    notes: "Squarespace billing documentation and account invoice are not available here. Numeric low/expected/high values are editable quote proxies and not confirmed vendor pricing.",
    sourceUrl: "https://support.squarespace.com/hc/en-us/articles/205812258-Google-Workspace-pricing-billing-and-invoices", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Squarespace domains", category: "domain_dns", amountCents: 333, lowMonthlyCostCents: 125, expectedMonthlyCostCents: 333, highMonthlyCostCents: 833,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "annual", costModel: "fixed",
    currentPlan: "Registrar/account and domains/TLDs not confirmed from deploy config or invoices",
    productionPlan: "Renew actual registered domain(s) at their specific TLD renewal rates",
    fixedCommitment: "Annual renewal total unknown; no annual amount is assumed",
    includedUsage: "Not applicable; renewal is domain/TLD-specific",
    meteredRates: "No universal rate: exact TLD, premium status, and renewal invoice required.",
    launchUsageAssumptions: "One domain; editable unconfirmed annual renewal quote proxies of $15/$40/$100 per domain, normalized monthly. Bounds are planning placeholders, not published/confirmed TLD prices.",
    formula: "domain count × editable annual renewal quote proxy ÷ 12; replace with actual TLD renewal invoices.",
    notes: "Annual cost must be obtained from the domain account/invoice. The displayed scenarios are explicit editable quote proxies, not a claim about Squarespace prices.",
    sourceUrl: "https://support.squarespace.com/hc/en-us/articles/218193418-Squarespace-domain-renewals", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
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
    provider: "Stripe Connect and payouts", category: "payments", amountCents: 2_500, lowMonthlyCostCents: 0, expectedMonthlyCostCents: 2_500, highMonthlyCostCents: 15_000,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "per_transaction", costModel: "variable",
    currentPlan: "Stripe Connect APIs/account onboarding and transfer code exist; account configuration, connected-account pricing model, active accounts, and payout mix are unavailable",
    productionPlan: "Confirm Stripe Connect pricing model and settlement/payout terms with the platform account",
    fixedCommitment: "Account-specific fees/commitment not confirmed",
    includedUsage: "Depends on Connect account type, fee payer, charge type, and pricing agreement.",
    meteredRates: "Connect account and payout charges depend on account/pricing configuration; no account rate is invented. Standard vs instant payout rates differ.",
    launchUsageAssumptions: "Account/payout quote proxy $0/$25/$150 per month pending active-account count, payout mix, and Stripe pricing agreement; editable. Does not assert any published Stripe fee.",
    formula: "Editable monthly Connect/payout quote proxy until account-type, charge-flow, connected-account, payout, and confirmed fee inputs are available; do not combine with card processing.",
    notes: "Keep Connect/payout charges separate from Stripe card processing. Numeric scenario bounds are budget placeholders, not Stripe prices; obtain Dashboard pricing/invoice and payout method mix.",
    sourceUrl: "https://stripe.com/connect/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
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
    provider: "Mapbox Geocoding", category: "other", amountCents: 25_000, lowMonthlyCostCents: 5_000, expectedMonthlyCostCents: 25_000, highMonthlyCostCents: 100_000,
    status: "unconfirmed", evidenceStatus: "account_quote_required", billingCadence: "per_unit", costModel: "variable",
    currentPlan: "Mapbox Geocoding API v5 is called for address autocomplete and server geocoding; billing account/rate unavailable",
    productionPlan: "Commercial Application License required for production vehicle use; obtain Mapbox license/price agreement",
    fixedCommitment: "Commercial Application License annual subscription/seat pricing is quote-specific and not published as a fixed amount here",
    includedUsage: "Usage-dependent geocoding requests; current monthly request volume unknown.",
    meteredRates: "Public pricing page did not expose a stable request rate in this research fetch; enter current account rate/invoice rather than assume one.",
    launchUsageAssumptions: "Editable commercial-license monthly quote proxy $50/$250/$1,000 plus 0.1/1/10 thousand requests; license price and request rates are not confirmed.",
    formula: "Editable monthly license quote proxy + request count × confirmed per-request rate; the geocoding rate is 0 until a current Mapbox quote/invoice is entered.",
    notes: "Production vehicle-use licensing requirements apply per Mapbox pricing notice. Numeric range is an explicit budget proxy, not a Mapbox quote; current commercial license and request rates require account confirmation.",
    sourceUrl: "https://www.mapbox.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
  {
    provider: "Platform notifications", category: "email", amountCents: 2_000, lowMonthlyCostCents: 2_000, expectedMonthlyCostCents: 2_000, highMonthlyCostCents: 3_500,
    status: "estimated", evidenceStatus: "not_configured", billingCadence: "monthly", costModel: "variable",
    currentPlan: "No outbound transactional-email provider/integration found; current password reset returns a token but does not send email",
    productionPlan: "Resend Pro shown only as an illustrative production-capable option; not selected or integrated",
    fixedCommitment: "Resend Pro public list tier $20/month for 50,000 emails; no annual discount",
    includedUsage: "50,000 emails/month; paid plans do not have Free plan's 100-email/day cap",
    meteredRates: "$0.90 per additional 1,000 emails for the $20 Pro tier (higher volume plan tiers also published)",
    launchUsageAssumptions: "1,000/25,000/60,000 emails/month, illustrative Resend Pro production scenario; actual provider/contract unknown.",
    formula: "If Resend Pro is selected: $20 + max(0, emails−50,000)×$0.90/1,000. This conditional plan is included in expected/high scenarios as a planning assumption, not an active vendor charge.",
    notes: "Do not describe Resend as an existing CreteXchange vendor. Repo inspection found no outbound email integration. The conditional production-plan scenario is based on public list pricing, not an active vendor charge.",
    sourceUrl: "https://resend.com/pricing", researchDate: UNIT_ECONOMICS_RESEARCH_DATE, includedInCalculation: true,
  },
];

type ProviderUsageModel = Pick<UnitEconomicsProviderBaseline, "minimumMonthlyCents" | "usageComponents" | "defaultUsageInputs"> &
  Partial<Pick<UnitEconomicsProviderBaseline, "baseMonthlyCents">>;
const providerUsageModels: Record<string, ProviderUsageModel> = {
  "Railway application hosting": {
    minimumMonthlyCents: 2_000,
    usageComponents: [{ id: "meteredSpendUsd", label: "Metered resource spend before credits", unit: "USD/month", unitRateCents: 100 }],
    defaultUsageInputs: { meteredSpendUsd: { low: 10, expected: 20, high: 60 } },
  },
  "Railway Object Storage": {
    minimumMonthlyCents: 0,
    usageComponents: [{ id: "storedGbMonths", label: "Stored object data", unit: "GB-month", unitRateCents: 1.5 }],
    defaultUsageInputs: { storedGbMonths: { low: 50, expected: 100, high: 500 } },
  },
  "Neon PostgreSQL": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "computeCuHours", label: "Compute", unit: "CU-hour", unitRateCents: 22.2 },
      { id: "storageGbMonths", label: "Postgres storage", unit: "GB-month", unitRateCents: 35 },
      { id: "restoreGbMonths", label: "Instant restore history", unit: "GB-month", unitRateCents: 20 },
      { id: "snapshotGbMonths", label: "Scheduled snapshots", unit: "GB-month", unitRateCents: 9 },
      { id: "privateTransferGb", label: "Private networking transfer", unit: "GB", unitRateCents: 1 },
      { id: "publicEgressGb", label: "Public egress", unit: "GB", unitRateCents: 10, includedUnits: 500 },
    ],
    defaultUsageInputs: {
      computeCuHours: { low: 50, expected: 100, high: 500 },
      storageGbMonths: { low: 1, expected: 5, high: 10 },
      restoreGbMonths: { low: 0, expected: 1, high: 5 },
      snapshotGbMonths: { low: 0, expected: 1, high: 5 },
      privateTransferGb: { low: 0, expected: 5, high: 10 },
      publicEgressGb: { low: 0, expected: 500, high: 550 },
    },
  },
  Vercel: {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "proSeats", label: "Conditional Pro developer seats", unit: "seat/month", unitRateCents: 2_000 },
      { id: "cdnOverageMillions", label: "CDN request overage", unit: "million requests above included", unitRateCents: 200 },
      { id: "transferOverageGb", label: "Fast data transfer overage", unit: "GB above included", unitRateCents: 15 },
      { id: "fluidCpuHours", label: "Fluid active CPU", unit: "hour", unitRateCents: 12.8 },
      { id: "provisionedMemoryGbHours", label: "Provisioned memory", unit: "GB-hour", unitRateCents: 1.06 },
      { id: "functionInvocationMillions", label: "Function invocations", unit: "million", unitRateCents: 60 },
    ],
    defaultUsageInputs: {
      proSeats: { low: 0, expected: 1, high: 1 },
      cdnOverageMillions: { low: 0, expected: 0, high: 5 },
      transferOverageGb: { low: 0, expected: 0, high: 200 },
      fluidCpuHours: { low: 0, expected: 0, high: 1_000 },
      provisionedMemoryGbHours: { low: 0, expected: 0, high: 300 },
      functionInvocationMillions: { low: 0, expected: 0, high: 1 },
    },
  },
  "Squarespace email": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "mailboxSeats", label: "Workspace mailboxes", unit: "seat", unitRateCents: 0 },
      { id: "resellerSeatPriceCents", label: "Unconfirmed reseller price proxy", unit: "cents/seat/month", unitRateCents: 0 },
      { id: "workspaceSeatsCost", label: "Monthly reseller charge", unit: "seat", unitRateCents: 0, percentageRate: 100, percentageBasisInput: "resellerSeatPriceCents", quantityInput: "mailboxSeats", isDerived: true },
    ],
    defaultUsageInputs: {
      mailboxSeats: { low: 1, expected: 1, high: 1 },
      resellerSeatPriceCents: { low: 700, expected: 1_500, high: 3_000 },
    },
  },
  "Squarespace domains": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "domainCount", label: "Registered domains", unit: "domain", unitRateCents: 0 },
      { id: "annualRenewalQuoteCents", label: "Unconfirmed annual TLD renewal price proxy", unit: "cents/domain/year", unitRateCents: 0 },
      { id: "monthlyDomainRenewalCost", label: "Monthly normalized renewal", unit: "domain", unitRateCents: 0, percentageRate: 100 / 12, percentageBasisInput: "annualRenewalQuoteCents", quantityInput: "domainCount", isDerived: true, roundPercentagePerUnit: false },
    ],
    defaultUsageInputs: {
      domainCount: { low: 1, expected: 1, high: 1 },
      annualRenewalQuoteCents: { low: 1_500, expected: 4_000, high: 10_000 },
    },
  },
  "Cloudflare DNS and proxy": {
    minimumMonthlyCents: 0,
    usageComponents: [{ id: "zonePlanUsd", label: "Selected zone-plan price", unit: "USD/month", unitRateCents: 100 }],
    defaultUsageInputs: { zonePlanUsd: { low: 20, expected: 200, high: 250 } },
  },
  "Cloudflare Workers": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "paidAccounts", label: "Paid Workers account activation", unit: "account", unitRateCents: 500 },
      { id: "workerRequestsMillions", label: "Requests", unit: "million/month", unitRateCents: 30, includedUnits: 10 },
      { id: "workerCpuMillionsMs", label: "CPU time", unit: "million ms/month", unitRateCents: 2, includedUnits: 30 },
    ],
    defaultUsageInputs: {
      paidAccounts: { low: 0, expected: 0, high: 1 },
      workerRequestsMillions: { low: 0, expected: 0, high: 20 },
      workerCpuMillionsMs: { low: 0, expected: 0, high: 50 },
    },
  },
  "Stripe payment processing": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "transactions", label: "Successful card transactions", unit: "transaction", unitRateCents: 30, percentageRate: 2.9, percentageBasisInput: "averageChargeCents" },
      { id: "averageChargeCents", label: "Average amount charged", unit: "cents/transaction", unitRateCents: 0 },
    ],
    defaultUsageInputs: {
      transactions: { low: 25, expected: 100, high: 500 },
      averageChargeCents: { low: 500, expected: 500, high: 500 },
    },
  },
  "Stripe Connect and payouts": {
    minimumMonthlyCents: 0,
    usageComponents: [{ id: "accountAndPayoutQuoteUsd", label: "Unconfirmed Connect/payout monthly quote proxy", unit: "USD/month", unitRateCents: 100 }],
    defaultUsageInputs: { accountAndPayoutQuoteUsd: { low: 0, expected: 25, high: 150 } },
  },
  "Google Maps Platform": {
    minimumMonthlyCents: 0,
    usageComponents: [{ id: "dynamicMapEventsThousands", label: "Dynamic Maps events", unit: "thousand events/month", unitRateCents: 700, includedUnits: 10 }],
    defaultUsageInputs: { dynamicMapEventsThousands: { low: 0.5, expected: 5, high: 25 } },
  },
  "Mapbox Geocoding": {
    minimumMonthlyCents: 0,
    usageComponents: [
      { id: "commercialLicenseQuoteUsd", label: "Unconfirmed commercial license monthly quote proxy", unit: "USD/month", unitRateCents: 100 },
      { id: "geocodingRequestsThousands", label: "Geocoding requests", unit: "thousand requests/month", unitRateCents: 0 },
    ],
    defaultUsageInputs: {
      commercialLicenseQuoteUsd: { low: 50, expected: 250, high: 1_000 },
      geocodingRequestsThousands: { low: 0.1, expected: 1, high: 10 },
    },
  },
  "Platform notifications": {
    baseMonthlyCents: 2_000,
    minimumMonthlyCents: 0,
    usageComponents: [{ id: "emailsThousands", label: "Transactional emails", unit: "thousand emails/month", unitRateCents: 90, includedUnits: 50 }],
    defaultUsageInputs: { emailsThousands: { low: 1, expected: 25, high: 60 } },
  },
};

function calculateProviderMonthlyCost(
  provider: Pick<UnitEconomicsProviderBaseline, "baseMonthlyCents" | "minimumMonthlyCents" | "usageComponents" | "defaultUsageInputs">,
  scenario: UnitEconomicsScenario,
  usageOverrides: UnitEconomicsUsageValues = {},
  unitRatesCentsPerUnit: Record<string, number> = {},
  percentageRates: Record<string, number> = {},
): number {
  let totalCents = 0;
  for (const component of provider.usageComponents) {
    const quantityKey = component.quantityInput ?? component.id;
    const quantity = usageOverrides[quantityKey]?.[scenario] ?? provider.defaultUsageInputs[quantityKey]?.[scenario] ?? 0;
    const billableUnits = Math.max(0, quantity - (component.includedUnits ?? 0));
    const basis = component.percentageBasisInput
      ? usageOverrides[component.percentageBasisInput]?.[scenario] ?? provider.defaultUsageInputs[component.percentageBasisInput]?.[scenario] ?? 0
      : 0;
    const percentageRate = percentageRates[component.id] ?? component.percentageRate ?? 0;
    const percentageCents = component.roundPercentagePerUnit === false
      ? Math.round(billableUnits * basis * percentageRate / 100)
      : billableUnits * Math.round(basis * percentageRate / 100);
    totalCents += billableUnits * (unitRatesCentsPerUnit[component.id] ?? component.unitRateCents) + percentageCents;
  }
  return Math.max(provider.minimumMonthlyCents, provider.baseMonthlyCents + Math.round(totalCents));
}

export const unitEconomicsProviderBaseline: UnitEconomicsProviderBaseline[] = unitEconomicsProviderDefinitions.map((entry) => {
  const model = providerUsageModels[entry.provider];
  if (!model) throw new Error(`Missing usage cost model for provider: ${entry.provider}`);
  const result = { baseMonthlyCents: 0, ...entry, ...model };
  const lowMonthlyCostCents = calculateProviderMonthlyCost(result, "low");
  const expectedMonthlyCostCents = calculateProviderMonthlyCost(result, "expected");
  const highMonthlyCostCents = calculateProviderMonthlyCost(result, "high");
  return { ...result, amountCents: expectedMonthlyCostCents, lowMonthlyCostCents, expectedMonthlyCostCents, highMonthlyCostCents };
});

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
      const usageInputs: UnitEconomicsUsageValues = {};
      for (const component of entry.usageComponents) {
        usageInputs[component.id] = {
          low: override?.usageInputs?.[component.id]?.low,
          expected: override?.usageInputs?.[component.id]?.expected,
          high: override?.usageInputs?.[component.id]?.high,
        };
      }
      const mergedUsageInputs = Object.fromEntries(Object.entries(usageInputs).map(([id, values]) => [
        id,
        Object.fromEntries(Object.entries(values).filter(([, value]) => value != null)),
      ])) as UnitEconomicsUsageValues;
      const unitRatesCentsPerUnit = override?.unitRatesCentsPerUnit ?? {};
      const percentageRates = override?.percentageRates ?? {};
      const usageComponents = entry.usageComponents.map((component) => ({
        ...component,
        unitRateCents: unitRatesCentsPerUnit[component.id] ?? component.unitRateCents,
        percentageRate: percentageRates[component.id] ?? component.percentageRate,
      }));
      const model = { ...entry, usageComponents };
      const lowMonthlyCostCents = calculateProviderMonthlyCost(model, "low", mergedUsageInputs);
      const expectedMonthlyCostCents = calculateProviderMonthlyCost(model, "expected", mergedUsageInputs);
      const highMonthlyCostCents = calculateProviderMonthlyCost(model, "high", mergedUsageInputs);
      return {
        id: null,
        ...entry,
        amountCents: expectedMonthlyCostCents,
        lowMonthlyCostCents,
        expectedMonthlyCostCents,
        highMonthlyCostCents,
        usageComponents,
        launchUsageAssumptions: override?.launchUsageAssumptions ?? entry.launchUsageAssumptions,
        defaultUsageInputs: Object.fromEntries(Object.entries(entry.defaultUsageInputs).map(([id, values]) => [
          id,
          { ...values, ...mergedUsageInputs[id] },
        ])),
        status: entry.evidenceStatus === "account_quote_required" ? "estimated" as const : entry.status,
        evidenceStatus: entry.evidenceStatus,
        includedInCalculation: entry.includedInCalculation,
        notes: entry.evidenceStatus === "account_quote_required"
          ? `${entry.notes} Scenario ranges are quote proxies, not a confirmed vendor price.`
          : entry.notes,
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
    minimumMonthlyCents: 0,
    baseMonthlyCents: 0,
    usageComponents: [],
    defaultUsageInputs: {},
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
  return costs.reduce((total, cost) => {
    if (!cost.includedInCalculation || cost.separatelyCalculated) return total;
    const amount = cost[costField];
    if (amount == null) throw new Error(`Missing ${scenario} monthly cost for included provider ${cost.provider}`);
    return total + amount;
  }, 0);
}

export function calculateUnitEconomicsProviderCostBreakdown(
  provider: UnitEconomicsProviderCost,
  scenario: UnitEconomicsScenario,
) {
  return provider.usageComponents.map((component) => {
    const quantityKey = component.quantityInput ?? component.id;
    const quantity = provider.defaultUsageInputs[quantityKey]?.[scenario] ?? 0;
    const billableUnits = Math.max(0, quantity - (component.includedUnits ?? 0));
    const percentageBasis = component.percentageBasisInput
      ? provider.defaultUsageInputs[component.percentageBasisInput]?.[scenario] ?? 0
      : 0;
    const percentageCents = component.roundPercentagePerUnit === false
      ? Math.round(billableUnits * percentageBasis * (component.percentageRate ?? 0) / 100)
      : billableUnits * Math.round(percentageBasis * (component.percentageRate ?? 0) / 100);
    return {
      id: component.id,
      label: component.label,
      unit: component.unit,
      quantity,
      includedUnits: component.includedUnits ?? 0,
      billableUnits,
      unitRateCents: component.unitRateCents,
      percentageRate: component.percentageRate ?? 0,
      percentageBasis,
      amountCents: Math.round(billableUnits * component.unitRateCents + percentageCents),
    };
  });
}

export function calculateUnitEconomicsScenarioMonthlyCost(
  costs: UnitEconomicsProviderCost[],
  scenario: "low" | "expected" | "high" = "expected",
): number {
  const costField = `${scenario}MonthlyCostCents` as const;
  return costs.reduce((total, cost) => {
    if (!cost.includedInCalculation) return total;
    const amount = cost[costField];
    if (amount == null) throw new Error(`Missing ${scenario} monthly cost for included provider ${cost.provider}`);
    return total + amount;
  }, 0);
}

export function unitEconomicsMonthlyCostsComplete(costs: UnitEconomicsProviderCost[]): boolean {
  return costs.every((cost) =>
    cost.includedInCalculation && cost.evidenceStatus !== "account_quote_required" &&
    cost.evidenceStatus !== "not_configured" && cost.status !== "unconfirmed",
  );
}

export function unitEconomicsProvidersRequiringConfirmation(costs: UnitEconomicsProviderCost[]): string[] {
  return costs.filter((cost) =>
    !cost.includedInCalculation || cost.evidenceStatus === "account_quote_required" ||
    cost.evidenceStatus === "not_configured" || cost.status === "unconfirmed",
  ).map((cost) => cost.provider);
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
  const breakEvenProcessingPerLoadCents = input.recordedStripeProcessingCents != null && input.validatedLoads > 0
    ? Math.ceil(input.recordedStripeProcessingCents / input.validatedLoads)
    : processingPerLoadCents;
  const contributionPerLoadCents = input.feePerValidatedLoadCents - breakEvenProcessingPerLoadCents;
  return { ...input, processingPerLoadCents, grossRevenueCents, variableCostsCents: totalVariableCostsCents, contributionProfitCents,
    contributionMarginPercent: grossRevenueCents ? contributionProfitCents / grossRevenueCents * 100 : 0,
    breakEvenProcessingPerLoadCents,
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
    ["Separately calculated Stripe card-processing costs", report.metrics.variableCostsCents / 100],
    ["Contribution after modeled costs", report.metrics.contributionProfitCents / 100],
    ["Profitability complete", report.profitabilityComplete ? "Yes" : "No"],
    ["Providers requiring confirmation or not included", report.missingProviderCount],
    ["Break-even loads at fee assumption", report.metrics.breakEvenLoads],
    ["Break-even formula", `ceil(expected monthly operating costs / (customer fee ${report.metrics.feePerValidatedLoadCents} cents - Stripe processing ${report.metrics.breakEvenProcessingPerLoadCents} cents per validated load)); Stripe processing excluded from fixed costs and deducted per transaction`],
    ["Revenue treatment", "Recorded month verified-load count × existing documented $5.00 verified-drop assumption; projection is separate"],
    [],
    [
      "Provider", "Category", "Current plan / use evidence", "Production plan/agreement",
      "Fixed commitment", "Base monthly charge", "Minimum monthly floor", "Included usage/credits", "Metered and overage rates",
      "Low monthly cost", "Expected monthly cost", "High monthly cost", "Launch usage assumptions",
      "Calculation formula", "Structured cost components and rates", "Structured monthly usage inputs (low/expected/high)",
      "Calculated subcomponent charges (low/expected/high)",
      "Evidence classification", "Status", "Billing cadence", "Cost model",
      "Recorded override", "Included in expected total", "Calculated separately",
      "Notes", "Official source URL", "Research/effective date",
    ],
    ...report.costs.map((cost) => [
      cost.provider, cost.category, cost.currentPlan, cost.productionPlan, cost.fixedCommitment,
      cost.baseMonthlyCents / 100, cost.minimumMonthlyCents / 100, cost.includedUsage, cost.meteredRates,
      cost.lowMonthlyCostCents == null ? "Unknown" : cost.lowMonthlyCostCents / 100,
      cost.expectedMonthlyCostCents == null ? "Unknown" : cost.expectedMonthlyCostCents / 100,
      cost.highMonthlyCostCents == null ? "Unknown" : cost.highMonthlyCostCents / 100,
      cost.launchUsageAssumptions, cost.formula,
      JSON.stringify(cost.usageComponents.map(({ id, label, unit, unitRateCents, includedUnits, percentageRate, percentageBasisInput, quantityInput, roundPercentagePerUnit }) => ({ id, label, unit, unitRateCents, includedUnits, percentageRate, percentageBasisInput, quantityInput, roundPercentagePerUnit }))),
      JSON.stringify(cost.defaultUsageInputs),
      JSON.stringify(Object.fromEntries((["low", "expected", "high"] as const).map((scenario) => [
        scenario, calculateUnitEconomicsProviderCostBreakdown(cost, scenario),
      ]))),
      cost.evidenceStatus, cost.status,
      cost.billingCadence, cost.costModel, cost.isRecorded ? "Yes" : "No",
      cost.includedInCalculation ? "Yes" : "No", cost.separatelyCalculated ? "Yes" : "No",
      cost.notes, cost.sourceUrl, cost.researchDate,
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}
