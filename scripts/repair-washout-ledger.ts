import { pathToFileURL } from "node:url";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "../server/db";
import { featureFlags, owners, payments, systemSettings, washoutActivities, washoutLocations, driverLotteryEntries } from "../shared/schema";
import { resolvePlatformFeeCents } from "../shared/billingPolicy";
import { buildWashoutLedgerRepairPlan } from "../shared/washoutLedgerRepair";
import { LOTTERY_FEATURE_FLAG_KEY } from "../server/lottery";

function getDatabaseDays(): number {
  const raw = process.env.REPAIR_WASHOUT_LEDGER_DAYS?.trim();
  if (!raw) return 90;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 90;
}

async function getLotteryEnabled(): Promise<boolean> {
  const env = process.env.LOTTERY_ENABLED ?? process.env.ENABLE_LOTTERY;
  if (env && /^(1|true|yes|on)$/i.test(env.trim())) return true;
  if (env && /^(0|false|no|off)$/i.test(env.trim())) return false;

  const [flag] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.flagKey, LOTTERY_FEATURE_FLAG_KEY))
    .limit(1);
  return flag?.enabled ?? true;
}

async function main(): Promise<void> {
  const days = getDatabaseDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const [systemSettingsResult] = await db
    .select({
      platformWashoutFee: systemSettings.platformWashoutFee,
    })
    .from(systemSettings)
    .limit(1);
  const defaultPlatformFeeCents = resolvePlatformFeeCents(systemSettingsResult[0]?.platformWashoutFee);
  const lotteryEnabled = await getLotteryEnabled();

  const rows = await db
    .select({
      activityId: washoutActivities.id,
      driverId: washoutActivities.driverId,
      ownerId: washoutLocations.ownerId,
      locationId: washoutActivities.locationId,
      status: washoutActivities.status,
      serviceType: washoutActivities.serviceType,
      feeCentsPlatform: washoutActivities.feeCentsPlatform,
      platformFeeCents: owners.customPlatformFee,
      paymentStatus: payments.status,
      lotteryEntryExists: sql<boolean>`EXISTS (SELECT 1 FROM ${driverLotteryEntries} dle WHERE dle.activity_id = ${washoutActivities.id})`,
    })
    .from(washoutActivities)
    .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
    .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
    .leftJoin(payments, eq(payments.activityId, washoutActivities.id))
    .where(and(
      gte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, cutoff),
      ne(washoutActivities.status, "rejected"),
    ));

  const plan = buildWashoutLedgerRepairPlan(rows, defaultPlatformFeeCents);

  let feeBackfills = 0;
  for (const item of plan.platformFeeBackfills) {
    await db
      .update(washoutActivities)
      .set({
        feeCentsPlatform: item.platformFeeCents,
        updatedAt: new Date(),
      })
      .where(eq(washoutActivities.id, item.activityId));
    feeBackfills += 1;
  }

  let lotteryTicketsCreated = 0;
  if (lotteryEnabled) {
    for (const item of plan.lotteryEntriesToCreate) {
      const [existing] = await db
        .select({ id: driverLotteryEntries.id })
        .from(driverLotteryEntries)
        .where(eq(driverLotteryEntries.activityId, item.activityId))
        .limit(1);
      if (existing) continue;
      try {
        await db.insert(driverLotteryEntries).values({
          driverId: item.driverId,
          activityId: item.activityId,
          ownerId: item.ownerId,
          entriesEarned: 1,
          lotteryMonth: new Date().getMonth() + 1,
          lotteryYear: new Date().getFullYear(),
          isArchived: false,
        });
        lotteryTicketsCreated += 1;
      } catch (error: any) {
        console.warn(`Skipping lottery repair for ${item.activityId}: ${error?.message || String(error)}`);
      }
    }
  }

  console.log(`[WASHOUT_LEDGER_REPAIR] scanned=${plan.scanned} feeBackfills=${feeBackfills} lotteryTicketsCreated=${lotteryTicketsCreated} cutoff=${cutoff.toISOString()} lotteryEnabled=${lotteryEnabled}`);
}

async function run(): Promise<void> {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error("Failed to repair washout ledger:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void run();
}
