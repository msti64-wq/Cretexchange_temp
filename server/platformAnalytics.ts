import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drivers, platformAnalyticsEvents, users, washoutLocations } from "@shared/schema";

/**
 * The platform vocabulary intentionally contains operational facts only. A
 * source event is recorded once, inside the same transaction as its source
 * mutation, and never carries money, contact, private-object, or GPS data.
 */
export const PLATFORM_ANALYTICS_EVENT_TYPES = [
  "driver.registered",
  "driver.profile_completed",
  "driver.first_logged_in",
  "facility.registered",
  "facility.approved",
  "activity.checked_in",
  "photo.uploaded",
  "activity.submitted",
  "activity.repeat_submitted",
  "facility.first_driver",
  "facility.first_verified",
  "facility.recurring_usage",
  "activity.verified",
  "activity.rejected",
  "activity.owner_reviewed",
  "admin_review.requested",
  "admin_review.closed",
  "admin_review.returned_to_owner_review",
] as const;

export type PlatformAnalyticsEventType = typeof PLATFORM_ANALYTICS_EVENT_TYPES[number];
export type AnalyticsSourceRecordType = "driver" | "facility_owner" | "washout_activity" | "washout_photo" | "administrative_review";
export type AnalyticsExecutor = { insert: Function; select: Function };

export type PlatformAnalyticsEventInput = {
  eventType: PlatformAnalyticsEventType;
  sourceRecordType: AnalyticsSourceRecordType;
  sourceRecordId: string;
  sourceEventKey: string;
  occurredAt: Date;
  activityId?: string | null;
  driverId?: string | null;
  ownerId?: string | null;
  locationId?: string | null;
};

export type MetricSecurityClassification = "internal_operational";
export type PlatformMetricDefinition = {
  key: string;
  name: string;
  description: string;
  businessPurpose: string;
  sourceEvents: readonly PlatformAnalyticsEventType[];
  sourceOperationalTables: readonly string[];
  calculation: string;
  inclusionRules: string;
  exclusionRules: string;
  timeAttribution: string;
  timezonePolicy: string;
  securityClassification: MetricSecurityClassification;
  visibleRoles: readonly ("admin" | "super_admin" | "owner" | "driver")[];
};

/** The one canonical registry consumed by API consumers and documentation. */
export const PLATFORM_METRIC_REGISTRY: readonly PlatformMetricDefinition[] = [
  {
    key: "submitted_activity", name: "Submitted Activity", description: "Count of submitted material recovery activities.", businessPurpose: "Measures network activity entering owner review.", sourceEvents: ["activity.submitted"], sourceOperationalTables: ["washout_activities"], calculation: "COUNT(activity.submitted)", inclusionRules: "One immutable event for each successfully committed submission.", exclusionRules: "No payment, wallet, duplicate, or failed transaction records.", timeAttribution: "submission occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner", "driver"],
  },
  {
    key: "verified_activity", name: "Verified Activity", description: "Count of canonical owner-verified activities.", businessPurpose: "Measures completed operational verification.", sourceEvents: ["activity.verified"], sourceOperationalTables: ["washout_activities", "washout_activity_review_events"], calculation: "COUNT(activity.verified)", inclusionRules: "Only the pending-to-verified owner decision.", exclusionRules: "Administrative facilitator actions, payment success, and non-final activity.", timeAttribution: "verification occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner", "driver"],
  },
  {
    key: "rejected_activity", name: "Rejected Activity", description: "Count of canonical owner-rejected activities.", businessPurpose: "Measures operational exceptions requiring recovery or support.", sourceEvents: ["activity.rejected"], sourceOperationalTables: ["washout_activities", "washout_activity_review_events"], calculation: "COUNT(activity.rejected)", inclusionRules: "Only committed pending-to-rejected owner decisions.", exclusionRules: "Open facilitator reviews and rejections outside the selected time window.", timeAttribution: "rejection occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner", "driver"],
  },
  {
    key: "administrative_review_requested", name: "Administrative Review Requested", description: "Count of Driver requests for neutral administrative facilitation.", businessPurpose: "Measures review demand without reclassifying activities.", sourceEvents: ["admin_review.requested"], sourceOperationalTables: ["washout_activity_admin_reviews"], calculation: "COUNT(admin_review.requested)", inclusionRules: "One event per committed review round.", exclusionRules: "Owner review decisions, financial disputes, and closed-only counts.", timeAttribution: "request occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner", "driver"],
  },
  {
    key: "administrative_review_completed", name: "Administrative Review Completed", description: "Count of closed or returned-to-owner-review administrative requests.", businessPurpose: "Measures facilitator throughput.", sourceEvents: ["admin_review.closed", "admin_review.returned_to_owner_review"], sourceOperationalTables: ["washout_activity_admin_reviews", "washout_activity_review_events"], calculation: "COUNT(admin_review.closed) + COUNT(admin_review.returned_to_owner_review)", inclusionRules: "A terminal facilitator decision for a request round.", exclusionRules: "Open requests and any financial result.", timeAttribution: "facilitator decision occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin"],
  },
  {
    key: "active_drivers", name: "Active Drivers", description: "Distinct Drivers with an operational activity event in the selected window.", businessPurpose: "Measures active supply participation.", sourceEvents: ["activity.submitted", "activity.verified", "activity.rejected"], sourceOperationalTables: ["drivers", "washout_activities"], calculation: "COUNT(DISTINCT driver_id) over qualifying activity events", inclusionRules: "Non-null Driver references on qualifying activity events.", exclusionRules: "Registration-only, payment, wallet, and private profile data.", timeAttribution: "qualifying event occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin"],
  },
  {
    key: "active_facilities", name: "Active Facilities", description: "Distinct Facilities with a submitted operational activity in the selected window.", businessPurpose: "Measures active demand locations.", sourceEvents: ["activity.submitted"], sourceOperationalTables: ["washout_locations", "washout_activities"], calculation: "COUNT(DISTINCT location_id) over activity.submitted", inclusionRules: "Non-null location references on submitted activities.", exclusionRules: "Owner registration, billing configuration, and inactive records without activity.", timeAttribution: "submission occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin"],
  },
  {
    key: "driver_retention", name: "Driver Retention", description: "Share of Drivers with a later submitted activity after their first submitted activity in the selected cohort.", businessPurpose: "Measures repeat operational participation.", sourceEvents: ["activity.submitted", "activity.repeat_submitted"], sourceOperationalTables: ["drivers", "washout_activities"], calculation: "COUNT(DISTINCT driver_id with activity.repeat_submitted) / COUNT(DISTINCT driver_id with activity.submitted) × 100", inclusionRules: "Drivers with recorded submitted and repeat submitted facts.", exclusionRules: "Accounts without operational activity and all financial activity.", timeAttribution: "repeat submission occurred_at", timezonePolicy: "UTC timestamps; cohort boundaries are UTC until a report specifies a local policy.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin"],
  },
  {
    key: "facility_utilization", name: "Facility Utilization", description: "Average submitted activities per active Facility in the selected window.", businessPurpose: "Measures operational use of active locations.", sourceEvents: ["activity.submitted"], sourceOperationalTables: ["washout_locations", "washout_activities"], calculation: "COUNT(activity.submitted) / COUNT(DISTINCT location_id)", inclusionRules: "Submitted activities with a non-null location.", exclusionRules: "Unapproved, inactive, or unused locations; billing and payment records.", timeAttribution: "submission occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner"],
  },
  {
    key: "verification_rate", name: "Verification Rate", description: "Share of final owner decisions that are verified.", businessPurpose: "Measures operational evidence acceptance quality.", sourceEvents: ["activity.verified", "activity.rejected"], sourceOperationalTables: ["washout_activities", "washout_activity_review_events"], calculation: "COUNT(activity.verified) / (COUNT(activity.verified) + COUNT(activity.rejected)) × 100", inclusionRules: "Final owner verification and rejection decisions.", exclusionRules: "Pending activities, Administrative Review facilitator actions, payments, and duplicates.", timeAttribution: "owner decision occurred_at", timezonePolicy: "UTC timestamps; presentation converts only at the consuming boundary.", securityClassification: "internal_operational", visibleRoles: ["admin", "super_admin", "owner", "driver"],
  },
] as const;

export const PLATFORM_METRIC_REGISTRY_BY_KEY = Object.freeze(Object.fromEntries(PLATFORM_METRIC_REGISTRY.map((metric) => [metric.key, metric])) as Record<string, PlatformMetricDefinition>);

export type PlatformJourneyStage = { key: string; name: string; sourceEventTypes: readonly PlatformAnalyticsEventType[]; optional?: boolean };
export type PlatformJourneyDefinition = { key: "driver" | "facility" | "washout"; name: string; entity: "driver" | "facility" | "activity"; stages: readonly PlatformJourneyStage[] };

export const PLATFORM_JOURNEYS: readonly PlatformJourneyDefinition[] = [
  { key: "driver", name: "Driver Journey", entity: "driver", stages: [
    { key: "registration", name: "Registration", sourceEventTypes: ["driver.registered"] },
    { key: "first_login", name: "First Login", sourceEventTypes: ["driver.first_logged_in"] },
    { key: "check_in", name: "Check-In", sourceEventTypes: ["activity.checked_in"] },
    { key: "photo_upload", name: "Photo Upload", sourceEventTypes: ["photo.uploaded"] },
    { key: "verification", name: "Verification", sourceEventTypes: ["activity.verified"] },
    { key: "repeat_activity", name: "Repeat Activity", sourceEventTypes: ["activity.repeat_submitted"] },
  ] },
  { key: "facility", name: "Facility Journey", entity: "facility", stages: [
    { key: "registration", name: "Registration", sourceEventTypes: ["facility.registered"] },
    { key: "approval", name: "Approval", sourceEventTypes: ["facility.approved"] },
    { key: "first_driver", name: "First Driver", sourceEventTypes: ["facility.first_driver"] },
    { key: "first_verified_washout", name: "First Verified Recovery Activity", sourceEventTypes: ["facility.first_verified"] },
    { key: "recurring_usage", name: "Recurring Usage", sourceEventTypes: ["facility.recurring_usage"] },
  ] },
  { key: "washout", name: "Material Recovery Journey", entity: "activity", stages: [
    { key: "check_in", name: "Check-In", sourceEventTypes: ["activity.checked_in"] },
    { key: "photo_upload", name: "Photo Upload", sourceEventTypes: ["photo.uploaded"] },
    { key: "owner_review", name: "Owner Review", sourceEventTypes: ["activity.owner_reviewed"] },
    { key: "administrative_review", name: "Administrative Review", sourceEventTypes: ["admin_review.requested"], optional: true },
    { key: "verification", name: "Verification", sourceEventTypes: ["activity.verified"] },
    // Completion is the canonical verified lifecycle terminal. It deliberately
    // reuses the actual verification fact rather than inventing an estimate.
    { key: "completion", name: "Completion", sourceEventTypes: ["activity.verified"] },
  ] },
] as const;

export const PLATFORM_JOURNEYS_BY_KEY = Object.freeze(Object.fromEntries(PLATFORM_JOURNEYS.map((journey) => [journey.key, journey])) as Record<PlatformJourneyDefinition["key"], PlatformJourneyDefinition>);

export class PlatformAnalyticsQueryError extends Error {}

function assertEventType(eventType: string): asserts eventType is PlatformAnalyticsEventType {
  if (!PLATFORM_ANALYTICS_EVENT_TYPES.includes(eventType as PlatformAnalyticsEventType)) {
    throw new PlatformAnalyticsQueryError("Unsupported analytics event type");
  }
}

/** Inserts a safe immutable event inside the caller's existing transaction. */
export async function recordPlatformAnalyticsEvent(executor: AnalyticsExecutor, input: PlatformAnalyticsEventInput): Promise<void> {
  assertEventType(input.eventType);
  if (!input.sourceRecordId || !input.sourceEventKey || Number.isNaN(input.occurredAt.getTime())) {
    throw new PlatformAnalyticsQueryError("Invalid analytics event");
  }
  await executor.insert(platformAnalyticsEvents).values({
    ...input,
    eventVersion: 1,
    metadata: {},
  }).onConflictDoNothing({ target: platformAnalyticsEvents.sourceEventKey });
}

export function canAccessPlatformAnalytics(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

export function canAccessFacilityOperationalIntelligence(role: unknown): boolean {
  return canAccessPlatformAnalytics(role) || role === "owner";
}

function boundedPositive(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function optionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PlatformAnalyticsQueryError("Invalid date");
  return parsed;
}

export function parsePlatformAnalyticsQuery(query: Record<string, unknown>) {
  const eventType = typeof query.eventType === "string" ? query.eventType : undefined;
  if (eventType) assertEventType(eventType);
  const start = optionalDate(query.start);
  const end = optionalDate(query.end);
  if (start && end && end < start) throw new PlatformAnalyticsQueryError("Invalid date range");
  return { eventType: eventType as PlatformAnalyticsEventType | undefined, start, end, page: boundedPositive(query.page, 1, 10_000), pageSize: boundedPositive(query.pageSize, 50, 100) };
}

export function parsePlatformJourneyQuery(query: Record<string, unknown>) {
  const journey = typeof query.journey === "string" ? PLATFORM_JOURNEYS_BY_KEY[query.journey as PlatformJourneyDefinition["key"]] : undefined;
  if (!journey) throw new PlatformAnalyticsQueryError("Unsupported analytics journey");
  const start = optionalDate(query.start);
  const end = optionalDate(query.end);
  if (!start || !end) throw new PlatformAnalyticsQueryError("Journey analytics require start and end dates");
  if (end < start || end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000) throw new PlatformAnalyticsQueryError("Journey date range must be between zero and 93 days");
  return { journey, start, end };
}

export function parseFacilityIntelligenceQuery(query: Record<string, unknown>, now = new Date()) {
  const parsed = parsePlatformAnalyticsQuery(query);
  const end = parsed.end ?? now;
  const start = parsed.start ?? new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (end < start || end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000) {
    throw new PlatformAnalyticsQueryError("Facility intelligence date range must be between zero and 93 days");
  }
  return { start, end };
}

/**
 * Driver Intelligence uses one bounded event window for trends and journey
 * metrics. Lifetime summary values remain explicitly labelled as lifetime so
 * the dashboard never presents a partial period as a cumulative total.
 */
export function parseDriverIntelligenceQuery(query: Record<string, unknown>, now = new Date()) {
  const parsed = parsePlatformAnalyticsQuery(query);
  const end = parsed.end ?? now;
  const start = parsed.start ?? new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (end < start || end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000) {
    throw new PlatformAnalyticsQueryError("Driver intelligence date range must be between zero and 93 days");
  }
  return { start, end };
}

function whereForDateRange(query: Pick<ReturnType<typeof parsePlatformAnalyticsQuery>, "start" | "end">) {
  const conditions = [] as any[];
  if (query.start) conditions.push(gte(platformAnalyticsEvents.occurredAt, query.start));
  if (query.end) conditions.push(lte(platformAnalyticsEvents.occurredAt, query.end));
  return conditions.length ? and(...conditions) : undefined;
}

export async function listPlatformAnalyticsEvents(executor: any, query: ReturnType<typeof parsePlatformAnalyticsQuery>) {
  const conditions = [] as any[];
  if (query.eventType) conditions.push(eq(platformAnalyticsEvents.eventType, query.eventType));
  if (query.start) conditions.push(gte(platformAnalyticsEvents.occurredAt, query.start));
  if (query.end) conditions.push(lte(platformAnalyticsEvents.occurredAt, query.end));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, totalResult] = await Promise.all([
    executor.select({ id: platformAnalyticsEvents.id, eventType: platformAnalyticsEvents.eventType, sourceRecordType: platformAnalyticsEvents.sourceRecordType, sourceRecordId: platformAnalyticsEvents.sourceRecordId, activityId: platformAnalyticsEvents.activityId, driverId: platformAnalyticsEvents.driverId, ownerId: platformAnalyticsEvents.ownerId, locationId: platformAnalyticsEvents.locationId, occurredAt: platformAnalyticsEvents.occurredAt, recordedAt: platformAnalyticsEvents.recordedAt })
      .from(platformAnalyticsEvents).where(where).orderBy(desc(platformAnalyticsEvents.occurredAt), desc(platformAnalyticsEvents.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    executor.select({ total: sql<number>`count(*)` }).from(platformAnalyticsEvents).where(where),
  ]);
  const total = Number(totalResult[0]?.total || 0);
  return { rows, pagination: { page: query.page, pageSize: query.pageSize, totalRows: total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
}

export async function buildPlatformOperationalMetrics(executor: any, query: Pick<ReturnType<typeof parsePlatformAnalyticsQuery>, "start" | "end">) {
  const where = whereForDateRange(query);
  const [row] = await executor.select({
    submittedActivityCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
    verifiedActivityCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
    rejectedActivityCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
    administrativeReviewRequestCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'admin_review.requested')`,
    administrativeReviewCompletedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} in ('admin_review.closed', 'admin_review.returned_to_owner_review'))`,
    activeDriverCount: sql<number>`count(distinct ${platformAnalyticsEvents.driverId}) filter (where ${platformAnalyticsEvents.eventType} in ('activity.submitted', 'activity.verified', 'activity.rejected'))`,
    activeFacilityCount: sql<number>`count(distinct ${platformAnalyticsEvents.locationId}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
    repeatDriverCount: sql<number>`count(distinct ${platformAnalyticsEvents.driverId}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.repeat_submitted')`,
  }).from(platformAnalyticsEvents).where(where);
  const metrics = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)])) as Record<string, number>;
  const finalDecisions = metrics.verifiedActivityCount + metrics.rejectedActivityCount;
  return {
    window: { start: query.start?.toISOString() ?? null, end: query.end?.toISOString() ?? null },
    metrics: {
      ...metrics,
      verificationRate: finalDecisions ? metrics.verifiedActivityCount / finalDecisions : null,
      driverRetentionRate: metrics.activeDriverCount ? metrics.repeatDriverCount / metrics.activeDriverCount : null,
      facilityUtilization: metrics.activeFacilityCount ? metrics.submittedActivityCount / metrics.activeFacilityCount : null,
    },
    calculationVersion: 1,
  };
}

export type JourneyEvent = { eventType: PlatformAnalyticsEventType; occurredAt: Date; driverId?: string | null; locationId?: string | null; activityId?: string | null };
export type JourneyReport = {
  journey: string;
  entryCount: number;
  exitCount: number;
  conversionRate: number | null;
  abandonmentRate: number | null;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  stages: Array<{ key: string; name: string; reachedCount: number; conversionFromPrevious: number | null; abandonmentFromPrevious: number | null; optional: boolean }>;
};

function eventEntityId(event: JourneyEvent, entity: PlatformJourneyDefinition["entity"]): string | null {
  if (entity === "driver") return event.driverId ?? null;
  if (entity === "facility") return event.locationId ?? null;
  return event.activityId ?? null;
}

function median(numbers: number[]): number | null {
  if (!numbers.length) return null;
  const ordered = [...numbers].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[midpoint] : (ordered[midpoint - 1] + ordered[midpoint]) / 2;
}

/** Calculates funnels only from recorded facts; no inferred stages or estimates. */
export function calculateJourneyReport(definition: PlatformJourneyDefinition, events: readonly JourneyEvent[]): JourneyReport {
  const stageTimes = new Map<string, Map<string, Date>>();
  for (const event of events) {
    const entityId = eventEntityId(event, definition.entity);
    if (!entityId) continue;
    definition.stages.forEach((stage) => {
      if (!stage.sourceEventTypes.includes(event.eventType)) return;
      const byStage = stageTimes.get(entityId) || new Map<string, Date>();
      const current = byStage.get(stage.key);
      if (!current || event.occurredAt < current) byStage.set(stage.key, event.occurredAt);
      stageTimes.set(entityId, byStage);
    });
  }
  const requiredStages = definition.stages.filter((stage) => !stage.optional);
  const entryStage = requiredStages[0];
  const exitStage = requiredStages.at(-1)!;
  const entries = Array.from(stageTimes.values()).filter((stages) => stages.has(entryStage.key));
  const exits = entries.filter((stages) => stages.has(exitStage.key));
  const durations = exits.map((stages) => stages.get(exitStage.key)!.getTime() - stages.get(entryStage.key)!.getTime()).filter((duration) => duration >= 0);
  let previousReach = entries.length;
  const stages = definition.stages.map((stage) => {
    const reachedCount = entries.filter((entityStages) => entityStages.has(stage.key)).length;
    const conversionFromPrevious = previousReach ? reachedCount / previousReach : null;
    const abandonmentFromPrevious = conversionFromPrevious === null ? null : 1 - conversionFromPrevious;
    if (!stage.optional) previousReach = reachedCount;
    return { key: stage.key, name: stage.name, reachedCount, conversionFromPrevious, abandonmentFromPrevious, optional: Boolean(stage.optional) };
  });
  return {
    journey: definition.key,
    entryCount: entries.length,
    exitCount: exits.length,
    conversionRate: entries.length ? exits.length / entries.length : null,
    abandonmentRate: entries.length ? 1 - exits.length / entries.length : null,
    averageDurationMs: durations.length ? durations.reduce((total, value) => total + value, 0) / durations.length : null,
    medianDurationMs: median(durations),
    stages,
  };
}

export async function buildPlatformJourneyReport(executor: any, query: ReturnType<typeof parsePlatformJourneyQuery>) {
  const rows = await executor.select({ eventType: platformAnalyticsEvents.eventType, occurredAt: platformAnalyticsEvents.occurredAt, driverId: platformAnalyticsEvents.driverId, locationId: platformAnalyticsEvents.locationId, activityId: platformAnalyticsEvents.activityId })
    .from(platformAnalyticsEvents)
    .where(and(gte(platformAnalyticsEvents.occurredAt, query.start), lte(platformAnalyticsEvents.occurredAt, query.end)))
    .orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id))
    .limit(10_001);
  if (rows.length > 10_000) throw new PlatformAnalyticsQueryError("Journey result exceeds 10,000 events; use a narrower date range");
  return { window: { start: query.start.toISOString(), end: query.end.toISOString() }, ...calculateJourneyReport(query.journey, rows as JourneyEvent[]) };
}

/**
 * Builds the two facility-safe drop-off views. The Driver funnel is a cohort
 * of drivers who submitted at this facility in the selected window; activity
 * stages are then limited to this facility, while registration/login remain
 * the recorded account facts for that cohort. This avoids cross-facility
 * activity leakage without inventing a facility-specific registration event.
 */
export async function buildFacilityDropoffIntelligence(
  executor: any,
  locationId: string,
  query: Pick<ReturnType<typeof parseFacilityIntelligenceQuery>, "start" | "end">,
) {
  const facilityWhere = facilityEventWindow(locationId, query.start, query.end);
  const [washoutEvents, cohortRows] = await Promise.all([
    executor.select({ eventType: platformAnalyticsEvents.eventType, occurredAt: platformAnalyticsEvents.occurredAt, driverId: platformAnalyticsEvents.driverId, locationId: platformAnalyticsEvents.locationId, activityId: platformAnalyticsEvents.activityId })
      .from(platformAnalyticsEvents)
      .where(facilityWhere)
      .orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id))
      .limit(10_001),
    executor.select({ driverId: platformAnalyticsEvents.driverId })
      .from(platformAnalyticsEvents)
      .where(and(facilityWhere, eq(platformAnalyticsEvents.eventType, "activity.submitted")))
      .groupBy(platformAnalyticsEvents.driverId)
      .limit(10_001),
  ]);
  if (washoutEvents.length > 10_000 || cohortRows.length > 10_000) {
    throw new PlatformAnalyticsQueryError("Facility journey result exceeds 10,000 records; use a narrower date range");
  }
  const driverIds = cohortRows.map((row: any) => row.driverId).filter((driverId: unknown): driverId is string => Boolean(driverId));
  let driverEvents: JourneyEvent[] = [];
  if (driverIds.length) {
    const cohortEvents = await executor.select({ eventType: platformAnalyticsEvents.eventType, occurredAt: platformAnalyticsEvents.occurredAt, driverId: platformAnalyticsEvents.driverId, locationId: platformAnalyticsEvents.locationId, activityId: platformAnalyticsEvents.activityId })
      .from(platformAnalyticsEvents)
      .where(and(
        inArray(platformAnalyticsEvents.driverId, driverIds),
        gte(platformAnalyticsEvents.occurredAt, query.start),
        lte(platformAnalyticsEvents.occurredAt, query.end),
      ))
      .orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id))
      .limit(10_001);
    if (cohortEvents.length > 10_000) {
      throw new PlatformAnalyticsQueryError("Driver cohort journey exceeds 10,000 records; use a narrower date range");
    }
    const accountEventTypes = new Set<PlatformAnalyticsEventType>(["driver.registered", "driver.first_logged_in"]);
    driverEvents = cohortEvents.filter((event: JourneyEvent) => accountEventTypes.has(event.eventType) || event.locationId === locationId) as JourneyEvent[];
  }
  return {
    window: { start: query.start.toISOString(), end: query.end.toISOString(), timezone: "UTC" },
    driverJourney: calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.driver, driverEvents),
    washoutJourney: calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.washout, washoutEvents as JourneyEvent[]),
  };
}

export async function buildFacilityOperationalIntelligence(executor: any, locationId: string, query: Pick<ReturnType<typeof parsePlatformAnalyticsQuery>, "start" | "end">) {
  const conditions: any[] = [eq(platformAnalyticsEvents.locationId, locationId)];
  if (query.start) conditions.push(gte(platformAnalyticsEvents.occurredAt, query.start));
  if (query.end) conditions.push(lte(platformAnalyticsEvents.occurredAt, query.end));
  const where = and(...conditions);
  const [summary] = await executor.select({
    activityVolume: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
    repeatDriverCount: sql<number>`count(distinct ${platformAnalyticsEvents.driverId}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.repeat_submitted')`,
    verifiedActivityCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
    rejectedActivityCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
  }).from(platformAnalyticsEvents).where(where);
  const peakHour = sql<string>`to_char(${platformAnalyticsEvents.occurredAt}, 'HH24:00')`;
  const peakRows = await executor.select({ hour: peakHour, volume: sql<number>`count(*)` })
    .from(platformAnalyticsEvents).where(and(where, eq(platformAnalyticsEvents.eventType, "activity.submitted")))
    .groupBy(peakHour).orderBy(desc(sql`count(*)`), asc(peakHour)).limit(3);
  const metrics = Object.fromEntries(Object.entries(summary || {}).map(([key, value]) => [key, Number(value || 0)])) as Record<string, number>;
  const finalDecisions = metrics.verifiedActivityCount + metrics.rejectedActivityCount;
  const dayCount = query.start && query.end ? Math.max(1, Math.ceil((query.end.getTime() - query.start.getTime()) / 86_400_000)) : null;
  const verificationRate = finalDecisions ? metrics.verifiedActivityCount / finalDecisions : null;
  const rejectionRate = finalDecisions ? metrics.rejectedActivityCount / finalDecisions : null;
  // Health is operational only: verification quality (60%), low rejection (20%), and sustained activity (20%).
  const healthScore = verificationRate === null ? null : Math.round(Math.min(100, (verificationRate * 60) + ((1 - (rejectionRate || 0)) * 20) + (Math.min(metrics.activityVolume / 10, 1) * 20)));
  return {
    locationId,
    window: { start: query.start?.toISOString() ?? null, end: query.end?.toISOString() ?? null },
    metrics: { ...metrics, verificationRate, rejectionRate, averageDailyVolume: dayCount ? metrics.activityVolume / dayCount : null, facilityHealthScore: healthScore },
    peakOperatingPeriods: peakRows.map((row: any) => ({ hour: row.hour, volume: Number(row.volume || 0) })),
    calculationVersion: 1,
  };
}

export type FacilityHealthScoreInput = {
  activityVolume: number;
  finalDecisionCount: number;
  verificationRate: number | null;
  repeatDriverPercentage: number | null;
  administrativeReviewRate: number | null;
  operationalConsistency: number | null;
  profileComplete: boolean;
};

export type FacilityHealthScore = { score: number | null; state: "insufficient_data" | "needs_attention" | "stable" | "strong" };

/**
 * Internal operational score. The public owner projection deliberately emits
 * only the score and state; individual internal weights are not exposed.
 */
export function calculateFacilityHealthScore(input: FacilityHealthScoreInput): FacilityHealthScore {
  if (input.activityVolume < 1 || input.finalDecisionCount < 1 || input.verificationRate === null) {
    return { score: null, state: "insufficient_data" };
  }
  const score = Math.round(Math.min(100, Math.max(0,
    (input.verificationRate * 35)
    + ((input.repeatDriverPercentage ?? 0) * 20)
    + ((1 - (input.administrativeReviewRate ?? 0)) * 15)
    + ((input.operationalConsistency ?? 0) * 20)
    + (input.profileComplete ? 10 : 0),
  )));
  return { score, state: score >= 80 ? "strong" : score >= 60 ? "stable" : "needs_attention" };
}

export type FacilityOwnerIntelligenceContext = {
  profileComplete: boolean;
  hasOperatingHours: boolean;
};

export function buildFacilityOwnerIndicators(input: {
  context: FacilityOwnerIntelligenceContext;
  finalDecisionCount: number;
  verificationRate: number | null;
  activityVolume: number;
  administrativeReviewRate: number | null;
}) {
  const indicators: Array<{ code: string; severity: "attention" | "info" }> = [];
  if (!input.context.profileComplete) indicators.push({ code: "profile_incomplete", severity: "attention" });
  if (!input.context.hasOperatingHours) indicators.push({ code: "operating_hours_missing", severity: "attention" });
  if (input.finalDecisionCount > 0 && (input.verificationRate ?? 1) < 0.8) indicators.push({ code: "verification_rate_low", severity: "attention" });
  if (input.activityVolume > 0 && (input.administrativeReviewRate ?? 0) > 0.1) indicators.push({ code: "administrative_review_rate_high", severity: "attention" });
  if (!indicators.length) indicators.push({ code: "operational_data_healthy", severity: "info" });
  return indicators;
}

type FacilityTrendRow = { bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number };

function facilityEventWindow(locationId: string, start: Date, end: Date) {
  return and(
    eq(platformAnalyticsEvents.locationId, locationId),
    gte(platformAnalyticsEvents.occurredAt, start),
    lte(platformAnalyticsEvents.occurredAt, end),
  );
}

async function buildFacilityTrend(executor: any, where: any, bucket: any): Promise<FacilityTrendRow[]> {
  const rows = await executor.select({
    bucket,
    submittedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
    verifiedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
    rejectedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
  }).from(platformAnalyticsEvents)
    .where(where)
    .groupBy(bucket)
    .orderBy(asc(bucket));
  return rows.map((row: any) => ({
    bucket: String(row.bucket),
    submittedCount: Number(row.submittedCount || 0),
    verifiedCount: Number(row.verifiedCount || 0),
    rejectedCount: Number(row.rejectedCount || 0),
  }));
}

/**
 * Owner-scoped dashboard projection. It uses aggregation over the immutable
 * event table, limits driver rows to ten, and returns no contact, financial,
 * object-storage, or free-form event metadata.
 */
export async function buildFacilityIntelligenceDashboard(
  executor: any,
  locationId: string,
  query: ReturnType<typeof parseFacilityIntelligenceQuery>,
  context: FacilityOwnerIntelligenceContext,
) {
  const where = facilityEventWindow(locationId, query.start, query.end);
  const dailyBucket = sql<string>`to_char(date_trunc('day', ${platformAnalyticsEvents.occurredAt}), 'YYYY-MM-DD')`;
  const weeklyBucket = sql<string>`to_char(date_trunc('week', ${platformAnalyticsEvents.occurredAt}), 'IYYY-"W"IW')`;
  const monthlyBucket = sql<string>`to_char(date_trunc('month', ${platformAnalyticsEvents.occurredAt}), 'YYYY-MM')`;
  const peakHour = sql<string>`to_char(${platformAnalyticsEvents.occurredAt}, 'HH24:00')`;
  const peakDay = sql<string>`trim(to_char(${platformAnalyticsEvents.occurredAt}, 'Day'))`;
  const submittedWhere = and(where, eq(platformAnalyticsEvents.eventType, "activity.submitted"));

  const driverHistoryWhere = and(
    eq(platformAnalyticsEvents.locationId, locationId),
    lte(platformAnalyticsEvents.occurredAt, query.end),
  );
  const selectedSubmitted = sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted' and ${platformAnalyticsEvents.occurredAt} >= ${query.start})`;
  const selectedRepeat = sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.repeat_submitted' and ${platformAnalyticsEvents.occurredAt} >= ${query.start})`;
  const firstFacilitySubmission = sql<Date>`min(${platformAnalyticsEvents.occurredAt}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`;
  const latestSelectedSubmission = sql<Date>`max(${platformAnalyticsEvents.occurredAt}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted' and ${platformAnalyticsEvents.occurredAt} >= ${query.start})`;

  const [summaryRows, dailyActivity, weeklyActivity, monthlyActivity, peakHours, peakDays, driverRows] = await Promise.all([
    executor.select({
      submittedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
      verifiedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
      rejectedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
      administrativeReviewCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'admin_review.requested')`,
      activeDriverCount: sql<number>`count(distinct ${platformAnalyticsEvents.driverId}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
      repeatDriverCount: sql<number>`count(distinct ${platformAnalyticsEvents.driverId}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.repeat_submitted')`,
    }).from(platformAnalyticsEvents).where(where),
    buildFacilityTrend(executor, where, dailyBucket),
    buildFacilityTrend(executor, where, weeklyBucket),
    buildFacilityTrend(executor, where, monthlyBucket),
    executor.select({ label: peakHour, volume: sql<number>`count(*)` }).from(platformAnalyticsEvents)
      .where(submittedWhere).groupBy(peakHour).orderBy(desc(sql`count(*)`), asc(peakHour)).limit(3),
    executor.select({ label: peakDay, volume: sql<number>`count(*)` }).from(platformAnalyticsEvents)
      .where(submittedWhere).groupBy(peakDay).orderBy(desc(sql`count(*)`), asc(peakDay)).limit(3),
    executor.select({
      driverId: platformAnalyticsEvents.driverId,
      firstName: users.firstName,
      lastName: users.lastName,
      submittedCount: selectedSubmitted,
      repeatCount: selectedRepeat,
      firstActivityAt: firstFacilitySubmission,
      latestActivityAt: latestSelectedSubmission,
    }).from(platformAnalyticsEvents)
      .innerJoin(drivers, eq(platformAnalyticsEvents.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(driverHistoryWhere)
      .groupBy(platformAnalyticsEvents.driverId, users.firstName, users.lastName)
      .having(sql`${selectedSubmitted} > 0`)
      .orderBy(desc(selectedSubmitted), asc(users.firstName), asc(users.lastName))
      .limit(10),
  ]);

  const summary = Object.fromEntries(Object.entries(summaryRows[0] || {}).map(([key, value]) => [key, Number(value || 0)])) as Record<string, number>;
  const finalDecisionCount = summary.verifiedCount + summary.rejectedCount;
  const verificationRate = finalDecisionCount ? summary.verifiedCount / finalDecisionCount : null;
  const rejectionRate = finalDecisionCount ? summary.rejectedCount / finalDecisionCount : null;
  const repeatDriverPercentage = summary.activeDriverCount ? summary.repeatDriverCount / summary.activeDriverCount : null;
  const administrativeReviewRate = summary.submittedCount ? summary.administrativeReviewCount / summary.submittedCount : null;
  const daysInWindow = Math.max(1, Math.ceil((query.end.getTime() - query.start.getTime()) / 86_400_000));
  const activeDays = dailyActivity.filter((row) => row.submittedCount > 0).length;
  const operationalConsistency = activeDays / daysInWindow;
  const health = calculateFacilityHealthScore({
    activityVolume: summary.submittedCount,
    finalDecisionCount,
    verificationRate,
    repeatDriverPercentage,
    administrativeReviewRate,
    operationalConsistency,
    profileComplete: context.profileComplete,
  });
  const indicators = buildFacilityOwnerIndicators({
    context,
    finalDecisionCount,
    verificationRate,
    activityVolume: summary.submittedCount,
    administrativeReviewRate,
  });

  return {
    locationId,
    window: { start: query.start.toISOString(), end: query.end.toISOString(), timezone: "UTC" },
    overview: { ...summary, verificationRate, rejectionRate, repeatDriverPercentage },
    trends: { dailyActivity, weeklyActivity, monthlyActivity },
    drivers: driverRows.map((row: any) => ({
      driverId: row.driverId,
      displayName: `${String(row.firstName || "Driver").trim()} ${String(row.lastName || "").trim().slice(0, 1)}.`.trim(),
      submittedCount: Number(row.submittedCount || 0),
      classification: row.firstActivityAt && new Date(row.firstActivityAt) >= query.start ? "new_to_facility" : "returning",
      firstActivityAt: row.firstActivityAt ? new Date(row.firstActivityAt).toISOString() : null,
      latestActivityAt: row.latestActivityAt ? new Date(row.latestActivityAt).toISOString() : null,
    })),
    facility: {
      peakOperatingHours: peakHours.map((row: any) => ({ label: String(row.label), volume: Number(row.volume || 0) })),
      peakOperatingDays: peakDays.map((row: any) => ({ label: String(row.label), volume: Number(row.volume || 0) })),
      averageDailyVolume: summary.submittedCount / daysInWindow,
      verificationRate,
      rejectionRate,
    },
    health,
    indicators,
    calculationVersion: 1,
  };
}

type DriverTrendRow = { bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number };

function driverEventWindow(driverId: string, start: Date, end: Date) {
  return and(
    eq(platformAnalyticsEvents.driverId, driverId),
    gte(platformAnalyticsEvents.occurredAt, start),
    lte(platformAnalyticsEvents.occurredAt, end),
  );
}

async function buildDriverTrend(executor: any, where: any, bucket: any): Promise<DriverTrendRow[]> {
  const rows = await executor.select({
    bucket,
    submittedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
    verifiedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
    rejectedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
  }).from(platformAnalyticsEvents).where(where).groupBy(bucket).orderBy(asc(bucket));
  return rows.map((row: any) => ({
    bucket: String(row.bucket),
    submittedCount: Number(row.submittedCount || 0),
    verifiedCount: Number(row.verifiedCount || 0),
    rejectedCount: Number(row.rejectedCount || 0),
  }));
}

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * A driver's current streak ends on their most recent recorded submitted
 * activity day. This avoids calling a prior, non-active calendar day an
 * active streak while preserving an auditable definition from event facts.
 */
export function calculateDriverActivityStreaks(activeDates: readonly Date[]) {
  const days = Array.from(new Set(activeDates.map((date) => utcDayStart(date).getTime()))).sort((left, right) => left - right);
  if (!days.length) return { consecutiveActiveDays: 0, longestActivityStreak: 0 };
  let longest = 1;
  let currentRun = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] - days[index - 1] === 86_400_000) currentRun += 1;
    else currentRun = 1;
    longest = Math.max(longest, currentRun);
  }
  let consecutive = 1;
  for (let index = days.length - 1; index > 0 && days[index] - days[index - 1] === 86_400_000; index -= 1) {
    consecutive += 1;
  }
  return { consecutiveActiveDays: consecutive, longestActivityStreak: longest };
}

/** Driver-visible funnel values derived from the canonical Washout journey. */
export function deriveDriverJourneyMetrics(journey: JourneyReport) {
  const byKey = new Map(journey.stages.map((stage) => [stage.key, stage]));
  const checkIn = byKey.get("check_in")?.reachedCount || 0;
  const upload = byKey.get("photo_upload")?.reachedCount || 0;
  const verification = byKey.get("verification")?.reachedCount || 0;
  return {
    checkInToUploadRate: checkIn ? upload / checkIn : null,
    uploadToVerificationRate: upload ? verification / upload : null,
    overallCompletionRate: journey.conversionRate,
    averageCompletionDurationMs: journey.averageDurationMs,
    medianCompletionDurationMs: journey.medianDurationMs,
  };
}

/**
 * Driver-scoped intelligence projection. Every value comes from immutable
 * operational events, and all driver identity selection occurs in the route
 * from the authenticated account rather than a caller-supplied identifier.
 */
export async function buildDriverIntelligenceDashboard(
  executor: any,
  driverId: string,
  query: ReturnType<typeof parseDriverIntelligenceQuery>,
  now = new Date(),
) {
  const windowWhere = driverEventWindow(driverId, query.start, query.end);
  const lifetimeWhere = eq(platformAnalyticsEvents.driverId, driverId);
  const today = utcDayStart(now);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dailyBucket = sql<string>`to_char(date_trunc('day', ${platformAnalyticsEvents.occurredAt}), 'YYYY-MM-DD')`;
  const weeklyBucket = sql<string>`to_char(date_trunc('week', ${platformAnalyticsEvents.occurredAt}), 'IYYY-"W"IW')`;
  const monthlyBucket = sql<string>`to_char(date_trunc('month', ${platformAnalyticsEvents.occurredAt}), 'YYYY-MM')`;
  const peakHour = sql<string>`to_char(${platformAnalyticsEvents.occurredAt}, 'HH24:00')`;
  const peakDay = sql<string>`trim(to_char(${platformAnalyticsEvents.occurredAt}, 'Day'))`;
  const submittedLifetimeWhere = and(lifetimeWhere, eq(platformAnalyticsEvents.eventType, "activity.submitted"));

  const [summaryRows, dailyActivity, weeklyActivity, monthlyActivity, favoriteRows, visitedRows, peakHours, peakDays, activeDayRows, journeyEvents] = await Promise.all([
    executor.select({
      lifetimeVerifiedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
      verifiedThisYear: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified' and ${platformAnalyticsEvents.occurredAt} >= ${yearStart})`,
      verifiedThisMonth: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified' and ${platformAnalyticsEvents.occurredAt} >= ${monthStart})`,
      verifiedThisWeek: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified' and ${platformAnalyticsEvents.occurredAt} >= ${weekStart})`,
      verifiedToday: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified' and ${platformAnalyticsEvents.occurredAt} >= ${today})`,
      verifiedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
      rejectedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.rejected')`,
      submittedCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'activity.submitted')`,
      administrativeReviewCount: sql<number>`count(*) filter (where ${platformAnalyticsEvents.eventType} = 'admin_review.requested')`,
      firstVerifiedAt: sql<Date>`min(${platformAnalyticsEvents.occurredAt}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
      mostRecentVerifiedAt: sql<Date>`max(${platformAnalyticsEvents.occurredAt}) filter (where ${platformAnalyticsEvents.eventType} = 'activity.verified')`,
    }).from(platformAnalyticsEvents).where(lifetimeWhere),
    buildDriverTrend(executor, windowWhere, dailyBucket),
    buildDriverTrend(executor, windowWhere, weeklyBucket),
    buildDriverTrend(executor, windowWhere, monthlyBucket),
    executor.select({ locationId: platformAnalyticsEvents.locationId, name: washoutLocations.name, submittedCount: sql<number>`count(*)` })
      .from(platformAnalyticsEvents).leftJoin(washoutLocations, eq(platformAnalyticsEvents.locationId, washoutLocations.id))
      .where(submittedLifetimeWhere).groupBy(platformAnalyticsEvents.locationId, washoutLocations.name)
      .orderBy(desc(sql`count(*)`), asc(washoutLocations.name)).limit(1),
    executor.select({ visitedCount: sql<number>`count(distinct ${platformAnalyticsEvents.locationId})` })
      .from(platformAnalyticsEvents).where(submittedLifetimeWhere),
    executor.select({ label: peakHour, volume: sql<number>`count(*)` }).from(platformAnalyticsEvents)
      .where(submittedLifetimeWhere).groupBy(peakHour).orderBy(desc(sql`count(*)`), asc(peakHour)).limit(1),
    executor.select({ label: peakDay, volume: sql<number>`count(*)` }).from(platformAnalyticsEvents)
      .where(submittedLifetimeWhere).groupBy(peakDay).orderBy(desc(sql`count(*)`), asc(peakDay)).limit(1),
    executor.select({ day: sql<Date>`date_trunc('day', ${platformAnalyticsEvents.occurredAt})` }).from(platformAnalyticsEvents)
      .where(submittedLifetimeWhere).groupBy(sql`date_trunc('day', ${platformAnalyticsEvents.occurredAt})`).orderBy(asc(sql`date_trunc('day', ${platformAnalyticsEvents.occurredAt})`)).limit(10_001),
    executor.select({ eventType: platformAnalyticsEvents.eventType, occurredAt: platformAnalyticsEvents.occurredAt, driverId: platformAnalyticsEvents.driverId, locationId: platformAnalyticsEvents.locationId, activityId: platformAnalyticsEvents.activityId })
      .from(platformAnalyticsEvents).where(windowWhere).orderBy(asc(platformAnalyticsEvents.occurredAt), asc(platformAnalyticsEvents.id)).limit(10_001),
  ]);
  if (activeDayRows.length > 10_000 || journeyEvents.length > 10_000) {
    throw new PlatformAnalyticsQueryError("Driver intelligence result exceeds 10,000 records; use a narrower date range");
  }
  const summary = Object.fromEntries(Object.entries(summaryRows[0] || {}).map(([key, value]) => [key, value instanceof Date ? value : Number(value || 0)])) as Record<string, number | Date | null>;
  const verifiedCount = Number(summary.verifiedCount || 0);
  const rejectedCount = Number(summary.rejectedCount || 0);
  const submittedCount = Number(summary.submittedCount || 0);
  const administrativeReviewCount = Number(summary.administrativeReviewCount || 0);
  const finalDecisionCount = verifiedCount + rejectedCount;
  const journey = calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.washout, journeyEvents as JourneyEvent[]);
  const favorite = favoriteRows[0] as any;
  const peakHourRow = peakHours[0] as any;
  const peakDayRow = peakDays[0] as any;
  return {
    driverId,
    window: { start: query.start.toISOString(), end: query.end.toISOString(), timezone: "UTC" },
    activity: {
      lifetimeVerifiedWashouts: Number(summary.lifetimeVerifiedCount || 0),
      verifiedThisYear: Number(summary.verifiedThisYear || 0),
      verifiedThisMonth: Number(summary.verifiedThisMonth || 0),
      verifiedThisWeek: Number(summary.verifiedThisWeek || 0),
      verifiedToday: Number(summary.verifiedToday || 0),
    },
    performance: {
      verificationRate: finalDecisionCount ? verifiedCount / finalDecisionCount : null,
      administrativeReviewRate: submittedCount ? administrativeReviewCount / submittedCount : null,
      rejectionRate: finalDecisionCount ? rejectedCount / finalDecisionCount : null,
      averageWashoutsPerActiveDay: activeDayRows.length ? submittedCount / activeDayRows.length : null,
    },
    history: {
      firstVerifiedWashoutAt: summary.firstVerifiedAt instanceof Date ? summary.firstVerifiedAt.toISOString() : null,
      mostRecentVerifiedWashoutAt: summary.mostRecentVerifiedAt instanceof Date ? summary.mostRecentVerifiedAt.toISOString() : null,
      ...calculateDriverActivityStreaks(activeDayRows.map((row: any) => new Date(row.day))),
    },
    facility: {
      favoriteFacility: favorite?.locationId ? { id: String(favorite.locationId), name: String(favorite.name || "Facility"), submittedCount: Number(favorite.submittedCount || 0) } : null,
      facilitiesVisited: Number((visitedRows[0] as any)?.visitedCount || 0),
      mostActiveDayOfWeek: peakDayRow ? String(peakDayRow.label) : null,
      mostActiveHour: peakHourRow ? String(peakHourRow.label) : null,
    },
    trends: { dailyActivity, weeklyActivity, monthlyActivity },
    journey: { ...deriveDriverJourneyMetrics(journey), stages: journey.stages },
    calculationVersion: 1,
  };
}
