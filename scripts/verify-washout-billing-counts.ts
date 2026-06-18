import { pathToFileURL } from "node:url";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../server/db";
import { owners, payments, systemSettings, washoutActivities, washoutLocations } from "../shared/schema";
import { resolvePlatformFeeCents } from "../shared/billingPolicy";
import {
  buildWashoutBillingVerificationReport,
  type WashoutBillingVerificationRow,
} from "../shared/washoutBillingVerification";

type CliOptions = {
  ownerId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  days?: number | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = inlineValue ?? argv[i + 1];
    const value = inlineValue !== undefined ? inlineValue : (nextValue && !nextValue.startsWith("--") ? nextValue : undefined);

    switch (flag) {
      case "--ownerId":
        options.ownerId = value || null;
        if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) i += 1;
        break;
      case "--startDate":
        options.startDate = value ? new Date(value) : null;
        if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) i += 1;
        break;
      case "--endDate":
        options.endDate = value ? new Date(value) : null;
        if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) i += 1;
        break;
      case "--days":
        options.days = value ? Number(value) : null;
        if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) i += 1;
        break;
      default:
        break;
    }
  }
  return options;
}

function getRunOptions(): CliOptions {
  const argvOptions = parseArgs(process.argv.slice(2));
  const envOwnerId = process.env.VERIFY_WASHOUT_BILLING_OWNER_ID?.trim();
  const envStartDate = process.env.VERIFY_WASHOUT_BILLING_START_DATE?.trim();
  const envEndDate = process.env.VERIFY_WASHOUT_BILLING_END_DATE?.trim();
  const envDays = process.env.VERIFY_WASHOUT_BILLING_DAYS?.trim();

  return {
    ownerId: argvOptions.ownerId ?? envOwnerId ?? null,
    startDate: argvOptions.startDate ?? (envStartDate ? new Date(envStartDate) : null),
    endDate: argvOptions.endDate ?? (envEndDate ? new Date(envEndDate) : null),
    days: argvOptions.days ?? (envDays ? Number(envDays) : null),
  };
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function formatMoney(cents: number): string {
  return `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`;
}

async function resolveDefaultPlatformFeeCents(): Promise<number> {
  const [settings] = await db
    .select({ platformWashoutFee: systemSettings.platformWashoutFee })
    .from(systemSettings)
    .limit(1);

  return resolvePlatformFeeCents(settings?.platformWashoutFee);
}

async function loadRows(ownerId: string | null, startDate: Date, endDate: Date): Promise<WashoutBillingVerificationRow[]> {
  const whereClauses = [
    gte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, startDate),
    lte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, endDate),
  ];
  if (ownerId) {
    whereClauses.push(eq(washoutLocations.ownerId, ownerId));
  }

  const rows = await db
    .select({
      activityId: washoutActivities.id,
      ownerId: washoutLocations.ownerId,
      ownerCompanyName: owners.companyName,
      locationId: washoutActivities.locationId,
      locationName: washoutLocations.name,
      status: washoutActivities.status,
      paymentStatus: payments.status,
      activityAmount: washoutActivities.amount,
      feeCentsPlatform: washoutActivities.feeCentsPlatform,
      ownerCustomPlatformFeeCents: owners.customPlatformFee,
      locationDriverTipRate: washoutLocations.rate,
      paymentId: payments.id,
      stripePaymentIntentId: payments.stripePaymentIntentId,
      stripeChargeId: payments.stripeChargeId,
    })
    .from(washoutActivities)
    .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
    .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
    .leftJoin(payments, eq(payments.activityId, washoutActivities.id))
    .where(and(...whereClauses));

  return rows as WashoutBillingVerificationRow[];
}

async function main(): Promise<void> {
  const options = getRunOptions();
  const defaultPlatformFeeCents = await resolveDefaultPlatformFeeCents();

  const now = new Date();
  const startDate = isValidDate(options.startDate)
    ? options.startDate
    : (() => {
        const date = new Date(now);
        const days = Number.isFinite(options.days ?? NaN) && (options.days ?? 0) > 0 ? Math.round(options.days as number) : 30;
        date.setDate(date.getDate() - days);
        return date;
      })();
  const endDate = isValidDate(options.endDate) ? options.endDate : now;

  const rows = await loadRows(options.ownerId ?? null, startDate, endDate);
  const report = buildWashoutBillingVerificationReport(rows, defaultPlatformFeeCents, {
    ownerId: options.ownerId ?? null,
    startDate,
    endDate,
  });

  const ownerCount = new Set(rows.map((row) => row.ownerId)).size;
  const locationCount = new Set(rows.map((row) => `${row.ownerId}::${row.locationId}`)).size;

  console.log("[WASHOUT_BILLING_VERIFY] summary", {
    ownerId: options.ownerId ?? null,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalWashouts: report.totalWashouts,
    approvedWashouts: report.approvedWashouts,
    declinedWashouts: report.declinedWashouts,
    rejectedWashouts: report.rejectedWashouts,
    cancelledWashouts: report.cancelledWashouts,
    pendingWashouts: report.pendingWashouts,
    needsReviewWashouts: report.needsReviewWashouts,
    alreadyBilledWashouts: report.alreadyBilledWashouts,
    unbilledApprovedWashouts: report.unbilledApprovedWashouts,
    platformFeeReceivableCents: report.platformFeeReceivableCents,
    platformFeeOwedCents: report.platformFeeOwedCents,
    platformFeeBilledCents: report.platformFeeBilledCents,
    driverTipRateTotalCents: report.driverTipRateTotalCents,
    ownerCount,
    locationCount,
    defaultPlatformFeeCents,
  });

  console.log(JSON.stringify({
    ownerId: options.ownerId ?? null,
    dateRange: report.dateRange,
    totals: {
      totalWashouts: report.totalWashouts,
      approvedWashouts: report.approvedWashouts,
      declinedWashouts: report.declinedWashouts,
      rejectedWashouts: report.rejectedWashouts,
      cancelledWashouts: report.cancelledWashouts,
      pendingWashouts: report.pendingWashouts,
      needsReviewWashouts: report.needsReviewWashouts,
      alreadyBilledWashouts: report.alreadyBilledWashouts,
      unbilledApprovedWashouts: report.unbilledApprovedWashouts,
      platformFeeReceivableCents: report.platformFeeReceivableCents,
      platformFeeOwedCents: report.platformFeeOwedCents,
      platformFeeBilledCents: report.platformFeeBilledCents,
      driverTipRateTotalCents: report.driverTipRateTotalCents,
      platformFeeReceivable: formatMoney(report.platformFeeReceivableCents),
      platformFeeOwed: formatMoney(report.platformFeeOwedCents),
      platformFeeBilled: formatMoney(report.platformFeeBilledCents),
      driverTipRateTotal: formatMoney(report.driverTipRateTotalCents),
    },
    countsByStatus: Object.fromEntries(
      Object.entries(report.washoutIdsByStatus).map(([status, ids]) => [status, { count: ids.length, washoutIds: ids }]),
    ),
    breakdownByOwnerLocation: report.breakdownByOwnerLocation.map((breakdown) => ({
      ...breakdown,
      platformFeeReceivable: formatMoney(breakdown.platformFeeReceivableCents),
      platformFeeOwed: formatMoney(breakdown.platformFeeOwedCents),
      platformFeeBilled: formatMoney(breakdown.platformFeeBilledCents),
      driverTipRateTotal: formatMoney(breakdown.driverTipRateTotalCents),
    })),
    ownerCount,
    locationCount,
    defaultPlatformFeeCents,
  }, null, 2));
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error("[WASHOUT_BILLING_VERIFY] failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void run();
}
