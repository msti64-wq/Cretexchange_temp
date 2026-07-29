import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drivers, owners, platformAnalyticsEvents, users, washoutLocations } from "@shared/schema";
import { PlatformAnalyticsQueryError, type PlatformAnalyticsEventType } from "./platformAnalytics";

const DAY_MS = 86_400_000;
const ACTIVITY_EVENTS = ["activity.submitted", "activity.verified", "activity.rejected"] as const;
const NETWORK_EVENTS = [
  "driver.registered", "facility.registered", "facility.approved",
  "activity.checked_in", "activity.submitted", "activity.repeat_submitted",
  "activity.verified", "activity.rejected", "admin_review.requested",
  "facility.first_verified", "facility.recurring_usage",
] as const satisfies readonly PlatformAnalyticsEventType[];

export type NetworkEvent = {
  eventType: PlatformAnalyticsEventType;
  occurredAt: Date;
  activityId: string | null;
  driverId: string | null;
  locationId: string | null;
};
export type NetworkDriver = { id: string; createdAt: Date };
export type NetworkFacility = {
  id: string;
  state: string;
  createdAt: Date;
  approved: boolean;
  active: boolean;
};

function date(value: unknown, fallback?: Date) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PlatformAnalyticsQueryError("Invalid date");
  return parsed;
}

export function parseNetworkIntelligenceQuery(query: Record<string, unknown>, now = new Date()) {
  const end = date(query.end, now)!;
  const start = date(query.start, new Date(end.getTime() - 29 * DAY_MS))!;
  if (end < start || end.getTime() - start.getTime() > 366 * DAY_MS) {
    throw new PlatformAnalyticsQueryError("Network intelligence date range must be between zero and 366 days");
  }
  const state = typeof query.state === "string" && /^[A-Za-z]{2}$/.test(query.state) ? query.state.toUpperCase() : undefined;
  if (query.state && !state) throw new PlatformAnalyticsQueryError("Invalid state filter");
  const facilityId = typeof query.facilityId === "string" && query.facilityId.length <= 128 ? query.facilityId : undefined;
  const page = Math.max(1, Math.min(10_000, Number(query.page) || 1));
  const pageSize = Math.max(1, Math.min(50, Number(query.pageSize) || 10));
  const sort = ["verified", "drivers", "facilities", "state"].includes(String(query.sort)) ? String(query.sort) : "verified";
  const direction: "asc" | "desc" = query.direction === "asc" ? "asc" : "desc";
  return { start, end, state, facilityId, page, pageSize, sort, direction };
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function growth(current: number, previous: number) {
  return previous ? (current - previous) / previous : current ? null : 0;
}

function within(event: NetworkEvent, start: Date, end: Date) {
  return event.occurredAt >= start && event.occurredAt <= end;
}

function trend(events: NetworkEvent[], period: "day" | "week" | "month") {
  const buckets = new Map<string, number>();
  for (const event of events.filter((item) => item.eventType === "activity.verified")) {
    const value = event.occurredAt;
    let key: string;
    if (period === "month") key = value.toISOString().slice(0, 7);
    else if (period === "week") {
      const day = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      key = day.toISOString().slice(0, 10);
    } else key = value.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return Array.from(buckets).sort(([left], [right]) => left.localeCompare(right)).map(([bucket, verifiedCount]) => ({ bucket, verifiedCount }));
}

/** Pure canonical projection used by the database service and focused tests. */
export function calculateNetworkIntelligence(input: {
  events: NetworkEvent[];
  drivers: NetworkDriver[];
  facilities: NetworkFacility[];
  start: Date;
  end: Date;
  now?: Date;
  state?: string;
  facilityId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  direction?: "asc" | "desc";
}) {
  const now = input.now ?? input.end;
  const approvedFacilities = input.facilities.filter((facility) => facility.approved && facility.active);
  const selectedApprovedFacilities = approvedFacilities
    .filter((facility) => !input.state || facility.state === input.state)
    .filter((facility) => !input.facilityId || facility.id === input.facilityId);
  const allowedFacilityIds = new Set(selectedApprovedFacilities.map((facility) => facility.id));
  const scopedEvents = input.events.filter((event) =>
    (!input.state && !input.facilityId) || (event.locationId && allowedFacilityIds.has(event.locationId)));
  const current = scopedEvents.filter((event) => within(event, input.start, input.end));
  const duration = input.end.getTime() - input.start.getTime();
  const priorEnd = new Date(input.start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - duration);
  const prior = scopedEvents.filter((event) => within(event, priorStart, priorEnd));
  const yoyStart = new Date(input.start); yoyStart.setUTCFullYear(yoyStart.getUTCFullYear() - 1);
  const yoyEnd = new Date(input.end); yoyEnd.setUTCFullYear(yoyEnd.getUTCFullYear() - 1);
  const yoy = scopedEvents.filter((event) => within(event, yoyStart, yoyEnd));
  const activeIds = (events: NetworkEvent[]) => new Set(events.filter((event) => ACTIVITY_EVENTS.includes(event.eventType as any) && event.driverId).map((event) => event.driverId!));
  const activeFacilityIds = (events: NetworkEvent[]) => new Set(events.filter((event) => event.eventType === "activity.submitted" && event.locationId).map((event) => event.locationId!));
  const currentDrivers = activeIds(current);
  const priorDrivers = activeIds(prior);
  const currentFacilities = activeFacilityIds(current);
  const previousActivityDrivers = activeIds(scopedEvents.filter((event) => event.occurredAt < input.start));
  const verified = current.filter((event) => event.eventType === "activity.verified");
  const rejected = current.filter((event) => event.eventType === "activity.rejected");
  const submitted = current.filter((event) => event.eventType === "activity.submitted");
  const review = current.filter((event) => event.eventType === "admin_review.requested");
  const repeatDrivers = new Set(current.filter((event) => event.eventType === "activity.repeat_submitted" && event.driverId).map((event) => event.driverId!));
  const retainedDrivers = Array.from(priorDrivers).filter((driverId) => currentDrivers.has(driverId));
  const facilityById = new Map(input.facilities.map((facility) => [facility.id, facility]));
  const firstVerifiedByDriver = new Map<string, Date>();
  const verifiedCountByDriver = new Map<string, number>();
  for (const event of scopedEvents.filter((item) => item.eventType === "activity.verified" && item.driverId)) {
    const driverId = event.driverId!;
    if (!firstVerifiedByDriver.has(driverId)) firstVerifiedByDriver.set(driverId, event.occurredAt);
    verifiedCountByDriver.set(driverId, (verifiedCountByDriver.get(driverId) || 0) + 1);
  }
  const firstVerifiedByFacility = new Map<string, Date>();
  const verifiedCountByFacility = new Map<string, number>();
  for (const event of scopedEvents.filter((item) => item.eventType === "activity.verified" && item.locationId)) {
    const locationId = event.locationId!;
    if (!firstVerifiedByFacility.has(locationId)) firstVerifiedByFacility.set(locationId, event.occurredAt);
    verifiedCountByFacility.set(locationId, (verifiedCountByFacility.get(locationId) || 0) + 1);
  }
  const earliestEvent = scopedEvents.reduce<Date | null>((earliest, event) => !earliest || event.occurredAt < earliest ? event.occurredAt : earliest, null);
  const earliestOperational = [...input.drivers.map((item) => item.createdAt), ...input.facilities.map((item) => item.createdAt)]
    .reduce<Date | null>((earliest, value) => !earliest || value < earliest ? value : earliest, null);
  const partialHistory = Boolean(earliestEvent && earliestOperational && earliestOperational < earliestEvent);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = new Date(today); week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const year = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const finalDecisions = verified.length + rejected.length;
  const checkIns = new Set(current.filter((event) => event.eventType === "activity.checked_in" && event.activityId).map((event) => event.activityId!));
  const verifiedTimes = new Map(current.filter((event) => event.eventType === "activity.verified" && event.activityId).map((event) => [event.activityId!, event.occurredAt]));
  const checkInTimes = new Map(current.filter((event) => event.eventType === "activity.checked_in" && event.activityId).map((event) => [event.activityId!, event.occurredAt]));
  const completionDurations = Array.from(checkInTimes).flatMap(([activityId, start]) => {
    const end = verifiedTimes.get(activityId);
    return end && end >= start ? [end.getTime() - start.getTime()] : [];
  });

  const geographyMap = new Map<string, { state: string; drivers: Set<string>; facilities: Set<string>; verified: number; repeatDrivers: Set<string>; newFacilities: number }>();
  for (const facility of selectedApprovedFacilities) {
    const row = geographyMap.get(facility.state) ?? { state: facility.state, drivers: new Set(), facilities: new Set(), verified: 0, repeatDrivers: new Set(), newFacilities: 0 };
    if (currentFacilities.has(facility.id)) row.facilities.add(facility.id);
    if (facility.createdAt >= input.start && facility.createdAt <= input.end) row.newFacilities += 1;
    geographyMap.set(facility.state, row);
  }
  for (const event of current) {
    if (!event.locationId) continue;
    if (!allowedFacilityIds.has(event.locationId)) continue;
    const state = facilityById.get(event.locationId)?.state;
    if (!state) continue;
    const row = geographyMap.get(state) ?? { state, drivers: new Set(), facilities: new Set(), verified: 0, repeatDrivers: new Set(), newFacilities: 0 };
    if (event.driverId && ACTIVITY_EVENTS.includes(event.eventType as any)) row.drivers.add(event.driverId);
    if (event.eventType === "activity.submitted") row.facilities.add(event.locationId);
    if (event.eventType === "activity.verified") row.verified += 1;
    if (event.eventType === "activity.repeat_submitted" && event.driverId) row.repeatDrivers.add(event.driverId);
    geographyMap.set(state, row);
  }
  const geographyRows = Array.from(geographyMap.values()).map((row) => ({
    state: row.state,
    activeDrivers: row.drivers.size,
    activeFacilities: row.facilities.size,
    verifiedWashouts: row.verified,
    newFacilities: row.newFacilities,
    repeatDriverRate: ratio(row.repeatDrivers.size, row.drivers.size),
    activeDriversPerActiveFacility: ratio(row.drivers.size, row.facilities.size),
  }));
  const sort = input.sort ?? "verified";
  const direction = input.direction ?? "desc";
  geographyRows.sort((left, right) => {
    const value = sort === "state" ? left.state.localeCompare(right.state)
      : sort === "drivers" ? left.activeDrivers - right.activeDrivers
      : sort === "facilities" ? left.activeFacilities - right.activeFacilities
      : left.verifiedWashouts - right.verifiedWashouts;
    return direction === "asc" ? value : -value;
  });
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 10;
  const currentVerified = verified.length;
  const priorVerified = prior.filter((event) => event.eventType === "activity.verified").length;
  const yoyVerified = yoy.filter((event) => event.eventType === "activity.verified").length;
  const historySufficientForYoy = Boolean(earliestEvent && earliestEvent <= yoyStart);
  return {
    calculationVersion: 1,
    window: { start: input.start.toISOString(), end: input.end.toISOString(), timezone: "UTC" },
    history: { effectiveAnalyticsStartAt: earliestEvent?.toISOString() ?? null, partialHistory },
    overview: {
      totalVerifiedWashouts: scopedEvents.filter((event) => event.eventType === "activity.verified" && event.occurredAt <= input.end).length,
      verifiedToday: scopedEvents.filter((event) => event.eventType === "activity.verified" && event.occurredAt >= today && event.occurredAt <= now).length,
      verifiedThisWeek: scopedEvents.filter((event) => event.eventType === "activity.verified" && event.occurredAt >= week && event.occurredAt <= now).length,
      verifiedThisMonth: scopedEvents.filter((event) => event.eventType === "activity.verified" && event.occurredAt >= month && event.occurredAt <= now).length,
      verifiedThisYear: scopedEvents.filter((event) => event.eventType === "activity.verified" && event.occurredAt >= year && event.occurredAt <= now).length,
      totalRegisteredDrivers: input.drivers.length,
      activeDrivers: currentDrivers.size,
      newDrivers: input.drivers.filter((driver) => driver.createdAt >= input.start && driver.createdAt <= input.end).length,
      returningDrivers: Array.from(currentDrivers).filter((driverId) => previousActivityDrivers.has(driverId)).length,
      retainedDrivers: retainedDrivers.length,
      driversWithFirstVerifiedActivity: Array.from(firstVerifiedByDriver.values()).filter((value) => value >= input.start && value <= input.end).length,
      driversWithRepeatVerifiedActivity: Array.from(verifiedCountByDriver.values()).filter((count) => count >= 2).length,
      totalApprovedFacilities: selectedApprovedFacilities.length,
      activeFacilities: currentFacilities.size,
      newFacilities: selectedApprovedFacilities.filter((facility) => facility.createdAt >= input.start && facility.createdAt <= input.end).length,
      facilitiesWithFirstVerifiedActivity: Array.from(firstVerifiedByFacility.values()).filter((value) => value >= input.start && value <= input.end).length,
      recurringFacilities: Array.from(verifiedCountByFacility.values()).filter((count) => count >= 2).length,
      facilitiesWithNoRecentActivity: selectedApprovedFacilities.filter((facility) => !currentFacilities.has(facility.id)).length,
    },
    engagement: {
      averageVerifiedPerActiveDriver: ratio(currentVerified, currentDrivers.size),
      averageVerifiedPerActiveFacility: ratio(currentVerified, currentFacilities.size),
      repeatDriverRate: ratio(repeatDrivers.size, currentDrivers.size),
      facilityReuseRate: ratio(Array.from(verifiedCountByFacility).filter(([, count]) => count >= 2).length, currentFacilities.size),
      driverToFacilityRatio: ratio(input.drivers.length, selectedApprovedFacilities.length),
      activeDriverToActiveFacilityRatio: ratio(currentDrivers.size, currentFacilities.size),
    },
    quality: {
      verificationRate: ratio(verified.length, finalDecisions),
      rejectionRate: ratio(rejected.length, finalDecisions),
      administrativeReviewRate: ratio(review.length, submitted.length),
      journeyCompletionRate: ratio(Array.from(verifiedTimes.keys()).filter((id) => checkIns.has(id)).length, checkIns.size),
      medianCompletionDurationMs: median(completionDurations),
      driverAttributionRate: ratio(current.filter((event) => event.driverId).length, current.length),
      facilityAttributionRate: ratio(current.filter((event) => event.locationId).length, current.length),
    },
    growth: {
      driverGrowth: growth(currentDrivers.size, priorDrivers.size),
      facilityGrowth: growth(currentFacilities.size, activeFacilityIds(prior).size),
      verifiedActivityGrowth: growth(currentVerified, priorVerified),
      monthOverMonthChange: growth(currentVerified, priorVerified),
      yearOverYearChange: historySufficientForYoy ? growth(currentVerified, yoyVerified) : null,
      yearOverYearStatus: historySufficientForYoy ? "available" : "insufficient_history",
    },
    adoption: {
      activatedDrivers: Array.from(firstVerifiedByDriver.values()).filter((value) => value <= input.end).length,
      retainedDriverRate: ratio(retainedDrivers.length, priorDrivers.size),
      retainedDriverCohortSize: priorDrivers.size,
      activatedFacilities: Array.from(firstVerifiedByFacility.values()).filter((value) => value <= input.end).length,
      recurringFacilities: Array.from(verifiedCountByFacility.values()).filter((count) => count >= 2).length,
    },
    trends: { daily: trend(current, "day"), weekly: trend(current, "week"), monthly: trend(current, "month") },
    geography: {
      dimension: "state",
      rows: geographyRows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, totalRows: geographyRows.length, totalPages: Math.max(1, Math.ceil(geographyRows.length / pageSize)) },
    },
    utilization: {
      activityVolume: submitted.length,
      averageDailyVerifiedActivity: currentVerified / Math.max(1, Math.floor(duration / DAY_MS) + 1),
      activeDriversPerActiveFacility: ratio(currentDrivers.size, currentFacilities.size),
      verifiedWashoutsPerActiveFacility: ratio(currentVerified, currentFacilities.size),
      verifiedWashoutsPerActiveDriver: ratio(currentVerified, currentDrivers.size),
      physicalCapacityAvailable: false,
    },
    privacy: { includesFinancialData: false, includesContactData: false, includesPreciseGps: false, includesRawEventMetadata: false },
    limitations: { driverRegistrationGeographyAvailable: false, metroMarketAvailable: false, physicalCapacityAvailable: false },
  };
}

export async function buildNetworkIntelligence(executor: any, query: ReturnType<typeof parseNetworkIntelligenceQuery>) {
  const [eventRows, driverRows, facilityRows] = await Promise.all([
    executor.select({
      eventType: platformAnalyticsEvents.eventType,
      occurredAt: platformAnalyticsEvents.occurredAt,
      activityId: platformAnalyticsEvents.activityId,
      driverId: platformAnalyticsEvents.driverId,
      locationId: platformAnalyticsEvents.locationId,
    }).from(platformAnalyticsEvents)
      .where(and(lte(platformAnalyticsEvents.occurredAt, query.end), inArray(platformAnalyticsEvents.eventType, [...NETWORK_EVENTS])))
      .orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id)).limit(10_001),
    executor.select({ id: drivers.id, createdAt: users.createdAt }).from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id)).where(lte(users.createdAt, query.end)).limit(10_001),
    executor.select({
      id: washoutLocations.id,
      state: washoutLocations.state,
      createdAt: washoutLocations.createdAt,
      active: washoutLocations.isActive,
      approved: owners.isApproved,
    }).from(washoutLocations).innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .where(lte(washoutLocations.createdAt, query.end)).limit(10_001),
  ]);
  if (eventRows.length > 10_000 || driverRows.length > 10_000 || facilityRows.length > 10_000) {
    throw new PlatformAnalyticsQueryError("Network intelligence result exceeds 10,000 records; use a narrower deployment strategy");
  }
  return calculateNetworkIntelligence({
    events: eventRows.map((row: any) => ({ ...row, occurredAt: new Date(row.occurredAt) })),
    drivers: driverRows.map((row: any) => ({ id: row.id, createdAt: new Date(row.createdAt) })),
    facilities: facilityRows.map((row: any) => ({ id: row.id, state: String(row.state).toUpperCase(), createdAt: new Date(row.createdAt), approved: Boolean(row.approved), active: Boolean(row.active) })),
    ...query,
  });
}
