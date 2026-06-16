import { isBillableWashoutForOwnerBilling } from "./washoutApproval";
import { normalizeMoneyToCents } from "./money";

export type WashoutLedgerRepairRow = {
  activityId: string;
  driverId: string;
  ownerId: string;
  locationId: string;
  status?: string | null;
  serviceType?: string | null;
  feeCentsPlatform?: number | null;
  platformFeeCents?: number | null;
  lotteryEntryExists?: boolean;
};

export type WashoutLedgerRepairPlan = {
  scanned: number;
  platformFeeBackfills: Array<{
    activityId: string;
    platformFeeCents: number;
  }>;
  lotteryEntriesToCreate: Array<{
    activityId: string;
    driverId: string;
    ownerId: string;
  }>;
};

function resolvePlatformFeeCents(row: WashoutLedgerRepairRow, defaultPlatformFeeCents: number): number {
  const rowFee = normalizeMoneyToCents(row.feeCentsPlatform, "auto");
  if (rowFee > 0) {
    return rowFee;
  }

  const ownerFee = normalizeMoneyToCents(row.platformFeeCents, "auto");
  if (ownerFee > 0) {
    return ownerFee;
  }

  return Math.max(0, Math.round(defaultPlatformFeeCents));
}

export function buildWashoutLedgerRepairPlan(
  rows: WashoutLedgerRepairRow[],
  defaultPlatformFeeCents = 500,
): WashoutLedgerRepairPlan {
  const platformFeeBackfills: WashoutLedgerRepairPlan["platformFeeBackfills"] = [];
  const lotteryEntriesToCreate: WashoutLedgerRepairPlan["lotteryEntriesToCreate"] = [];

  for (const row of rows) {
    if (!isBillableWashoutForOwnerBilling({ status: row.status })) {
      continue;
    }

    const isWashout = String(row.serviceType || "washout").toLowerCase() !== "rubble_dropoff";
    if (!isWashout) {
      continue;
    }

    const platformFeeCents = resolvePlatformFeeCents(row, defaultPlatformFeeCents);
    if (platformFeeCents > 0 && normalizeMoneyToCents(row.feeCentsPlatform, "auto") <= 0) {
      platformFeeBackfills.push({
        activityId: row.activityId,
        platformFeeCents,
      });
    }

    if (!row.lotteryEntryExists) {
      lotteryEntriesToCreate.push({
        activityId: row.activityId,
        driverId: row.driverId,
        ownerId: row.ownerId,
      });
    }
  }

  return {
    scanned: rows.length,
    platformFeeBackfills,
    lotteryEntriesToCreate,
  };
}
