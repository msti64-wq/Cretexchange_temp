import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { driverLotteryEntries, drivers, notifications, rewardsPeriods, systemSettings } from "../shared/schema";
import { effectiveFinancialTimestamp, isHistoricalFinancialRecord } from "./financialCutoff";

export const REWARDS_PERIOD_STATUSES = ["scheduled", "active", "paused", "cancelled", "completed"] as const;
export type RewardsPeriodStatus = typeof REWARDS_PERIOD_STATUSES[number];
export const TICKET_ELIGIBILITY_STATUSES = ["eligible", "ineligible", "cancelled"] as const;

const transitions: Record<RewardsPeriodStatus, RewardsPeriodStatus[]> = {
  scheduled: ["active", "cancelled"], active: ["paused", "cancelled", "completed"], paused: ["active", "cancelled"], cancelled: [], completed: [],
};
const cancellationMessage = "The CreteXchange Driver Rewards Program will not be held for this month. Entries associated with this rewards period will not be included in a drawing. Normal material recovery activity and verification remain unaffected.";

export const REWARDS_PERIOD_CANCELLATION_ANNOUNCEMENT = cancellationMessage;

type ActivityDateSource = {
  verifiedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function chicagoPeriodFor(date: Date): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: "month" | "year") => Number(parts.find((part) => part.type === type)?.value || 0);
  return { month: value("month"), year: value("year") };
}

export function resolveRewardsPeriodForActivity(
  activity: ActivityDateSource,
  cutoff: Date | string | null | undefined,
): { historical: boolean; month: number; year: number } | null {
  const timestamp = effectiveFinancialTimestamp(activity);
  if (!timestamp) return null;
  const { month, year } = chicagoPeriodFor(timestamp);
  return { historical: isHistoricalFinancialRecord(activity, cutoff), month, year };
}

export function canTransitionRewardsPeriod(from: RewardsPeriodStatus, to: RewardsPeriodStatus) { return transitions[from]?.includes(to) ?? false; }
export function requireRewardsPeriodTransition(from: RewardsPeriodStatus, to: RewardsPeriodStatus) {
  if (!canTransitionRewardsPeriod(from, to)) throw new Error(`Invalid rewards-period transition: ${from} to ${to}`);
}

export async function createRewardsPeriod(month: number, year: number, actorId: string) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) throw new Error("Invalid rewards period");
  const [period] = await db.insert(rewardsPeriods).values({ month, year, createdBy: actorId, status: "scheduled" }).returning();
  return period;
}
export async function listRewardsPeriods() { return db.select().from(rewardsPeriods).orderBy(sql`${rewardsPeriods.year} DESC, ${rewardsPeriods.month} DESC`); }
export async function getRewardsPeriod(id: string) {
  const [period] = await db.select().from(rewardsPeriods).where(eq(rewardsPeriods.id, id)).limit(1);
  return period || null;
}
export async function getRewardsPeriodForMonth(month: number, year: number) {
  const [period] = await db
    .select()
    .from(rewardsPeriods)
    .where(and(eq(rewardsPeriods.month, month), eq(rewardsPeriods.year, year)))
    .limit(1);
  return period || null;
}
export async function getActiveRewardsPeriodForActivity(activity: ActivityDateSource) {
  const [settings] = await db
    .select({ financialHistoryCutoffAt: systemSettings.financialHistoryCutoffAt })
    .from(systemSettings)
    .limit(1);
  const context = resolveRewardsPeriodForActivity(activity, settings?.financialHistoryCutoffAt);
  if (!context || context.historical) return null;
  const period = await getRewardsPeriodForMonth(context.month, context.year);
  return period?.status === "active" ? period : null;
}
export async function transitionRewardsPeriod(id: string, to: RewardsPeriodStatus, actorId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const [period] = await tx.select().from(rewardsPeriods).where(eq(rewardsPeriods.id, id)).for("update");
    if (!period) throw new Error("Rewards period not found");
    requireRewardsPeriodTransition(period.status as RewardsPeriodStatus, to);
    const now = new Date();
    const patch: Record<string, unknown> = { status: to };
    if (to === "active") {
      const [otherActive] = await tx
        .select({ id: rewardsPeriods.id })
        .from(rewardsPeriods)
        .where(and(eq(rewardsPeriods.status, "active"), sql`${rewardsPeriods.id} <> ${id}`))
        .limit(1);
      if (otherActive) throw new Error("Another rewards period is already active");
      Object.assign(patch, { activatedAt: now, activatedBy: actorId });
    }
    if (to === "paused") Object.assign(patch, { pausedAt: now, pausedBy: actorId, pauseReason: reason?.trim() || null });
    if (to === "completed") Object.assign(patch, { completedAt: now, completedBy: actorId });
    if (to === "cancelled") {
      if (!reason?.trim()) throw new Error("Cancellation reason is required");
      Object.assign(patch, { cancelledAt: now, cancelledBy: actorId, cancellationReason: reason.trim() });
      await tx.update(driverLotteryEntries).set({ eligibilityStatus: "cancelled", eligibilityChangedAt: now, eligibilityChangedBy: actorId, ineligibilityReason: reason.trim() }).where(and(eq(driverLotteryEntries.rewardsPeriodId, id), sql`${driverLotteryEntries.eligibilityStatus} <> 'cancelled'`));
    }
    const [updated] = await tx.update(rewardsPeriods).set(patch).where(eq(rewardsPeriods.id, id)).returning();
    return updated;
  });
}
export async function markTicketIneligible(entryId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error("Ineligibility reason is required");
  const [updated] = await db.update(driverLotteryEntries).set({ eligibilityStatus: "ineligible", ineligibilityReason: reason.trim(), eligibilityChangedAt: new Date(), eligibilityChangedBy: actorId }).where(and(eq(driverLotteryEntries.id, entryId), eq(driverLotteryEntries.eligibilityStatus, "eligible"))).returning();
  if (!updated) throw new Error("Eligible ticket not found");
  return updated;
}
export async function announceCancelledRewardsPeriod(id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [period] = await tx.select().from(rewardsPeriods).where(eq(rewardsPeriods.id, id)).for("update");
    if (!period || period.status !== "cancelled") throw new Error("Cancelled rewards period required");
    if (period.announcementSentAt) return period;
    const recipients = await tx.selectDistinct({ userId: drivers.userId }).from(driverLotteryEntries).innerJoin(drivers, eq(drivers.id, driverLotteryEntries.driverId)).where(eq(driverLotteryEntries.rewardsPeriodId, id));
    for (const row of recipients) {
      const existing = await tx.select({ id: notifications.id }).from(notifications).where(sql`${notifications.userId} = ${row.userId} AND ${notifications.type} = 'lottery_announcement' AND ${notifications.data}->>'rewardsPeriodId' = ${id}`).limit(1);
      if (!existing.length) await tx.insert(notifications).values({ userId: row.userId, title: "Driver Rewards Program update", message: cancellationMessage, type: "lottery_announcement", data: { rewardsPeriodId: id, action: "cancelled" } });
    }
    const [updated] = await tx.update(rewardsPeriods).set({ announcementSentAt: new Date(), announcementSentBy: actorId }).where(eq(rewardsPeriods.id, id)).returning();
    return updated;
  });
}
