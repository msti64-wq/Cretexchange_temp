import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drivers, owners, payments, users, washoutActivities, washoutLocations } from "../shared/schema";
import { db } from "./db";
import { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND, isPlatformFinancialOperationsRole } from "./financialObligations";
import { createFinancialWorkspaceSelectionToken } from "./financialWorkspaceSelection";

export const FINANCIAL_DISCOVERY_MAX_PAGE_SIZE = 100;
const FINANCIAL_DISCOVERY_SCAN_LIMIT = 1000;

export type FinancialDiscoveryFilters = {
  page: number;
  pageSize: number;
  ageOrder: "oldest_first" | "newest_first";
  facilityId?: string;
  locationId?: string;
};

export class FinancialDiscoveryInputError extends Error {}

type DiscoveryActivity = {
  id: string;
  status: string | null;
  amount: string | number | null;
  verifiedAt: Date | string | null;
  createdAt: Date | string | null;
  driverId: string | null;
  locationId: string | null;
};

type DiscoveryPayment = {
  id: string;
  activityId: string | null;
  driverId: string | null;
  ownerId: string | null;
  amount: string | number | null;
  processingFee: string | number | null;
  status: string | null;
  obligationKind: string | null;
  batchId: string | null;
  paidAt: Date | string | null;
  createdAt: Date | string | null;
  hasExecutionIdentifiers: boolean;
  obligationCreatedBy: string | null;
};

export type FinancialDiscoveryRecord = {
  activity: DiscoveryActivity | null;
  payment: DiscoveryPayment | null;
  driver: { id: string; displayName: string | null } | null;
  location: { id: string; ownerId: string | null; name: string | null } | null;
  facility: { id: string; name: string | null; billingTimezone: string | null } | null;
};

export type FinancialDiscoveryRepository = {
  listRecords(filters: Pick<FinancialDiscoveryFilters, "facilityId" | "locationId" | "ageOrder">): Promise<FinancialDiscoveryRecord[]>;
};

export type FinancialDiscoveryItem = Record<string, unknown>;

export type FinancialDiscoveryResponse = {
  items: FinancialDiscoveryItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean; totalScope: "bounded_scan" };
  filters: { facilityId: string | null; locationId: string | null; sort: "oldest_first" | "newest_first" };
  generatedAt: string;
  sourceLimitations?: readonly string[];
};

type ExceptionRecord = {
  activity: DiscoveryActivity | null;
  payment: DiscoveryPayment | null;
  driver: FinancialDiscoveryRecord["driver"];
  location: FinancialDiscoveryRecord["location"];
  facility: FinancialDiscoveryRecord["facility"];
  category: string;
  explanation: string;
  blocksObligationCreation: boolean;
};

function safeReference(prefix: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `${prefix}_${value.slice(-8)}`;
}

function strictDollarCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const dollars = Number(raw);
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && Math.abs(dollars * 100 - cents) <= Number.EPSILON ? cents : null;
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ageSeconds(value: Date | string | null | undefined, now: Date): number | null {
  const date = validDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
}

function hasValidTimezone(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function relationshipException(record: FinancialDiscoveryRecord): ExceptionRecord | null {
  if (!record.activity?.driverId || !record.driver) {
    return { ...record, category: "missing_driver_relationship", explanation: "The financial record has no valid Driver relationship.", blocksObligationCreation: true };
  }
  if (!record.activity?.locationId || !record.location) {
    return { ...record, category: "missing_location_relationship", explanation: "The financial record has no valid location relationship.", blocksObligationCreation: true };
  }
  if (!record.location.ownerId || !record.facility || record.location.ownerId !== record.facility.id) {
    return { ...record, category: "missing_facility_relationship", explanation: "The financial record has no valid Facility relationship.", blocksObligationCreation: true };
  }
  if (record.payment && record.payment.ownerId !== record.facility.id) {
    return { ...record, category: "facility_relationship_conflict", explanation: "The obligation owner does not match the activity Facility.", blocksObligationCreation: true };
  }
  if (record.payment && record.payment.driverId !== record.activity.driverId) {
    return { ...record, category: "driver_relationship_conflict", explanation: "The obligation Driver does not match the activity Driver.", blocksObligationCreation: true };
  }
  return null;
}

function paymentException(record: FinancialDiscoveryRecord): ExceptionRecord | null {
  const payment = record.payment;
  if (!payment) return null;
  if (payment.obligationKind !== CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND) {
    return {
      ...record,
      category: payment.obligationKind ? "unknown_obligation_version" : "legacy_payment_conflict",
      explanation: payment.obligationKind
        ? "The payment row uses an unrecognized obligation model."
        : "A legacy or unclassified payment row already references this activity.",
      blocksObligationCreation: true,
    };
  }
  if (!record.activity || record.activity.status !== "verified") {
    return { ...record, category: "activity_no_longer_verified", explanation: "The canonical obligation does not relate to an exactly verified activity.", blocksObligationCreation: true };
  }
  const relationship = relationshipException(record);
  if (relationship) return relationship;
  if (strictDollarCents(payment.amount) === null) {
    return { ...record, category: "invalid_frozen_driver_incentive", explanation: "The canonical obligation has an invalid frozen Driver incentive.", blocksObligationCreation: true };
  }
  if (strictDollarCents(payment.processingFee) === null) {
    return { ...record, category: "invalid_platform_fee", explanation: "The canonical obligation has an invalid frozen platform fee.", blocksObligationCreation: true };
  }
  if (!validDate(payment.createdAt)) {
    return { ...record, category: "missing_obligation_timestamp", explanation: "The canonical obligation has no valid creation timestamp.", blocksObligationCreation: true };
  }
  if (payment.status === "pending" && payment.hasExecutionIdentifiers) {
    return { ...record, category: "pending_obligation_has_execution_fields", explanation: "A pending canonical obligation contains execution identifiers.", blocksObligationCreation: true };
  }
  if (payment.status === "pending" && payment.paidAt) {
    return { ...record, category: "pending_obligation_has_paid_timestamp", explanation: "A pending canonical obligation contains a paid timestamp.", blocksObligationCreation: true };
  }
  if (payment.status === "pending" && payment.batchId) {
    return { ...record, category: "unexpected_batch_link", explanation: "The canonical obligation is linked to a legacy batch field and cannot be treated as unbatched.", blocksObligationCreation: true };
  }
  if (payment.status !== "pending") {
    return { ...record, category: "canonical_obligation_not_pending", explanation: "The canonical obligation is not in the pending state required for discovery.", blocksObligationCreation: true };
  }
  if (!hasValidTimezone(record.facility?.billingTimezone)) {
    return { ...record, category: "invalid_facility_billing_timezone", explanation: "The Facility billing timezone is missing or invalid.", blocksObligationCreation: true };
  }
  return null;
}

function groupRecords(records: FinancialDiscoveryRecord[]): FinancialDiscoveryRecord[][] {
  const groups = new Map<string, FinancialDiscoveryRecord[]>();
  for (const record of records) {
    const key = record.activity?.id || record.payment?.activityId || record.payment?.id || "unlinked";
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function exceptionForMissingActivity(group: FinancialDiscoveryRecord[], now: Date): ExceptionRecord | null {
  const record = group[0];
  const activity = record.activity;
  const paymentsForActivity = group.filter((entry) => entry.payment);
  if (!activity || activity.status !== "verified") return null;
  if (paymentsForActivity.length > 1) {
    return { ...record, category: "duplicate_activity_linked_financial_rows", explanation: "Multiple financial rows reference one activity.", blocksObligationCreation: true };
  }
  if (paymentsForActivity.length === 1) return paymentException(paymentsForActivity[0]);
  const relationship = relationshipException(record);
  if (relationship) return relationship;
  if (strictDollarCents(activity.amount) === null) {
    return { ...record, category: "invalid_frozen_driver_incentive", explanation: "The verified activity has no valid frozen Driver incentive.", blocksObligationCreation: true };
  }
  if (ageSeconds(activity.verifiedAt, now) === null) {
    return { ...record, category: "missing_verification_timestamp", explanation: "The verified activity has no valid verification timestamp.", blocksObligationCreation: true };
  }
  return null;
}

function sortByAge<T extends { ageSeconds: number | null; reference: string | null }>(items: T[], ageOrder: FinancialDiscoveryFilters["ageOrder"]): T[] {
  const direction = ageOrder === "oldest_first" ? -1 : 1;
  return items.sort((a, b) => direction * ((a.ageSeconds ?? -1) - (b.ageSeconds ?? -1)) || String(a.reference).localeCompare(String(b.reference)));
}

function paginate(items: FinancialDiscoveryItem[], filters: FinancialDiscoveryFilters, generatedAt: Date): FinancialDiscoveryResponse {
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: items.slice(start, start + filters.pageSize),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / filters.pageSize),
      hasMore: start + filters.pageSize < items.length,
      totalScope: "bounded_scan",
    },
    filters: { facilityId: filters.facilityId || null, locationId: filters.locationId || null, sort: filters.ageOrder },
    generatedAt: generatedAt.toISOString(),
    sourceLimitations: [
      "Canonical batch membership tables are not implemented in Phase 3B.1; legacy payments.batch_id is treated only as an exception signal.",
      `Discovery classification is bounded to ${FINANCIAL_DISCOVERY_SCAN_LIMIT} candidate activity rows per request; total is scoped to that bounded scan.`,
    ],
  };
}

function safeParticipant(record: FinancialDiscoveryRecord) {
  return {
    driver: record.driver ? { reference: safeReference("driver", record.driver.id), displayName: record.driver.displayName || "Driver" } : null,
    facility: record.facility ? { reference: safeReference("facility", record.facility.id), name: record.facility.name || "Participating Facility" } : null,
    location: record.location ? { reference: safeReference("location", record.location.id), name: record.location.name || "Location" } : null,
  };
}

export function parseFinancialDiscoveryFilters(query: Record<string, unknown>): FinancialDiscoveryFilters {
  const parsePositive = (value: unknown, fallback: number, maximum: number) => {
    if (value === undefined) return fallback;
    const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new FinancialDiscoveryInputError("Invalid pagination filter");
    return parsed;
  };
  const parseIdentifier = (value: unknown, name: string) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !value.trim() || value.length > 128) throw new FinancialDiscoveryInputError(`Invalid ${name} filter`);
    return value.trim();
  };
  const ageOrder = query.sort === undefined ? "oldest_first" : query.sort;
  if (ageOrder !== "oldest_first" && ageOrder !== "newest_first") throw new FinancialDiscoveryInputError("Invalid age sort");
  return {
    page: parsePositive(query.page, 1, 10_000),
    pageSize: parsePositive(query.pageSize ?? query.limit, 25, FINANCIAL_DISCOVERY_MAX_PAGE_SIZE),
    ageOrder,
    facilityId: parseIdentifier(query.facilityId, "facility"),
    locationId: parseIdentifier(query.locationId, "location"),
  };
}

export async function listVerifiedActivitiesWithoutCanonicalObligations(
  filters: FinancialDiscoveryFilters,
  repository: FinancialDiscoveryRepository = databaseFinancialDiscoveryRepository,
  now = new Date(),
): Promise<FinancialDiscoveryResponse> {
  const records = await repository.listRecords(filters);
  const items: Array<{ reference: string | null; ageSeconds: number | null } & FinancialDiscoveryItem> = [];
  for (const group of groupRecords(records)) {
    const record = group[0];
    const activity = record.activity;
    if (!activity || activity.status !== "verified" || group.some((entry) => entry.payment)) continue;
    if (exceptionForMissingActivity(group, now)) continue;
    items.push({
      reference: safeReference("activity", activity.id),
      activityReference: safeReference("activity", activity.id),
      selectionToken: createFinancialWorkspaceSelectionToken(activity.id),
      verificationTimestamp: validDate(activity.verifiedAt)?.toISOString() || null,
      ageSeconds: ageSeconds(activity.verifiedAt, now),
      frozenDriverIncentiveCents: strictDollarCents(activity.amount),
      classification: "missing_canonical_obligation",
      exceptionCategory: null,
      nextAction: "review_for_authorized_obligation_creation",
      ...safeParticipant(record),
    });
  }
  return paginate(sortByAge(items, filters.ageOrder), filters, now);
}

export async function listUnbatchedCanonicalObligations(
  filters: FinancialDiscoveryFilters,
  repository: FinancialDiscoveryRepository = databaseFinancialDiscoveryRepository,
  now = new Date(),
): Promise<FinancialDiscoveryResponse> {
  const records = await repository.listRecords(filters);
  const items: Array<{ reference: string | null; ageSeconds: number | null } & FinancialDiscoveryItem> = [];
  for (const group of groupRecords(records)) {
    if (group.length !== 1) continue;
    const record = group[0];
    const payment = record.payment;
    if (!payment || payment.obligationKind !== CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND || payment.status !== "pending") continue;
    if (paymentException(record)) continue;
    const incentive = strictDollarCents(payment.amount)!;
    const platformFee = strictDollarCents(payment.processingFee)!;
    items.push({
      reference: safeReference("obligation", payment.id),
      obligationReference: safeReference("obligation", payment.id),
      activityReference: safeReference("activity", payment.activityId),
      createdTimestamp: validDate(payment.createdAt)?.toISOString() || null,
      ageSeconds: ageSeconds(payment.createdAt, now),
      currentStatus: payment.status,
      canonicalObligationKind: payment.obligationKind,
      frozenDriverIncentiveCents: incentive,
      frozenPlatformFeeCents: platformFee,
      facilityChargeCents: incentive + platformFee,
      creationActorReference: safeReference("actor", payment.obligationCreatedBy),
      batchMembershipState: "unbatched_provisional",
      periodEligibility: "unavailable",
      nextAction: "review_for_canonical_batch",
      exceptionCategory: null,
      ...safeParticipant(record),
    });
  }
  return paginate(sortByAge(items, filters.ageOrder), filters, now);
}

export async function listCanonicalFinancialExceptions(
  filters: FinancialDiscoveryFilters,
  repository: FinancialDiscoveryRepository = databaseFinancialDiscoveryRepository,
  now = new Date(),
): Promise<FinancialDiscoveryResponse> {
  const records = await repository.listRecords(filters);
  const exceptions: ExceptionRecord[] = [];
  for (const group of groupRecords(records)) {
    const groupException = exceptionForMissingActivity(group, now);
    if (groupException) {
      exceptions.push(groupException);
      continue;
    }
    const record = group[0];
    if (record.payment && !record.activity) {
      exceptions.push({ ...record, category: "missing_activity_relationship", explanation: "The financial row has no corresponding activity.", blocksObligationCreation: true });
    } else if (record.payment) {
      const paymentIssue = paymentException(record);
      if (paymentIssue) exceptions.push(paymentIssue);
    }
  }
  const items = exceptions.map((exception) => {
    const ageStart = exception.payment?.createdAt || exception.activity?.verifiedAt || exception.activity?.createdAt || null;
    return {
      reference: safeReference("exception", exception.payment?.id || exception.activity?.id || null),
      recordCategory: exception.payment ? "payment" : "activity",
      activityReference: safeReference("activity", exception.activity?.id || exception.payment?.activityId),
      obligationReference: safeReference("obligation", exception.payment?.id),
      ageSeconds: ageSeconds(ageStart, now),
      exceptionCategory: exception.category,
      explanation: exception.explanation,
      nextAction: "quarantine_and_authorized_review",
      blocksObligationCreation: exception.blocksObligationCreation,
      ...safeParticipant(exception),
    };
  });
  return paginate(sortByAge(items, filters.ageOrder), filters, now);
}

export type FinancialDiscoveryEndpointDependencies = {
  getUser(userId: string): Promise<{ id: string; role?: string | null } | null | undefined>;
  list: (filters: FinancialDiscoveryFilters) => Promise<FinancialDiscoveryResponse>;
  route: string;
};

export function createAdminFinancialDiscoveryHandler(dependencies: FinancialDiscoveryEndpointDependencies) {
  return async (req: { user?: { id?: string }; query?: Record<string, unknown> }, res: { status: (code: number) => { json: (body: unknown) => unknown }; json: (body: unknown) => unknown }) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = await dependencies.getUser(req.user.id);
    if (!actor || !isPlatformFinancialOperationsRole(actor.role)) {
      return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    }
    let filters: FinancialDiscoveryFilters;
    const startedAt = Date.now();
    try {
      filters = parseFinancialDiscoveryFilters(req.query || {});
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid filters", code: "INVALID_FINANCIAL_DISCOVERY_FILTER" });
    }
    try {
      const response = await dependencies.list(filters);
      console.info("[FINANCIAL_DISCOVERY_READ]", {
        route: dependencies.route,
        actorUserId: actor.id,
        role: actor.role,
        page: filters.page,
        pageSize: filters.pageSize,
        sort: filters.ageOrder,
        hasFacilityFilter: Boolean(filters.facilityId),
        hasLocationFilter: Boolean(filters.locationId),
        resultCount: response.items.length,
        durationMs: Date.now() - startedAt,
      });
      return res.json(response);
    } catch (error) {
      console.error("[FINANCIAL_DISCOVERY_UNAVAILABLE]", { route: dependencies.route, actorUserId: actor.id, category: error instanceof Error ? error.name : "unknown", durationMs: Date.now() - startedAt });
      return res.status(503).json({ message: "Financial discovery is currently unavailable", code: "FINANCIAL_DISCOVERY_UNAVAILABLE" });
    }
  };
}

function displayName(firstName: string | null, lastName: string | null): string | null {
  const first = firstName?.trim();
  const last = lastName?.trim();
  if (!first) return null;
  return last ? `${first} ${last.slice(0, 1)}.` : first;
}

function mapRow(row: any): FinancialDiscoveryRecord {
  return {
    activity: row.activityId ? { id: row.activityId, status: row.activityStatus, amount: row.activityAmount, verifiedAt: row.activityVerifiedAt, createdAt: row.activityCreatedAt, driverId: row.activityDriverId, locationId: row.activityLocationId } : null,
    payment: row.paymentId ? { id: row.paymentId, activityId: row.paymentActivityId, driverId: row.paymentDriverId, ownerId: row.paymentOwnerId, amount: row.paymentAmount, processingFee: row.paymentProcessingFee, status: row.paymentStatus, obligationKind: row.paymentObligationKind, batchId: row.paymentBatchId, paidAt: row.paymentPaidAt, createdAt: row.paymentCreatedAt, hasExecutionIdentifiers: Boolean(row.paymentHasExecutionIdentifiers), obligationCreatedBy: row.paymentCreatedBy } : null,
    driver: row.driverId ? { id: row.driverId, displayName: displayName(row.driverFirstName, row.driverLastName) } : null,
    location: row.locationId ? { id: row.locationId, ownerId: row.locationOwnerId, name: row.locationName } : null,
    facility: row.facilityId ? { id: row.facilityId, name: row.facilityName, billingTimezone: row.facilityBillingTimezone } : null,
  };
}

const databaseFinancialDiscoveryRepository: FinancialDiscoveryRepository = {
  async listRecords(filters) {
    const activityConditions = [];
    if (filters.facilityId) activityConditions.push(eq(washoutLocations.ownerId, filters.facilityId));
    if (filters.locationId) activityConditions.push(eq(washoutActivities.locationId, filters.locationId));
    const rows = await db.select({
      activityId: washoutActivities.id, activityStatus: washoutActivities.status, activityAmount: washoutActivities.amount, activityVerifiedAt: washoutActivities.verifiedAt, activityCreatedAt: washoutActivities.createdAt, activityDriverId: washoutActivities.driverId, activityLocationId: washoutActivities.locationId,
      paymentId: payments.id, paymentActivityId: payments.activityId, paymentDriverId: payments.driverId, paymentOwnerId: payments.ownerId, paymentAmount: payments.amount, paymentProcessingFee: payments.processingFee, paymentStatus: payments.status, paymentObligationKind: payments.obligationKind, paymentBatchId: payments.batchId, paymentPaidAt: payments.paidAt, paymentCreatedAt: payments.createdAt, paymentCreatedBy: payments.obligationCreatedBy,
      paymentHasExecutionIdentifiers: sql<boolean>`(${payments.stripePaymentIntentId} IS NOT NULL OR ${payments.stripeTransferId} IS NOT NULL OR ${payments.stripeChargeId} IS NOT NULL)`,
      driverId: drivers.id, driverFirstName: users.firstName, driverLastName: users.lastName,
      locationId: washoutLocations.id, locationOwnerId: washoutLocations.ownerId, locationName: washoutLocations.name,
      facilityId: owners.id, facilityName: owners.companyName, facilityBillingTimezone: owners.billingTimezone,
    }).from(washoutActivities)
      .leftJoin(payments, eq(payments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(drivers.id, washoutActivities.driverId))
      .leftJoin(users, eq(users.id, drivers.userId))
      .leftJoin(washoutLocations, eq(washoutLocations.id, washoutActivities.locationId))
      .leftJoin(owners, eq(owners.id, washoutLocations.ownerId))
      .where(activityConditions.length ? and(...activityConditions) : undefined)
      .orderBy(
        filters.ageOrder === "oldest_first" ? asc(washoutActivities.verifiedAt) : desc(washoutActivities.verifiedAt),
        filters.ageOrder === "oldest_first" ? asc(washoutActivities.id) : desc(washoutActivities.id),
      )
      .limit(FINANCIAL_DISCOVERY_SCAN_LIMIT);
    return rows.map(mapRow);
  },
};
