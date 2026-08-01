import { and, asc, eq, inArray } from "drizzle-orm";
import { platformAnalyticsEvents } from "@shared/schema";
import {
  calculateDriverActivityStreaks,
  type PlatformAnalyticsEventType,
} from "./platformAnalytics";

export type DriverAchievementCategory = "verified_washouts" | "consistency" | "quality" | "participation";
export type DriverAchievementUnit = "verified activities" | "active days" | "verified without rejection" | "facilities";

export type DriverAchievementDefinition = {
  id: string;
  category: DriverAchievementCategory;
  name: string;
  description: string;
  threshold: number;
  unit: DriverAchievementUnit;
  sourceEvents: readonly PlatformAnalyticsEventType[];
};

export type DriverAchievementEvent = {
  eventType: PlatformAnalyticsEventType;
  occurredAt: Date;
  activityId?: string | null;
  locationId?: string | null;
};

export type DriverAchievementProgress = DriverAchievementDefinition & {
  current: number;
  remaining: number;
  progressPercent: number;
  earned: boolean;
  earnedAt: string | null;
};

const verifiedMilestones = [1, 10, 25, 50, 100, 500, 1_000] as const;
const streakMilestones = [3, 7, 30] as const;
const qualityMilestones = [25, 100] as const;
const facilityMilestones = [1, 5, 10] as const;

/** Versioned, non-financial definitions for the private Driver projection. */
export const DRIVER_ACHIEVEMENT_DEFINITIONS: readonly DriverAchievementDefinition[] = [
  ...verifiedMilestones.map((threshold) => ({
    id: `verified_washouts_${threshold}`,
    category: "verified_washouts" as const,
    name: threshold === 1 ? "First Verified Recovery Activity" : `${threshold.toLocaleString("en-US")} Verified Recovery Activities`,
    description: threshold === 1
      ? "Complete your first owner-verified recovery activity."
      : `Complete ${threshold.toLocaleString("en-US")} owner-verified recovery activities.`,
    threshold,
    unit: "verified activities" as const,
    sourceEvents: ["activity.verified"] as const,
  })),
  ...streakMilestones.map((threshold) => ({
    id: `active_day_streak_${threshold}`,
    category: "consistency" as const,
    name: `${threshold}-Day Streak`,
    description: `Record submitted recovery activity on ${threshold} consecutive UTC days.`,
    threshold,
    unit: "active days" as const,
    sourceEvents: ["activity.submitted"] as const,
  })),
  ...qualityMilestones.map((threshold) => ({
    id: `verified_without_rejection_${threshold}`,
    category: "quality" as const,
    name: `${threshold} Verified Without Rejection`,
    description: `Reach ${threshold} consecutive final verified decisions without an intervening rejection.`,
    threshold,
    unit: "verified without rejection" as const,
    sourceEvents: ["activity.verified", "activity.rejected"] as const,
  })),
  ...facilityMilestones.map((threshold) => ({
    id: `facilities_visited_${threshold}`,
    category: "participation" as const,
    name: threshold === 1 ? "First Facility" : `${threshold === 5 ? "Five" : "Ten"} Facilities Visited`,
    description: threshold === 1
      ? "Submit recovery activity at your first facility."
      : `Submit recovery activity across ${threshold} distinct facilities.`,
    threshold,
    unit: "facilities" as const,
    sourceEvents: ["activity.submitted"] as const,
  })),
] as const;

export const DRIVER_ACHIEVEMENT_SOURCE_EVENT_TYPES = [
  "activity.submitted",
  "activity.verified",
  "activity.rejected",
] as const satisfies readonly PlatformAnalyticsEventType[];

function iso(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function calculateStreakEarnedDates(activeDates: readonly Date[]): Map<number, Date> {
  const days = Array.from(new Set(activeDates.map((date) => utcDayStart(date).getTime())))
    .sort((left, right) => left - right);
  const earnedDates = new Map<number, Date>();
  let run = 0;
  let previous: number | undefined;
  for (const day of days) {
    run = previous !== undefined && day - previous === 86_400_000 ? run + 1 : 1;
    for (const threshold of streakMilestones) {
      if (run >= threshold && !earnedDates.has(threshold)) earnedDates.set(threshold, new Date(day));
    }
    previous = day;
  }
  return earnedDates;
}

function calculateQualityProgress(finalDecisions: readonly DriverAchievementEvent[]) {
  const earnedDates = new Map<number, Date>();
  let currentRun = 0;
  let longestRun = 0;
  for (const event of finalDecisions) {
    currentRun = event.eventType === "activity.verified" ? currentRun + 1 : 0;
    longestRun = Math.max(longestRun, currentRun);
    for (const threshold of qualityMilestones) {
      if (currentRun >= threshold && !earnedDates.has(threshold)) earnedDates.set(threshold, event.occurredAt);
    }
  }
  return { longestRun, earnedDates };
}

function calculateFacilityProgress(submittedEvents: readonly DriverAchievementEvent[]) {
  const visited = new Set<string>();
  const earnedDates = new Map<number, Date>();
  for (const event of submittedEvents) {
    if (!event.locationId || visited.has(event.locationId)) continue;
    visited.add(event.locationId);
    for (const threshold of facilityMilestones) {
      if (visited.size >= threshold && !earnedDates.has(threshold)) earnedDates.set(threshold, event.occurredAt);
    }
  }
  return { visitedCount: visited.size, earnedDates };
}

/**
 * Calculates persistent recognition from immutable Platform Intelligence
 * facts. Later activity can advance progress but cannot erase an earned
 * milestone; any future correction model requires a separately governed event.
 */
export function calculateDriverAchievements(events: readonly DriverAchievementEvent[]) {
  const ordered = [...events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const verified = ordered.filter((event) => event.eventType === "activity.verified");
  const submitted = ordered.filter((event) => event.eventType === "activity.submitted");
  const finalDecisions = ordered.filter((event) => event.eventType === "activity.verified" || event.eventType === "activity.rejected");
  const activityDates = submitted.map((event) => event.occurredAt);
  const streaks = calculateDriverActivityStreaks(activityDates);
  const streakEarnedDates = calculateStreakEarnedDates(activityDates);
  const quality = calculateQualityProgress(finalDecisions);
  const facilities = calculateFacilityProgress(submitted);

  const progress: DriverAchievementProgress[] = DRIVER_ACHIEVEMENT_DEFINITIONS.map((definition) => {
    let current = 0;
    let earnedAt: string | null = null;
    if (definition.category === "verified_washouts") {
      current = verified.length;
      earnedAt = iso(verified[definition.threshold - 1]?.occurredAt);
    } else if (definition.category === "consistency") {
      current = streaks.longestActivityStreak;
      earnedAt = iso(streakEarnedDates.get(definition.threshold));
    } else if (definition.category === "quality") {
      current = quality.longestRun;
      earnedAt = iso(quality.earnedDates.get(definition.threshold));
    } else {
      current = facilities.visitedCount;
      earnedAt = iso(facilities.earnedDates.get(definition.threshold));
    }
    const earned = current >= definition.threshold;
    return {
      ...definition,
      current: Math.min(current, definition.threshold),
      remaining: Math.max(0, definition.threshold - current),
      progressPercent: Math.min(100, Math.round((current / definition.threshold) * 100)),
      earned,
      earnedAt: earned ? earnedAt : null,
    };
  });

  const nextMilestones = (["verified_washouts", "consistency", "quality", "participation"] as const)
    .map((category) => progress.find((item) => item.category === category && !item.earned))
    .filter((item): item is DriverAchievementProgress => Boolean(item));
  const nextAchievement = [...nextMilestones].sort((left, right) =>
    right.progressPercent - left.progressPercent
    || left.remaining - right.remaining
    || DRIVER_ACHIEVEMENT_DEFINITIONS.findIndex((definition) => definition.id === left.id)
      - DRIVER_ACHIEVEMENT_DEFINITIONS.findIndex((definition) => definition.id === right.id)
  )[0] || null;

  return {
    calculationVersion: 1,
    visibility: "private_driver" as const,
    source: "platform_analytics_events" as const,
    earnedAchievements: progress.filter((item) => item.earned),
    progress,
    nextAchievement,
    nextMilestones,
  };
}

/** Driver-scoped read model; caller supplies the authenticated Driver id. */
export async function buildDriverAchievementProjection(executor: any, driverId: string) {
  const events = await executor.select({
    eventType: platformAnalyticsEvents.eventType,
    occurredAt: platformAnalyticsEvents.occurredAt,
    activityId: platformAnalyticsEvents.activityId,
    locationId: platformAnalyticsEvents.locationId,
  }).from(platformAnalyticsEvents)
    .where(and(
      eq(platformAnalyticsEvents.driverId, driverId),
      inArray(platformAnalyticsEvents.eventType, [...DRIVER_ACHIEVEMENT_SOURCE_EVENT_TYPES]),
    ))
    .orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id))
    .limit(10_001);
  if (events.length > 10_000) {
    throw new Error("Driver achievement result exceeds 10,000 canonical events");
  }
  return {
    driverId,
    ...calculateDriverAchievements(events.map((event: any) => ({
      ...event,
      eventType: event.eventType as PlatformAnalyticsEventType,
      occurredAt: new Date(event.occurredAt),
    }))),
  };
}
