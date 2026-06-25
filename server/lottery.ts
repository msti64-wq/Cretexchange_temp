import type { IStorage } from "./storage";

export const LOTTERY_FEATURE_FLAG_KEY = "lottery_enabled";

export type LotteryDrawingPrizeConfig = {
  title?: string | null;
  description?: string | null;
};

export type LotteryDrawingPreviewEntry = {
  id: string;
  driverId: string;
  ticketNumber: string | null;
  entriesEarned?: number | null;
  driver?: {
    id?: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
    };
  };
};

export type LotteryDrawingPreviewDriverTotal = {
  driverId: string;
  driverName: string;
  totalEntries: number;
  payoutPreference?: string | null;
  payoutPreferenceNote?: string | null;
};

export type LotteryDrawingPreviewWinner = {
  placeIndex: number;
  driverId: string;
  driverName: string;
  entryId: string;
  ticketNumber: string | null;
  prizeTitle: string | null;
  prizeDescription: string | null;
  payoutPreference: string | null;
  payoutPreferenceNote: string | null;
};

export type LotteryDrawingPreviewResult = {
  winnerCountRequested: number;
  allowDuplicateWinnerDriver: boolean;
  eligibleEntryCount: number;
  eligibleDriverCount: number;
  selectedWinners: LotteryDrawingPreviewWinner[];
  warnings: string[];
};

function parseBooleanEnv(value?: string | null): boolean | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export async function resolveLotteryEnabled(storage: Pick<IStorage, "getFeatureFlag">): Promise<{
  enabled: boolean;
  source: "env" | "flag" | "default";
}> {
  const envOverride = parseBooleanEnv(process.env.LOTTERY_ENABLED ?? process.env.ENABLE_LOTTERY);
  if (envOverride !== undefined) {
    return { enabled: envOverride, source: "env" };
  }

  const flag = await storage.getFeatureFlag(LOTTERY_FEATURE_FLAG_KEY);
  if (flag) {
    return { enabled: flag.enabled ?? true, source: "flag" };
  }

  return { enabled: true, source: "default" };
}

export function buildLotteryDrawingPreview(input: {
  entries: LotteryDrawingPreviewEntry[];
  driverTotals: LotteryDrawingPreviewDriverTotal[];
  winnerCount: number;
  allowDuplicateWinnerDriver?: boolean;
  prizes?: LotteryDrawingPrizeConfig[];
}): LotteryDrawingPreviewResult {
  const winnerCountRequested = Math.max(1, Math.floor(input.winnerCount || 3));
  const allowDuplicateWinnerDriver = Boolean(input.allowDuplicateWinnerDriver);
  const prizes = Array.isArray(input.prizes) ? input.prizes : [];
  const warnings: string[] = [];

  const pool: Array<{
    driverId: string;
    driverName: string;
    entryId: string;
    ticketNumber: string | null;
    payoutPreference: string | null;
    payoutPreferenceNote: string | null;
  }> = [];

  for (const total of input.driverTotals) {
    const driverEntries = input.entries.filter((entry) => entry.driverId === total.driverId);
    if (driverEntries.length === 0) {
      warnings.push(`No entry rows found for driver ${total.driverId}`);
      continue;
    }

    for (let i = 0; i < total.totalEntries; i += 1) {
      const entryForSlot = driverEntries[i % driverEntries.length];
      const driverUser = entryForSlot.driver?.user;
      pool.push({
        driverId: total.driverId,
        driverName: total.driverName || `${driverUser?.firstName || ""} ${driverUser?.lastName || ""}`.trim() || total.driverId,
        entryId: entryForSlot.id,
        ticketNumber: entryForSlot.ticketNumber ?? null,
        payoutPreference: total.payoutPreference ?? null,
        payoutPreferenceNote: total.payoutPreferenceNote ?? null,
      });
    }
  }

  if (pool.length === 0) {
    return {
      winnerCountRequested,
      allowDuplicateWinnerDriver,
      eligibleEntryCount: 0,
      eligibleDriverCount: input.driverTotals.length,
      selectedWinners: [],
      warnings: warnings.length > 0 ? warnings : ["No eligible reward entries found."],
    };
  }

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selectedWinners: LotteryDrawingPreviewWinner[] = [];
  const pickedDriverIds = new Set<string>();

  for (const slot of pool) {
    if (!allowDuplicateWinnerDriver && pickedDriverIds.has(slot.driverId)) {
      continue;
    }

    const placeIndex = selectedWinners.length + 1;
    const prize = prizes[placeIndex - 1] || {};
    selectedWinners.push({
      placeIndex,
      driverId: slot.driverId,
      driverName: slot.driverName,
      entryId: slot.entryId,
      ticketNumber: slot.ticketNumber,
      prizeTitle: prize.title ?? null,
      prizeDescription: prize.description ?? null,
      payoutPreference: slot.payoutPreference,
      payoutPreferenceNote: slot.payoutPreferenceNote,
    });
    pickedDriverIds.add(slot.driverId);

    if (selectedWinners.length === winnerCountRequested) {
      break;
    }
  }

  if (selectedWinners.length < winnerCountRequested) {
    warnings.push(
      allowDuplicateWinnerDriver
        ? `Only ${selectedWinners.length} winners could be selected from the available reward entries.`
        : `Only ${selectedWinners.length} unique drivers could be selected from the available reward entries.`,
    );
  }

  return {
    winnerCountRequested,
    allowDuplicateWinnerDriver,
    eligibleEntryCount: pool.length,
    eligibleDriverCount: input.driverTotals.length,
    selectedWinners,
    warnings,
  };
}
