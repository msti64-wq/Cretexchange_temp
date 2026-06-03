import { isApprovedWashout } from "./washoutApproval";

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
  const rowFee = Number(row.feeCentsPlatform ?? 0);
  if (Number.isFinite(rowFee) && rowFee > 0) {
    return Math.round(rowFee);
  }

  const ownerFee = Number(row.platformFeeCents ?? 0);
  if (Number.isFinite(ownerFee) && ownerFee > 0) {
    return Math.round(ownerFee);
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
    if (!isApprovedWashout(row.status)) {
      continue;
    }

    const isWashout = String(row.serviceType || "washout").toLowerCase() !== "rubble_dropoff";
    if (!isWashout) {
      continue;
    }

    const platformFeeCents = resolvePlatformFeeCents(row, defaultPlatformFeeCents);
    if (platformFeeCents > 0 && Number(row.feeCentsPlatform || 0) <= 0) {
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
