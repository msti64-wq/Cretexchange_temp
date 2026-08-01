import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drivers, owners, platformAnalyticsEvents, users, washoutLocations } from "@shared/schema";
import { DRIVER_ACHIEVEMENT_DEFINITIONS } from "./driverAchievements";
import { PLATFORM_METRIC_REGISTRY_BY_KEY } from "./platformAnalytics";

const MAX_RANKED_DRIVERS = 10_000;
const MAX_FILTER_FACILITIES = 100;
const VERIFIED_ACTIVITY_METRIC = PLATFORM_METRIC_REGISTRY_BY_KEY.verified_activity;
const VERIFIED_ACTIVITY_EVENT = VERIFIED_ACTIVITY_METRIC.sourceEvents[0];

export type DriverCompetitionPeriod = "week" | "month" | "year" | "all_time";

export type DriverCompetitionQuery = {
  period: DriverCompetitionPeriod;
  state?: string;
  facilityId?: string;
  page: number;
  pageSize: number;
  start: Date | null;
  end: Date;
};

export type DriverCompetitionCandidate = {
  driverId: string;
  firstName: string;
  lastName: string;
  verifiedCount: number;
  attainedAt: Date;
};

export class DriverCompetitionQueryError extends Error {}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function utcPeriodStart(period: DriverCompetitionPeriod, now: Date): Date | null {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "week") {
    today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    return today;
  }
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

export function parseDriverCompetitionQuery(input: Record<string, unknown>, now = new Date()): DriverCompetitionQuery {
  const period = String(input.period || "week") as DriverCompetitionPeriod;
  if (!["week", "month", "year", "all_time"].includes(period)) {
    throw new DriverCompetitionQueryError("Unsupported leaderboard period");
  }
  const state = typeof input.state === "string" && input.state.trim()
    ? input.state.trim().toUpperCase()
    : undefined;
  if (state && !/^[A-Z]{2}$/.test(state)) throw new DriverCompetitionQueryError("Invalid state filter");
  const facilityId = typeof input.facilityId === "string" && input.facilityId.trim()
    ? input.facilityId.trim()
    : undefined;
  if (facilityId && (facilityId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(facilityId))) {
    throw new DriverCompetitionQueryError("Invalid facility filter");
  }
  return {
    period,
    state,
    facilityId,
    page: positiveInteger(input.page, 1, 10_000),
    pageSize: positiveInteger(input.pageSize, 10, 25),
    start: utcPeriodStart(period, now),
    end: now,
  };
}

export function privacySafeDriverDisplayName(firstName: unknown, lastName: unknown) {
  const first = typeof firstName === "string" ? firstName.trim() : "";
  const initial = typeof lastName === "string" ? lastName.trim().slice(0, 1).toUpperCase() : "";
  return first ? `${first}${initial ? ` ${initial}.` : ""}` : "Driver";
}

const verifiedMilestones = DRIVER_ACHIEVEMENT_DEFINITIONS
  .filter((definition) => definition.category === "verified_washouts")
  .sort((left, right) => left.threshold - right.threshold);

export function resolveVerifiedMilestone(verifiedCount: number) {
  const earned = [...verifiedMilestones].reverse().find((definition) => verifiedCount >= definition.threshold);
  return earned ? { id: earned.id, threshold: earned.threshold } : null;
}

export function resolveNextVerifiedMilestone(verifiedCount: number) {
  const next = verifiedMilestones.find((definition) => verifiedCount < definition.threshold);
  return next ? {
    id: next.id,
    threshold: next.threshold,
    current: verifiedCount,
    remaining: next.threshold - verifiedCount,
  } : null;
}

export function rankDriverCompetitionCandidates(
  input: readonly DriverCompetitionCandidate[],
  currentDriver: Pick<DriverCompetitionCandidate, "driverId" | "firstName" | "lastName">,
  page = 1,
  pageSize = 10,
) {
  const ordered = [...input]
    .filter((candidate) => candidate.verifiedCount > 0)
    .sort((left, right) => right.verifiedCount - left.verifiedCount
      || left.attainedAt.getTime() - right.attainedAt.getTime()
      || left.driverId.localeCompare(right.driverId));

  let displayedRank = 0;
  let priorCount: number | null = null;
  const ranked = ordered.map((candidate, index) => {
    if (priorCount !== candidate.verifiedCount) displayedRank += 1;
    priorCount = candidate.verifiedCount;
    return {
      rank: displayedRank,
      position: index + 1,
      displayName: privacySafeDriverDisplayName(candidate.firstName, candidate.lastName),
      verifiedCount: candidate.verifiedCount,
      milestone: resolveVerifiedMilestone(candidate.verifiedCount),
      isCurrentDriver: candidate.driverId === currentDriver.driverId,
      _driverId: candidate.driverId,
    };
  });
  const currentRanked = ranked.find((candidate) => candidate._driverId === currentDriver.driverId) || null;
  const currentCount = currentRanked?.verifiedCount || 0;
  const nearestHigher = [...ranked].reverse().find((candidate) => candidate.verifiedCount > currentCount) || null;
  const current = currentRanked ? {
    ...currentRanked,
    countToNextRank: nearestHigher ? nearestHigher.verifiedCount - currentCount + 1 : null,
    nextMilestone: resolveNextVerifiedMilestone(currentCount),
  } : {
    rank: null,
    position: null,
    displayName: privacySafeDriverDisplayName(currentDriver.firstName, currentDriver.lastName),
    verifiedCount: 0,
    milestone: null,
    isCurrentDriver: true,
    countToNextRank: 1,
    nextMilestone: resolveNextVerifiedMilestone(0),
    _driverId: currentDriver.driverId,
  };
  const startIndex = (page - 1) * pageSize;
  const topRows = ranked.slice(startIndex, startIndex + pageSize);
  const nearbyRows = currentRanked
    ? ranked.filter((candidate) => Math.abs(candidate.position - currentRanked.position) <= 2 && !candidate.isCurrentDriver)
    : [];
  const stripPrivateId = <T extends { _driverId: string }>(row: T) => {
    const { _driverId: _private, ...safe } = row;
    return safe;
  };

  return {
    rows: topRows.map(stripPrivateId),
    current: stripPrivateId(current),
    nearbyRows: nearbyRows.map(stripPrivateId),
    totalRankedDrivers: ranked.length,
    pagination: {
      page,
      pageSize,
      totalRows: ranked.length,
      totalPages: Math.max(1, Math.ceil(ranked.length / pageSize)),
    },
    state: ranked.length === 0 ? "empty" as const : ranked.length < 2 ? "insufficient_data" as const : "available" as const,
  };
}

export async function buildDriverCompetitionProjection(
  executor: any,
  currentDriver: { driverId: string; firstName: string; lastName: string },
  query: DriverCompetitionQuery,
) {
  const filters = [
    eq(platformAnalyticsEvents.eventType, VERIFIED_ACTIVITY_EVENT),
    sql`${platformAnalyticsEvents.activityId} IS NOT NULL`,
    eq(users.role, "driver"),
    eq(users.isActive, true),
    lte(platformAnalyticsEvents.occurredAt, query.end),
  ];
  if (query.start) filters.push(gte(platformAnalyticsEvents.occurredAt, query.start));
  if (query.state) filters.push(sql`upper(${washoutLocations.state}) = ${query.state}`);
  if (query.facilityId) filters.push(eq(platformAnalyticsEvents.locationId, query.facilityId));

  const verifiedCount = sql<number>`count(distinct ${platformAnalyticsEvents.activityId})`;
  const attainedAt = sql<Date>`max(${platformAnalyticsEvents.occurredAt})`;
  const [candidateRows, facilityRows, selectedFacilityRows] = await Promise.all([
    executor.select({
      driverId: drivers.id,
      firstName: users.firstName,
      lastName: users.lastName,
      verifiedCount,
      attainedAt,
    }).from(platformAnalyticsEvents)
      .innerJoin(drivers, eq(platformAnalyticsEvents.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(washoutLocations, eq(platformAnalyticsEvents.locationId, washoutLocations.id))
      .where(and(...filters))
      .groupBy(drivers.id, users.firstName, users.lastName)
      .having(sql`${verifiedCount} > 0`)
      .orderBy(desc(verifiedCount), asc(attainedAt), asc(drivers.id))
      .limit(MAX_RANKED_DRIVERS + 1),
    executor.select({ id: washoutLocations.id, name: washoutLocations.name, state: washoutLocations.state })
      .from(washoutLocations)
      .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .where(and(eq(washoutLocations.isActive, true), eq(washoutLocations.isVisible, true), eq(owners.isApproved, true)))
      .orderBy(asc(washoutLocations.name), asc(washoutLocations.id))
      .limit(MAX_FILTER_FACILITIES + 1),
    query.facilityId
      ? executor.select({ id: washoutLocations.id })
        .from(washoutLocations)
        .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
        .where(and(
          eq(washoutLocations.id, query.facilityId),
          eq(washoutLocations.isActive, true),
          eq(washoutLocations.isVisible, true),
          eq(owners.isApproved, true),
        )).limit(1)
      : Promise.resolve([]),
  ]);
  if (candidateRows.length > MAX_RANKED_DRIVERS) {
    throw new DriverCompetitionQueryError("Leaderboard exceeds the bounded ranked-Driver limit");
  }
  const availableFacilities: Array<{ id: string; name: string; state: string }> = facilityRows.slice(0, MAX_FILTER_FACILITIES).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    state: String(row.state || "").toUpperCase(),
  }));
  if (query.facilityId && selectedFacilityRows.length === 0) {
    throw new DriverCompetitionQueryError("Facility leaderboard is unavailable");
  }

  return {
    calculationVersion: 1,
    metric: VERIFIED_ACTIVITY_METRIC.key,
    source: "platform_analytics_events" as const,
    period: query.period,
    window: { start: query.start?.toISOString() ?? null, end: query.end.toISOString(), timezone: "UTC" as const },
    filters: { state: query.state ?? null, facilityId: query.facilityId ?? null },
    ...rankDriverCompetitionCandidates(candidateRows.map((row: any) => ({
      driverId: String(row.driverId),
      firstName: String(row.firstName || ""),
      lastName: String(row.lastName || ""),
      verifiedCount: Number(row.verifiedCount || 0),
      attainedAt: new Date(row.attainedAt),
    })), currentDriver, query.page, query.pageSize),
    availableFilters: {
      states: Array.from(new Set(availableFacilities.map((facility) => facility.state).filter(Boolean))).sort(),
      facilities: availableFacilities,
      facilitiesTruncated: facilityRows.length > MAX_FILTER_FACILITIES,
    },
    privacy: {
      displayNamePolicy: "first_name_last_initial" as const,
      includesContactData: false,
      includesPreciseGps: false,
      includesFacilityHistory: false,
      includesFinancialData: false,
      includesPrivateAnalytics: false,
    },
  };
}
