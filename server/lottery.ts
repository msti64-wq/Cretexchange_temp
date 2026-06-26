import type { IStorage } from "./storage";

export const LOTTERY_FEATURE_FLAG_KEY = "lottery_enabled";

export type LotteryDrawingPrizeConfig = {
  title?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  tierLabel?: string | null;
  placeLabel?: string | null;
};

export type LotteryDrawingPrizeSlot = {
  title: string | null;
  description: string | null;
  tierLabel: string | null;
  tierQuantity: number;
  tierWinnerIndex: number;
  tierIndex: number;
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
  tierLabel: string | null;
  tierQuantity: number;
  tierWinnerIndex: number;
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

function normalizePrizeQuantity(quantity?: number | string | null): number {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(0, Math.floor(parsed));
}

function hasValidTicketNumber(ticketNumber?: string | null): boolean {
  return typeof ticketNumber === "string" && ticketNumber.trim().length > 0;
}

export function expandLotteryPrizeConfigs(prizes: LotteryDrawingPrizeConfig[] = []): LotteryDrawingPrizeSlot[] {
  const slots: LotteryDrawingPrizeSlot[] = [];

  prizes.forEach((prize, tierIndex) => {
    const tierQuantity = normalizePrizeQuantity(prize?.quantity ?? 1);
    const tierLabel = prize?.tierLabel ?? prize?.placeLabel ?? prize?.title ?? `Tier ${tierIndex + 1}`;

    for (let tierWinnerIndex = 1; tierWinnerIndex <= tierQuantity; tierWinnerIndex += 1) {
      slots.push({
        title: prize?.title ?? null,
        description: prize?.description ?? null,
        tierLabel,
        tierQuantity,
        tierWinnerIndex,
        tierIndex: tierIndex + 1,
      });
    }
  });

  return slots;
}

export function countLotteryPrizeSlots(prizes: LotteryDrawingPrizeConfig[] = []): number {
  return expandLotteryPrizeConfigs(prizes).length;
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
  const prizeSlots = expandLotteryPrizeConfigs(input.prizes ?? []);
  const winnerCountRequested = Math.max(1, Math.floor(input.winnerCount || prizeSlots.length || 3));
  const allowDuplicateWinnerDriver = Boolean(input.allowDuplicateWinnerDriver);
  const warnings: string[] = [];

  const validEntriesByDriver = new Map<string, LotteryDrawingPreviewEntry[]>();
  let excludedInvalidEntryCount = 0;

  for (const entry of input.entries) {
    if (!hasValidTicketNumber(entry.ticketNumber)) {
      excludedInvalidEntryCount += 1;
      continue;
    }

    const driverEntries = validEntriesByDriver.get(entry.driverId) ?? [];
    driverEntries.push(entry);
    validEntriesByDriver.set(entry.driverId, driverEntries);
  }

  if (excludedInvalidEntryCount > 0) {
    warnings.push(`${excludedInvalidEntryCount} entries excluded because they do not have valid entry numbers.`);
  }

  const pool: Array<{
    driverId: string;
    driverName: string;
    entryId: string;
    ticketNumber: string | null;
    payoutPreference: string | null;
    payoutPreferenceNote: string | null;
  }> = [];

  for (const total of input.driverTotals) {
    const driverEntries = validEntriesByDriver.get(total.driverId) ?? [];
    if (driverEntries.length === 0) {
      continue;
    }

    for (const entryForSlot of driverEntries) {
      const weight = Math.max(1, Math.floor(Number(entryForSlot.entriesEarned || 1)));
      const driverUser = entryForSlot.driver?.user;
      const driverName = total.driverName || `${driverUser?.firstName || ""} ${driverUser?.lastName || ""}`.trim() || total.driverId;

      for (let i = 0; i < weight; i += 1) {
        pool.push({
          driverId: total.driverId,
          driverName,
          entryId: entryForSlot.id,
          ticketNumber: entryForSlot.ticketNumber ?? null,
          payoutPreference: total.payoutPreference ?? null,
          payoutPreferenceNote: total.payoutPreferenceNote ?? null,
        });
      }
    }
  }

  if (pool.length === 0) {
    return {
      winnerCountRequested,
      allowDuplicateWinnerDriver,
      eligibleEntryCount: 0,
      eligibleDriverCount: validEntriesByDriver.size,
      selectedWinners: [],
      warnings: warnings.length > 0 ? [...warnings, "No eligible reward entries found."] : ["No eligible reward entries found."],
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
    const prize = prizeSlots[placeIndex - 1] || {};
    selectedWinners.push({
      placeIndex,
      tierLabel: prize.tierLabel ?? null,
      tierQuantity: prize.tierQuantity || 1,
      tierWinnerIndex: prize.tierWinnerIndex || placeIndex,
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
    eligibleDriverCount: validEntriesByDriver.size,
    selectedWinners,
    warnings,
  };
}
