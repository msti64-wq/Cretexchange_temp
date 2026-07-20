import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import {
  billingBatches,
  drivers,
  financialBatchAuditEvents,
  financialBatchExceptions,
  financialBatchMemberships,
  owners,
  payments,
  systemSettings,
  users,
  washoutActivities,
  washoutLocations,
} from "../shared/schema";
import { formatCentsToDollars } from "../shared/money";
import { db } from "./db";
import { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND, isPlatformFinancialOperationsRole } from "./financialObligations";
import { isCurrentFinancialRecord } from "./financialCutoff";

export const CANONICAL_FINANCIAL_BATCH_MODEL_VERSION = "canonical_financial_batch_v1";
export const CANONICAL_FINANCIAL_BATCH_STATE_DRAFT = "draft";
export type CanonicalFinancialBatchState = "draft" | "ready_for_review" | "approved" | "processing" | "paid" | "failed" | "cancelled";
const WEEKLY_CADENCE = "weekly";
const MAX_REASON_LENGTH = 500;

export type CanonicalBatchPeriod = {
  timezone: string;
  start: Date;
  end: Date;
  startLocalDate: string;
  endLocalDate: string;
  weekYear: number;
  weekNumber: number;
};

export type CanonicalBatchCandidate = {
  payment: {
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
  };
  activity: {
    id: string;
    driverId: string | null;
    locationId: string | null;
    status: string | null;
    verifiedAt: Date | string | null;
    createdAt?: Date | string | null;
  } | null;
  driver: { id: string } | null;
  location: { id: string; ownerId: string | null; name: string | null } | null;
  facility: { id: string; name: string | null; billingTimezone: string | null } | null;
  activeMembershipId: string | null;
};

export type CanonicalFinancialBatch = {
  id: string;
  reference: string;
  ownerId: string;
  state: CanonicalFinancialBatchState;
  modelVersion: typeof CANONICAL_FINANCIAL_BATCH_MODEL_VERSION;
  period: CanonicalBatchPeriod;
  revision: number;
  obligationCount: number;
  frozenDriverIncentiveCents: number;
  frozenPlatformFeeCents: number;
  frozenFacilityChargeCents: number;
  exceptionCount: number;
  createdAt: Date;
  createdBy: string;
  creationReason: string;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  approvalReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
};

export type CanonicalBatchMembershipInput = {
  paymentId: string;
  frozenDriverIncentiveCents: number;
  frozenPlatformFeeCents: number;
  frozenFacilityChargeCents: number;
};

export type CanonicalBatchDraftRequest = {
  facilityId: string;
  /** Inclusive Facility-local service-date range. Service date is verified_at,
   * falling back to the qualifying activity's created_at. */
  fromDate: string;
  throughDate: string;
  idempotencyKey: string;
  reason: string;
  selectionHash?: string;
};

export type CanonicalBatchListFilters = {
  facilityId?: string;
  state?: CanonicalFinancialBatchState;
  page?: number;
  pageSize?: number;
};

const DEFAULT_BATCH_PAGE_SIZE = 25;
const MAX_BATCH_PAGE_SIZE = 100;

export type CanonicalBatchDraftContext = { actorUserId: string; actorRole: string };

export type CanonicalBatchException = {
  paymentId: string | null;
  category: string;
  safeReference: string;
};

export type CanonicalBatchDraftResult = {
  batch: CanonicalFinancialBatch;
  created: boolean;
  exceptions: CanonicalBatchException[];
};

export type CanonicalFinancialBatchPreview = {
  period: CanonicalBatchPeriod;
  eligibleCount: number;
  excludedCount: number;
  alreadyBatchedCount: number;
  ineligibleCount: number;
  frozenDriverIncentiveCents: number;
  frozenPlatformFeeCents: number;
  frozenFacilityChargeCents: number;
  selectionHash: string;
};

export class CanonicalBatchDraftError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_facility_timezone"
      | "no_eligible_obligations"
      | "material_obligation_exception"
      | "canonical_batch_conflict"
      | "active_membership_conflict"
      | "financial_batch_unavailable",
    message: string,
    readonly exceptions: CanonicalBatchException[] = [],
  ) {
    super(message);
  }
}

export type FinancialBatchDraftRepositoryOperations = {
  findBatchByIdempotencyKey(key: string): Promise<CanonicalFinancialBatch | null>;
  findBatchByFacilityPeriod(ownerId: string, periodStart: Date, periodEnd: Date): Promise<CanonicalFinancialBatch | null>;
  listCandidates(ownerId: string): Promise<CanonicalBatchCandidate[]>;
  getFinancialHistoryCutoff?(): Promise<Date | string | null | undefined>;
  createDraftBatch(input: CanonicalFinancialBatch & { idempotencyKey: string }): Promise<CanonicalFinancialBatch>;
  claimMemberships(batch: CanonicalFinancialBatch, memberships: CanonicalBatchMembershipInput[], actor: CanonicalBatchDraftContext, reason: string): Promise<void>;
  appendAuditEvents(batch: CanonicalFinancialBatch, memberships: CanonicalBatchMembershipInput[], actor: CanonicalBatchDraftContext, reason: string): Promise<void>;
  recordExceptions(exceptions: CanonicalBatchException[]): Promise<void>;
};

export type FinancialBatchDraftRepository = {
  transaction<T>(run: (tx: FinancialBatchDraftRepositoryOperations) => Promise<T>): Promise<T>;
  listBatches(filters: Required<Pick<CanonicalBatchListFilters, "page" | "pageSize">> & Omit<CanonicalBatchListFilters, "page" | "pageSize">): Promise<CanonicalFinancialBatch[]>;
  findBatchDetail(batchId: string): Promise<{ batch: CanonicalFinancialBatch; memberships: CanonicalBatchMembershipInput[]; events: Array<{ eventType: string; createdAt: Date; reason: string }> } | null>;
};

function safeReference(prefix: string, value: string | null | undefined): string {
  return `${prefix}_${value ? value.slice(-8) : "unknown"}`;
}

function strictCents(value: unknown): number | null {
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

function formatLocalDate(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function dateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function asUtcLocalMidnight(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

/** Converts a local midnight to its real UTC instant without assuming a 24-hour day. */
function localMidnightInTimezone(parts: { year: number; month: number; day: number }, timezone: string): Date {
  const intended = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let candidate = new Date(intended);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const partsAtCandidate = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const read = (type: string) => Number(partsAtCandidate.find((part) => part.type === type)?.value);
    const localAsUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    const timezoneOffset = localAsUtc - candidate.getTime();
    const corrected = new Date(intended - timezoneOffset);
    if (corrected.getTime() === candidate.getTime()) return corrected;
    candidate = corrected;
  }
  return candidate;
}

function assertTimezone(timezone: unknown): asserts timezone is string {
  if (typeof timezone !== "string" || !timezone.trim()) throw new CanonicalBatchDraftError("invalid_facility_timezone", "Facility billing timezone is required");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new CanonicalBatchDraftError("invalid_facility_timezone", "Facility billing timezone is invalid");
  }
}

export function calculateCanonicalWeeklyPeriod(anchor: Date | string, timezone: string): CanonicalBatchPeriod {
  assertTimezone(timezone);
  const source = validDate(anchor);
  if (!source) throw new CanonicalBatchDraftError("invalid_request", "Period anchor must be a valid timestamp");
  const local = formatLocalDate(source, timezone);
  const localUtc = asUtcLocalMidnight(local);
  const sundayOffset = localUtc.getUTCDay();
  const startLocal = new Date(localUtc.getTime() - sundayOffset * 24 * 60 * 60 * 1000);
  const endLocal = new Date(startLocal.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startParts = { year: startLocal.getUTCFullYear(), month: startLocal.getUTCMonth() + 1, day: startLocal.getUTCDate() };
  const endParts = { year: endLocal.getUTCFullYear(), month: endLocal.getUTCMonth() + 1, day: endLocal.getUTCDate() };
  // This derives the ISO-like Sunday-based pilot week from the local period;
  // the human reference is operational only and never used for eligibility.
  const jan1 = new Date(Date.UTC(startParts.year, 0, 1));
  const weekNumber = Math.floor((startLocal.getTime() - jan1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return {
    timezone,
    start: localMidnightInTimezone(startParts, timezone),
    end: localMidnightInTimezone(endParts, timezone),
    startLocalDate: dateKey(startParts),
    endLocalDate: dateKey(endParts),
    weekYear: startParts.year,
    weekNumber,
  };
}

function parseLocalDate(value: unknown, name: string): { year: number; month: number; day: number; key: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CanonicalBatchDraftError("invalid_request", `Valid ${name} is required`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new CanonicalBatchDraftError("invalid_request", `Valid ${name} is required`);
  }
  return { year, month, day, key: value };
}

/**
 * Builds an administrator-selected inclusive date range in the Facility's
 * billing timezone. Its `end` is the exclusive local midnight after throughDate
 * so daylight-saving changes cannot alter the selected local calendar dates.
 */
export function calculateCanonicalDateRangePeriod(fromDate: string, throughDate: string, timezone: string): CanonicalBatchPeriod {
  assertTimezone(timezone);
  const from = parseLocalDate(fromDate, "from date");
  const through = parseLocalDate(throughDate, "through date");
  const fromOrdinal = Date.UTC(from.year, from.month - 1, from.day);
  const throughOrdinal = Date.UTC(through.year, through.month - 1, through.day);
  if (throughOrdinal < fromOrdinal) throw new CanonicalBatchDraftError("invalid_request", "Through date must be on or after from date");
  const nextDay = new Date(throughOrdinal + 24 * 60 * 60 * 1000);
  const end = { year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() };
  return {
    timezone,
    start: localMidnightInTimezone(from, timezone),
    end: localMidnightInTimezone(end, timezone),
    startLocalDate: from.key,
    endLocalDate: through.key,
    weekYear: from.year,
    weekNumber: 0,
  };
}

function normalizedRequest(input: CanonicalBatchDraftRequest): CanonicalBatchDraftRequest {
  const required = (value: unknown, name: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new CanonicalBatchDraftError("invalid_request", `Valid ${name} is required`);
    return value.trim();
  };
  return {
    facilityId: required(input.facilityId, "facility", 128),
    fromDate: required(input.fromDate, "from date", 10),
    throughDate: required(input.throughDate, "through date", 10),
    idempotencyKey: required(input.idempotencyKey, "idempotency key", 200),
    reason: required(input.reason, "reason", MAX_REASON_LENGTH),
    selectionHash: input.selectionHash === undefined ? undefined : required(input.selectionHash, "selection hash", 128),
  };
}

function classifyCandidate(candidate: CanonicalBatchCandidate, period: CanonicalBatchPeriod): { membership: CanonicalBatchMembershipInput | null; exception: CanonicalBatchException | null } {
  const payment = candidate.payment;
  const exception = (category: string) => ({ membership: null, exception: { paymentId: payment.id, category, safeReference: safeReference("obligation", payment.id) } });
  if (payment.obligationKind !== CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND) return exception(payment.obligationKind ? "unknown_obligation_version" : "legacy_obligation_kind");
  if (payment.status !== "pending") return exception("canonical_obligation_not_pending");
  if (payment.paidAt || payment.hasExecutionIdentifiers) return exception("execution_contaminated_obligation");
  if (payment.batchId) return exception("legacy_batch_link_conflict");
  if (candidate.activeMembershipId) return exception("active_membership_conflict");
  if (!candidate.activity || candidate.activity.status !== "verified") return exception("activity_no_longer_verified");
  if (!candidate.activity.driverId || !candidate.driver || candidate.activity.driverId !== payment.driverId) return exception("invalid_driver_relationship");
  if (!candidate.activity.locationId || !candidate.location || candidate.activity.locationId !== candidate.location.id) return exception("invalid_location_relationship");
  if (!candidate.facility || candidate.location.ownerId !== candidate.facility.id || payment.ownerId !== candidate.facility.id) return exception("invalid_facility_relationship");
  if (!candidate.facility.billingTimezone || candidate.facility.billingTimezone !== period.timezone) return exception("invalid_facility_timezone");
  // No payment, batch, or provider timestamp may silently choose eligibility.
  // The canonical transaction date is the verified service activity, falling
  // back only to that activity's created_at when verified_at is unavailable.
  const serviceDate = validDate(candidate.activity.verifiedAt) || validDate(candidate.activity.createdAt);
  if (!serviceDate || serviceDate < period.start || serviceDate >= period.end) return exception("obligation_outside_selected_range");
  const incentive = strictCents(payment.amount);
  if (incentive === null) return exception("invalid_frozen_driver_incentive");
  const fee = strictCents(payment.processingFee);
  if (fee === null || fee === 0) return exception("invalid_platform_fee");
  const facilityCharge = incentive + fee;
  if (!Number.isSafeInteger(facilityCharge)) return exception("invalid_frozen_totals");
  return { membership: { paymentId: payment.id, frozenDriverIncentiveCents: incentive, frozenPlatformFeeCents: fee, frozenFacilityChargeCents: facilityCharge }, exception: null };
}

function totals(memberships: CanonicalBatchMembershipInput[]) {
  return memberships.reduce((result, membership) => ({
    incentive: result.incentive + membership.frozenDriverIncentiveCents,
    fee: result.fee + membership.frozenPlatformFeeCents,
    facility: result.facility + membership.frozenFacilityChargeCents,
  }), { incentive: 0, fee: 0, facility: 0 });
}

function makeReference(period: CanonicalBatchPeriod): string {
  return `CTX-FB-${period.startLocalDate.replace(/-/g, "")}-${period.endLocalDate.replace(/-/g, "")}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type BatchSelection = { period: CanonicalBatchPeriod; memberships: CanonicalBatchMembershipInput[]; exceptions: CanonicalBatchException[]; selectionHash: string };

function hashSelection(period: CanonicalBatchPeriod, memberships: CanonicalBatchMembershipInput[]) {
  const material = memberships
    .slice()
    .sort((a, b) => a.paymentId.localeCompare(b.paymentId))
    .map((item) => [item.paymentId, item.frozenDriverIncentiveCents, item.frozenPlatformFeeCents, item.frozenFacilityChargeCents].join(":"));
  return createHash("sha256").update([period.timezone, period.startLocalDate, period.endLocalDate, ...material].join("|")).digest("hex");
}

async function selectCanonicalBatchCandidates(tx: FinancialBatchDraftRepositoryOperations, request: CanonicalBatchDraftRequest): Promise<BatchSelection> {
  const candidates = await tx.listCandidates(request.facilityId);
  const cutoff = await tx.getFinancialHistoryCutoff?.();
  const currentCandidates = cutoff == null ? candidates : candidates.filter((candidate) => candidate.activity && isCurrentFinancialRecord(candidate.activity, cutoff));
  const facility = currentCandidates.find((candidate) => candidate.facility?.id === request.facilityId)?.facility;
  if (!facility) throw new CanonicalBatchDraftError("no_eligible_obligations", "Facility has no discoverable canonical obligations");
  assertTimezone(facility.billingTimezone);
  const period = calculateCanonicalDateRangePeriod(request.fromDate, request.throughDate, facility.billingTimezone);
  const activityCounts = new Map<string, number>();
  for (const candidate of currentCandidates) {
    if (candidate.payment.activityId) activityCounts.set(candidate.payment.activityId, (activityCounts.get(candidate.payment.activityId) || 0) + 1);
  }
  const classified = currentCandidates.map((candidate) => {
    const activityId = candidate.payment.activityId;
    if (activityId && (activityCounts.get(activityId) || 0) > 1) {
      return { membership: null, exception: { paymentId: candidate.payment.id, category: "duplicate_activity_linked_financial_rows", safeReference: safeReference("obligation", candidate.payment.id) } };
    }
    return classifyCandidate(candidate, period);
  });
  const memberships = classified.flatMap((entry) => entry.membership ? [entry.membership] : []);
  const exceptions = classified.flatMap((entry) => entry.exception ? [entry.exception] : []);
  return { period, memberships, exceptions, selectionHash: hashSelection(period, memberships) };
}

/** Read-only administrator preview. This function deliberately performs no
 * provider, wallet, batch, membership, or audit write. */
export async function previewCanonicalFinancialBatchSelection(
  input: Pick<CanonicalBatchDraftRequest, "facilityId" | "fromDate" | "throughDate">,
  context: CanonicalBatchDraftContext,
  repository: FinancialBatchDraftRepository = databaseFinancialBatchDraftRepository,
): Promise<CanonicalFinancialBatchPreview> {
  const request = normalizedRequest({ ...input, idempotencyKey: "preview", reason: "preview" });
  if (!isPlatformFinancialOperationsRole(context.actorRole)) throw new CanonicalBatchDraftError("invalid_request", "Platform Operations authority is required");
  return repository.transaction(async (tx) => {
    const selection = await selectCanonicalBatchCandidates(tx, request);
    const frozen = totals(selection.memberships);
    const alreadyBatchedCount = selection.exceptions.filter((item) => ["active_membership_conflict", "legacy_batch_link_conflict"].includes(item.category)).length;
    return {
      period: selection.period,
      eligibleCount: selection.memberships.length,
      excludedCount: selection.exceptions.length,
      alreadyBatchedCount,
      ineligibleCount: selection.exceptions.length - alreadyBatchedCount,
      frozenDriverIncentiveCents: frozen.incentive,
      frozenPlatformFeeCents: frozen.fee,
      frozenFacilityChargeCents: frozen.facility,
      selectionHash: selection.selectionHash,
    };
  });
}

/**
 * Creates a canonical draft only. It writes frozen draft governance records,
 * memberships, and audit history in one repository transaction; it never calls
 * a provider, mutates a wallet, marks a payment paid/scheduled, or writes a
 * legacy `payments.batch_id` link.
 */
export async function createCanonicalFinancialBatchDraft(
  input: CanonicalBatchDraftRequest,
  context: CanonicalBatchDraftContext,
  repository: FinancialBatchDraftRepository = databaseFinancialBatchDraftRepository,
): Promise<CanonicalBatchDraftResult> {
  const request = normalizedRequest(input);
  if (!isPlatformFinancialOperationsRole(context.actorRole)) throw new CanonicalBatchDraftError("invalid_request", "Platform Operations authority is required");
  const outcome = await repository.transaction(async (tx) => {
    const idempotent = await tx.findBatchByIdempotencyKey(request.idempotencyKey);
    if (idempotent) return { batch: idempotent, created: false, exceptions: [] };
    const selection = await selectCanonicalBatchCandidates(tx, request);
    const { period, memberships, exceptions, selectionHash } = selection;
    const existing = await tx.findBatchByFacilityPeriod(request.facilityId, period.start, period.end);
    if (existing) return { batch: existing, created: false, exceptions: [] };
    if (request.selectionHash && request.selectionHash !== selectionHash) throw new CanonicalBatchDraftError("canonical_batch_conflict", "The selected obligations changed. Refresh the preview before creating the draft.");
    if (!memberships.length) throw new CanonicalBatchDraftError("no_eligible_obligations", "No canonical obligations are eligible for the selected date range");
    const frozen = totals(memberships);
    if (frozen.facility !== frozen.incentive + frozen.fee || !Number.isSafeInteger(frozen.facility)) {
      throw new CanonicalBatchDraftError("material_obligation_exception", "Frozen batch totals are invalid");
    }
    const draft = await tx.createDraftBatch({
      id: randomUUID(),
      reference: makeReference(period),
      ownerId: request.facilityId,
      state: CANONICAL_FINANCIAL_BATCH_STATE_DRAFT,
      modelVersion: CANONICAL_FINANCIAL_BATCH_MODEL_VERSION,
      period,
      revision: 1,
      obligationCount: memberships.length,
      frozenDriverIncentiveCents: frozen.incentive,
      frozenPlatformFeeCents: frozen.fee,
      frozenFacilityChargeCents: frozen.facility,
      exceptionCount: exceptions.length,
      createdAt: new Date(),
      createdBy: context.actorUserId,
      creationReason: request.reason,
      idempotencyKey: request.idempotencyKey,
    });
    try {
      await tx.claimMemberships(draft, memberships, context, request.reason);
    } catch (error) {
      throw new CanonicalBatchDraftError("active_membership_conflict", "One or more obligations were claimed concurrently; no draft was created", []);
    }
    if (exceptions.length) await tx.recordExceptions(exceptions);
    await tx.appendAuditEvents(draft, memberships, context, request.reason);
    return { batch: draft, created: true, exceptions: [] };
  });
  return outcome;
}

export async function listCanonicalFinancialBatches(
  filters: CanonicalBatchListFilters = {},
  repository: FinancialBatchDraftRepository = databaseFinancialBatchDraftRepository,
) {
  return repository.listBatches({ ...filters, page: filters.page || 1, pageSize: filters.pageSize || DEFAULT_BATCH_PAGE_SIZE });
}

export async function getCanonicalFinancialBatchDetail(batchId: string, repository: FinancialBatchDraftRepository = databaseFinancialBatchDraftRepository) {
  if (!batchId || batchId.length > 128) throw new CanonicalBatchDraftError("invalid_request", "Valid batch identifier is required");
  return repository.findBatchDetail(batchId);
}

function mapBatch(row: any): CanonicalFinancialBatch {
  return {
    id: row.id,
    reference: row.canonicalReference,
    ownerId: row.ownerId,
    state: row.canonicalState,
    modelVersion: row.batchModelVersion,
    period: {
      timezone: row.timezone,
      start: new Date(row.periodStart),
      end: new Date(row.periodEnd),
      startLocalDate: row.businessDate,
      endLocalDate: dateKey(formatLocalDate(new Date(row.periodEnd), row.timezone)),
      weekYear: Number(String(row.businessDate).slice(0, 4)),
      weekNumber: Number(String(row.canonicalReference).match(/-W(\d+)-/)?.[1] || 0),
    },
    revision: row.revision,
    obligationCount: row.paymentCount,
    frozenDriverIncentiveCents: row.frozenDriverIncentiveCents,
    frozenPlatformFeeCents: row.frozenPlatformFeeCents,
    frozenFacilityChargeCents: row.frozenFacilityChargeCents,
    exceptionCount: row.exceptionCount,
    createdAt: row.createdAt,
    createdBy: row.canonicalCreatedBy,
    creationReason: row.canonicalCreationReason,
    reviewedBy: row.reviewBy,
    reviewedAt: row.reviewedAt,
    reviewReason: row.reviewReason,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    approvalReason: row.approvalReason,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
  };
}

const databaseFinancialBatchDraftRepository: FinancialBatchDraftRepository = {
  transaction: async (run) => db.transaction(async (tx: any) => run({
    async getFinancialHistoryCutoff() {
      const [settings] = await tx.select({ financialHistoryCutoffAt: systemSettings.financialHistoryCutoffAt }).from(systemSettings).limit(1);
      return settings?.financialHistoryCutoffAt;
    },
    async findBatchByIdempotencyKey(key) {
      const rows = await tx.select().from(billingBatches).where(and(eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION), eq(billingBatches.idempotencyKey, key))).limit(1);
      return rows[0] ? mapBatch(rows[0]) : null;
    },
    async findBatchByFacilityPeriod(ownerId, periodStart, periodEnd) {
      const rows = await tx.select().from(billingBatches).where(and(eq(billingBatches.ownerId, ownerId), eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION), eq(billingBatches.periodStart, periodStart), eq(billingBatches.periodEnd, periodEnd))).limit(1);
      return rows[0] ? mapBatch(rows[0]) : null;
    },
    async listCandidates(ownerId) {
      const rows = await tx.select({
        payment: payments, activity: washoutActivities, driver: drivers, location: washoutLocations, facility: owners, activeMembershipId: financialBatchMemberships.id,
        hasExecutionIdentifiers: sql<boolean>`(${payments.stripePaymentIntentId} IS NOT NULL OR ${payments.stripeTransferId} IS NOT NULL OR ${payments.stripeChargeId} IS NOT NULL)`,
      }).from(payments)
        .leftJoin(washoutActivities, eq(washoutActivities.id, payments.activityId))
        .leftJoin(drivers, eq(drivers.id, payments.driverId))
        .leftJoin(washoutLocations, eq(washoutLocations.id, washoutActivities.locationId))
        .leftJoin(owners, eq(owners.id, payments.ownerId))
        .leftJoin(financialBatchMemberships, and(eq(financialBatchMemberships.paymentId, payments.id), eq(financialBatchMemberships.state, "active")))
        .where(eq(payments.ownerId, ownerId));
      return rows.map((row: any) => ({
        payment: { ...row.payment, hasExecutionIdentifiers: Boolean(row.hasExecutionIdentifiers) }, activity: row.activity, driver: row.driver,
        location: row.location, facility: row.facility, activeMembershipId: row.activeMembershipId || null,
      }));
    },
    async createDraftBatch(input) {
      const rows = await tx.insert(billingBatches).values({
        id: input.id, ownerId: input.ownerId, businessDate: input.period.startLocalDate, cutoffTime: "00:00:00", timezone: input.period.timezone,
        // Legacy fields are inert compatibility placeholders. Canonical frozen
        // values live only in canonical cent fields and canonicalState is the
        // authoritative lifecycle state.
        totalAmount: "0.00", totalFees: "0.00", paymentCount: input.obligationCount, status: "cancelled",
        batchModelVersion: input.modelVersion, canonicalReference: input.reference, canonicalState: input.state,
        periodStart: input.period.start, periodEnd: input.period.end, cadence: WEEKLY_CADENCE, revision: input.revision,
        idempotencyKey: input.idempotencyKey, frozenDriverIncentiveCents: input.frozenDriverIncentiveCents,
        frozenPlatformFeeCents: input.frozenPlatformFeeCents, frozenFacilityChargeCents: input.frozenFacilityChargeCents,
        exceptionCount: input.exceptionCount, canonicalCreatedBy: input.createdBy, canonicalCreationReason: input.creationReason,
      }).returning();
      return mapBatch(rows[0]);
    },
    async claimMemberships(batch, memberships, actor, reason) {
      if (!memberships.length) return;
      await tx.insert(financialBatchMemberships).values(memberships.map((membership) => ({
        batchId: batch.id, paymentId: membership.paymentId, state: "active", joinedBy: actor.actorUserId, joinReason: reason,
        frozenDriverIncentiveCents: membership.frozenDriverIncentiveCents, frozenPlatformFeeCents: membership.frozenPlatformFeeCents,
        frozenFacilityChargeCents: membership.frozenFacilityChargeCents, batchRevision: batch.revision,
      })));
    },
    async appendAuditEvents(batch, memberships, actor, reason) {
      await tx.insert(financialBatchAuditEvents).values({
        batchId: batch.id, eventType: "draft_created", actorId: actor.actorUserId, actorRole: actor.actorRole, reason,
        priorState: null, newState: batch.state, revision: batch.revision, obligationCount: batch.obligationCount,
        frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents, frozenPlatformFeeCents: batch.frozenPlatformFeeCents,
        frozenFacilityChargeCents: batch.frozenFacilityChargeCents, safeMetadata: { source: "canonical_financial_batch_v1" },
      });
      await tx.insert(financialBatchAuditEvents).values(memberships.map((membership) => ({
        batchId: batch.id, eventType: "obligation_joined", actorId: actor.actorUserId, actorRole: actor.actorRole, reason,
        priorState: null, newState: batch.state, revision: batch.revision, obligationCount: 1,
        frozenDriverIncentiveCents: membership.frozenDriverIncentiveCents,
        frozenPlatformFeeCents: membership.frozenPlatformFeeCents,
        frozenFacilityChargeCents: membership.frozenFacilityChargeCents,
        safeMetadata: { obligationReference: safeReference("obligation", membership.paymentId) },
      })));
    },
    async recordExceptions(exceptions) {
      if (!exceptions.length) return;
      await tx.insert(financialBatchExceptions).values(exceptions.map((exception) => ({
        paymentId: exception.paymentId, category: exception.category, safeReference: exception.safeReference, status: "open", safeMetadata: { source: "draft_construction" },
      })));
    },
  })),
  async listBatches(filters) {
    const conditions = [eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION)];
    if (filters.facilityId) conditions.push(eq(billingBatches.ownerId, filters.facilityId));
    if (filters.state) conditions.push(eq(billingBatches.canonicalState, filters.state));
    const rows = await db.select().from(billingBatches).where(and(...conditions))
      .orderBy(desc(billingBatches.periodStart), desc(billingBatches.id))
      .limit(filters.pageSize + 1)
      .offset((filters.page - 1) * filters.pageSize);
    return rows.map(mapBatch);
  },
  async findBatchDetail(batchId) {
    const rows = await db.select().from(billingBatches).where(and(eq(billingBatches.id, batchId), eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION))).limit(1);
    if (!rows[0]) return null;
    const [memberships, events] = await Promise.all([
      db.select().from(financialBatchMemberships).where(eq(financialBatchMemberships.batchId, batchId)).orderBy(asc(financialBatchMemberships.joinedAt)),
      db.select().from(financialBatchAuditEvents).where(eq(financialBatchAuditEvents.batchId, batchId)).orderBy(asc(financialBatchAuditEvents.createdAt)),
    ]);
    return {
      batch: mapBatch(rows[0]),
      memberships: memberships.map((membership) => ({ paymentId: membership.paymentId, frozenDriverIncentiveCents: membership.frozenDriverIncentiveCents, frozenPlatformFeeCents: membership.frozenPlatformFeeCents, frozenFacilityChargeCents: membership.frozenFacilityChargeCents })),
      events: events.map((event) => ({ eventType: event.eventType, createdAt: event.createdAt, reason: event.reason })),
    };
  },
};

type CanonicalBatchLifecycleAction = "ready_for_review" | "approve" | "cancel";

export type CanonicalBatchLifecycleRequest = {
  batchId: string;
  expectedState: CanonicalFinancialBatchState;
  reason: string;
  approvedCancellationConfirmed?: boolean;
  cancellationCategory?: string;
};

export class FinancialBatchLifecycleError extends Error {
  constructor(
    readonly code:
      | "FINANCIAL_BATCH_NOT_FOUND"
      | "FINANCIAL_BATCH_INVALID_STATE"
      | "FINANCIAL_BATCH_EXCEPTION_BLOCKED"
      | "FINANCIAL_BATCH_TOTAL_MISMATCH"
      | "FINANCIAL_BATCH_MEMBERSHIP_MISMATCH"
      | "FINANCIAL_BATCH_ALREADY_APPROVED"
      | "FINANCIAL_BATCH_ALREADY_CANCELLED"
      | "FINANCIAL_BATCH_EXECUTION_CONFLICT"
      | "FINANCIAL_BATCH_MODEL_UNSUPPORTED"
      | "FINANCIAL_BATCH_INVALID_REQUEST",
    message: string,
  ) {
    super(message);
  }
}

type LifecycleBatchRecord = CanonicalFinancialBatch & {
  legacyStatus: string | null;
  hasExecutionIdentifiers: boolean;
  processingStartedAt: Date | null;
  completedAt: Date | null;
};

type LifecycleMembership = CanonicalBatchMembershipInput & {
  id: string;
  state: string;
  batchRevision: number;
};

type FinancialBatchLifecycleTransaction = {
  findBatch(batchId: string): Promise<LifecycleBatchRecord | null>;
  listMemberships(batchId: string): Promise<LifecycleMembership[]>;
  listCandidates(ownerId: string): Promise<CanonicalBatchCandidate[]>;
  unresolvedExceptionCount(batchId: string): Promise<number>;
  guardedTransition(input: {
    batchId: string;
    expectedState: CanonicalFinancialBatchState;
    nextState: CanonicalFinancialBatchState;
    actor: CanonicalBatchDraftContext;
    reason: string;
  }): Promise<LifecycleBatchRecord | null>;
  releaseMemberships(batch: CanonicalFinancialBatch, actor: CanonicalBatchDraftContext, reason: string): Promise<LifecycleMembership[]>;
  appendEvent(batch: CanonicalFinancialBatch, eventType: string, actor: CanonicalBatchDraftContext, reason: string, priorState: CanonicalFinancialBatchState, safeMetadata?: Record<string, string>): Promise<void>;
  recordExceptions(batch: CanonicalFinancialBatch, exceptions: CanonicalBatchException[]): Promise<void>;
};

export type FinancialBatchLifecycleRepository = {
  transaction<T>(run: (tx: FinancialBatchLifecycleTransaction) => Promise<T>): Promise<T>;
};

export type CanonicalBatchLifecycleResult = { batch: CanonicalFinancialBatch; transitioned: boolean; releasedMemberships: number };

function lifecycleRequired(value: unknown, name: string, max = MAX_REASON_LENGTH) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_REQUEST", `A valid ${name} is required`);
  }
  return value.trim();
}

function transitionTarget(action: CanonicalBatchLifecycleAction): CanonicalFinancialBatchState {
  return action === "ready_for_review" ? "ready_for_review" : action === "approve" ? "approved" : "cancelled";
}

function permittedTransition(from: CanonicalFinancialBatchState, action: CanonicalBatchLifecycleAction) {
  return (action === "ready_for_review" && from === "draft")
    || (action === "approve" && from === "ready_for_review")
    || (action === "cancel" && ["draft", "ready_for_review", "approved"].includes(from));
}

function lifecycleNextActions(state: CanonicalFinancialBatchState): string[] {
  if (state === "draft") return ["move_to_review", "cancel"];
  if (state === "ready_for_review") return ["approve", "cancel"];
  if (state === "approved") return ["cancel_non_executed"];
  return [];
}

function validateLifecycleIntegrity(
  batch: LifecycleBatchRecord,
  memberships: LifecycleMembership[],
  candidates: CanonicalBatchCandidate[],
  unresolvedExceptions: number,
) {
  const issues: CanonicalBatchException[] = [];
  const add = (paymentId: string | null, category: string) => issues.push({ paymentId, category, safeReference: safeReference("obligation", paymentId) });
  if (batch.modelVersion !== CANONICAL_FINANCIAL_BATCH_MODEL_VERSION) add(null, "unknown_batch_model");
  if (!Number.isSafeInteger(batch.revision) || batch.revision < 1) add(null, "invalid_batch_revision");
  if (batch.hasExecutionIdentifiers || batch.processingStartedAt || batch.completedAt) add(null, "execution_contaminated_batch");
  if (!memberships.length) add(null, "membership_count_mismatch");
  const active = memberships.filter((membership) => membership.state === "active");
  if (active.length !== memberships.length || active.length !== batch.obligationCount) add(null, "membership_count_mismatch");
  const frozen = totals(active);
  if (
    frozen.incentive !== batch.frozenDriverIncentiveCents
    || frozen.fee !== batch.frozenPlatformFeeCents
    || frozen.facility !== batch.frozenFacilityChargeCents
    || frozen.facility !== frozen.incentive + frozen.fee
  ) add(null, "total_mismatch");
  const candidateByPayment = new Map(candidates.map((candidate) => [candidate.payment.id, candidate]));
  for (const membership of active) {
    if (membership.batchRevision !== batch.revision) {
      add(membership.paymentId, "membership_revision_mismatch");
      continue;
    }
    const candidate = candidateByPayment.get(membership.paymentId);
    if (!candidate) {
      add(membership.paymentId, "missing_obligation_relationship");
      continue;
    }
    // The active membership under inspection is expected. Clear it only for
    // eligibility re-validation; every other canonical claim is still caught
    // by the database partial unique index and guarded lifecycle transaction.
    const classified = classifyCandidate({ ...candidate, activeMembershipId: null }, batch.period);
    if (classified.exception) add(membership.paymentId, classified.exception.category);
    if (
      membership.frozenDriverIncentiveCents !== strictCents(candidate.payment.amount)
      || membership.frozenPlatformFeeCents !== strictCents(candidate.payment.processingFee)
    ) add(membership.paymentId, "membership_snapshot_mismatch");
  }
  if (unresolvedExceptions > 0) add(null, "unresolved_material_exception");
  return issues;
}

function lifecycleErrorFor(batch: LifecycleBatchRecord, issues: CanonicalBatchException[]) {
  if (batch.modelVersion !== CANONICAL_FINANCIAL_BATCH_MODEL_VERSION) return new FinancialBatchLifecycleError("FINANCIAL_BATCH_MODEL_UNSUPPORTED", "The batch model is not supported");
  if (issues.some((issue) => issue.category === "execution_contaminated_batch" || issue.category === "execution_contaminated_obligation")) return new FinancialBatchLifecycleError("FINANCIAL_BATCH_EXECUTION_CONFLICT", "The batch has execution evidence and cannot be changed");
  if (issues.some((issue) => issue.category === "total_mismatch" || issue.category === "membership_snapshot_mismatch")) return new FinancialBatchLifecycleError("FINANCIAL_BATCH_TOTAL_MISMATCH", "Frozen totals do not match canonical membership snapshots");
  if (issues.some((issue) => issue.category.includes("membership"))) return new FinancialBatchLifecycleError("FINANCIAL_BATCH_MEMBERSHIP_MISMATCH", "Canonical batch membership is inconsistent");
  return new FinancialBatchLifecycleError("FINANCIAL_BATCH_EXCEPTION_BLOCKED", "The canonical batch has unresolved material exceptions");
}

/**
 * Changes only the Phase 3B governance state. It never changes a payment,
 * wallet, provider, scheduling, collection, settlement, or execution record.
 */
export async function transitionCanonicalFinancialBatch(
  action: CanonicalBatchLifecycleAction,
  input: CanonicalBatchLifecycleRequest,
  actor: CanonicalBatchDraftContext,
  repository: FinancialBatchLifecycleRepository = databaseFinancialBatchLifecycleRepository,
): Promise<CanonicalBatchLifecycleResult> {
  if (!isPlatformFinancialOperationsRole(actor.actorRole)) throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_REQUEST", "Platform Operations authority is required");
  const batchId = lifecycleRequired(input.batchId, "batch identifier", 128);
  const reason = lifecycleRequired(input.reason, "reason");
  const expectedState = input.expectedState;
  if (!["draft", "ready_for_review", "approved", "cancelled"].includes(expectedState)) throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_REQUEST", "A valid expected state is required");
  if (action === "cancel" && expectedState === "approved") {
    if (input.approvedCancellationConfirmed !== true || !input.cancellationCategory || !String(input.cancellationCategory).trim() || String(input.cancellationCategory).trim().length > 100) {
      throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_REQUEST", "Approved cancellation requires explicit confirmation and a reason category");
    }
  }
  const target = transitionTarget(action);
  return repository.transaction(async (tx) => {
    const batch = await tx.findBatch(batchId);
    if (!batch) throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_NOT_FOUND", "Canonical financial batch not found");
    if (batch.modelVersion !== CANONICAL_FINANCIAL_BATCH_MODEL_VERSION) throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_MODEL_UNSUPPORTED", "The batch model is not supported");
    if (batch.state === target) return { batch, transitioned: false, releasedMemberships: 0 };
    if (batch.state === "cancelled") throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_ALREADY_CANCELLED", "Cancelled batches are terminal");
    if (batch.state === "approved" && action !== "cancel") throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_ALREADY_APPROVED", "Approved batches are immutable");
    if (batch.state !== expectedState || !permittedTransition(batch.state, action)) throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_STATE", "The batch is not in the required lifecycle state");
    const [memberships, candidates, unresolvedExceptions] = await Promise.all([
      tx.listMemberships(batch.id), tx.listCandidates(batch.ownerId), tx.unresolvedExceptionCount(batch.id),
    ]);
    const issues = validateLifecycleIntegrity(batch, memberships, candidates, unresolvedExceptions);
    const executionIssue = issues.find((issue) => issue.category === "execution_contaminated_batch" || issue.category === "execution_contaminated_obligation");
    if (executionIssue) throw lifecycleErrorFor(batch, issues);
    if (action !== "cancel" && issues.length) throw lifecycleErrorFor(batch, issues);
    const updated = await tx.guardedTransition({ batchId: batch.id, expectedState, nextState: target, actor, reason });
    if (!updated) {
      const raced = await tx.findBatch(batch.id);
      if (raced?.state === target) return { batch: raced, transitioned: false, releasedMemberships: 0 };
      throw new FinancialBatchLifecycleError("FINANCIAL_BATCH_INVALID_STATE", "The batch changed concurrently; retry with the current state");
    }
    let released: LifecycleMembership[] = [];
    if (action === "cancel") {
      // Invalid obligations are released from this cancelled grouping but stay
      // visible as exceptions. They are never silently reclassified or repaired.
      const cancellationExceptions = issues.filter((issue) => issue.paymentId !== null);
      if (cancellationExceptions.length) await tx.recordExceptions(updated, cancellationExceptions);
      released = await tx.releaseMemberships(updated, actor, reason);
      for (const membership of released) {
        await tx.appendEvent(updated, "membership_released", actor, reason, expectedState, { obligationReference: safeReference("obligation", membership.paymentId) });
      }
    }
    await tx.appendEvent(updated, target, actor, reason, expectedState, action === "cancel" && expectedState === "approved" ? { cancellationCategory: String(input.cancellationCategory).trim() } : undefined);
    return { batch: updated, transitioned: true, releasedMemberships: released.length };
  });
}

const databaseFinancialBatchLifecycleRepository: FinancialBatchLifecycleRepository = {
  transaction: async (run) => db.transaction(async (tx: any) => run({
    async findBatch(batchId) {
      const rows = await tx.select({
        batch: billingBatches,
        hasExecutionIdentifiers: sql<boolean>`(${billingBatches.stripePaymentIntentId} IS NOT NULL OR ${billingBatches.stripeBatchTransferId} IS NOT NULL)`,
      }).from(billingBatches).where(eq(billingBatches.id, batchId)).limit(1);
      if (!rows[0]) return null;
      return { ...mapBatch(rows[0].batch), legacyStatus: rows[0].batch.status, hasExecutionIdentifiers: Boolean(rows[0].hasExecutionIdentifiers), processingStartedAt: rows[0].batch.processingStartedAt, completedAt: rows[0].batch.completedAt };
    },
    async listMemberships(batchId) {
      const rows = await tx.select().from(financialBatchMemberships).where(eq(financialBatchMemberships.batchId, batchId));
      return rows.map((row: any) => ({ id: row.id, paymentId: row.paymentId, state: row.state, batchRevision: row.batchRevision, frozenDriverIncentiveCents: row.frozenDriverIncentiveCents, frozenPlatformFeeCents: row.frozenPlatformFeeCents, frozenFacilityChargeCents: row.frozenFacilityChargeCents }));
    },
    async listCandidates(ownerId) {
      const rows = await tx.select({
        payment: payments, activity: washoutActivities, driver: drivers, location: washoutLocations, facility: owners, activeMembershipId: financialBatchMemberships.id,
        hasExecutionIdentifiers: sql<boolean>`(${payments.stripePaymentIntentId} IS NOT NULL OR ${payments.stripeTransferId} IS NOT NULL OR ${payments.stripeChargeId} IS NOT NULL)`,
      }).from(payments)
        .leftJoin(washoutActivities, eq(washoutActivities.id, payments.activityId))
        .leftJoin(drivers, eq(drivers.id, payments.driverId))
        .leftJoin(washoutLocations, eq(washoutLocations.id, washoutActivities.locationId))
        .leftJoin(owners, eq(owners.id, payments.ownerId))
        .leftJoin(financialBatchMemberships, and(eq(financialBatchMemberships.paymentId, payments.id), eq(financialBatchMemberships.state, "active")))
        .where(eq(payments.ownerId, ownerId));
      return rows.map((row: any) => ({
        payment: { ...row.payment, hasExecutionIdentifiers: Boolean(row.hasExecutionIdentifiers) }, activity: row.activity, driver: row.driver,
        location: row.location, facility: row.facility, activeMembershipId: row.activeMembershipId || null,
      }));
    },
    async unresolvedExceptionCount(batchId) {
      const rows = await tx.select({ count: sql<number>`count(*)` }).from(financialBatchExceptions).where(and(eq(financialBatchExceptions.batchId, batchId), eq(financialBatchExceptions.status, "open")));
      return Number(rows[0]?.count || 0);
    },
    async guardedTransition(input) {
      const lifecycleFields = input.nextState === "ready_for_review"
        ? { canonicalState: input.nextState, reviewBy: input.actor.actorUserId, reviewRole: input.actor.actorRole, reviewedAt: new Date(), reviewReason: input.reason, updatedAt: new Date() }
        : input.nextState === "approved"
          ? { canonicalState: input.nextState, approvedBy: input.actor.actorUserId, approvedRole: input.actor.actorRole, approvedAt: new Date(), approvalReason: input.reason, updatedAt: new Date() }
          : { canonicalState: input.nextState, cancelledBy: input.actor.actorUserId, cancelledRole: input.actor.actorRole, cancelledAt: new Date(), cancellationReason: input.reason, updatedAt: new Date() };
      const rows = await tx.update(billingBatches).set(lifecycleFields).where(and(
        eq(billingBatches.id, input.batchId),
        eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION),
        eq(billingBatches.canonicalState, input.expectedState),
      )).returning();
      if (!rows[0]) return null;
      return { ...mapBatch(rows[0]), legacyStatus: rows[0].status, hasExecutionIdentifiers: Boolean(rows[0].stripePaymentIntentId || rows[0].stripeBatchTransferId), processingStartedAt: rows[0].processingStartedAt, completedAt: rows[0].completedAt };
    },
    async releaseMemberships(batch, actor, reason) {
      const rows = await tx.update(financialBatchMemberships).set({ state: "released", releasedAt: new Date(), releasedBy: actor.actorUserId, releaseReason: reason }).where(and(eq(financialBatchMemberships.batchId, batch.id), eq(financialBatchMemberships.state, "active"))).returning();
      return rows.map((row: any) => ({ id: row.id, paymentId: row.paymentId, state: row.state, batchRevision: row.batchRevision, frozenDriverIncentiveCents: row.frozenDriverIncentiveCents, frozenPlatformFeeCents: row.frozenPlatformFeeCents, frozenFacilityChargeCents: row.frozenFacilityChargeCents }));
    },
    async appendEvent(batch, eventType, actor, reason, priorState, safeMetadata) {
      await tx.insert(financialBatchAuditEvents).values({
        batchId: batch.id, eventType, actorId: actor.actorUserId, actorRole: actor.actorRole, reason,
        priorState, newState: batch.state, revision: batch.revision, obligationCount: batch.obligationCount,
        frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents, frozenPlatformFeeCents: batch.frozenPlatformFeeCents,
        frozenFacilityChargeCents: batch.frozenFacilityChargeCents, safeMetadata: { modelVersion: batch.modelVersion, reference: batch.reference, ...(safeMetadata || {}) },
      });
    },
    async recordExceptions(batch, exceptions) {
      if (!exceptions.length) return;
      await tx.insert(financialBatchExceptions).values(exceptions.map((exception) => ({ batchId: batch.id, paymentId: exception.paymentId, category: exception.category, safeReference: exception.safeReference, status: "open", safeMetadata: { source: "canonical_batch_cancellation" } })));
    },
  })),
};

function safeBatchProjection(batch: CanonicalFinancialBatch) {
  return {
    id: batch.id,
    reference: batch.reference,
    facilityReference: safeReference("facility", batch.ownerId),
    state: batch.state,
    period: { start: batch.period.start.toISOString(), end: batch.period.end.toISOString(), timezone: batch.period.timezone, cadence: WEEKLY_CADENCE },
    revision: batch.revision,
    obligationCount: batch.obligationCount,
    frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents,
    frozenPlatformFeeCents: batch.frozenPlatformFeeCents,
    frozenFacilityChargeCents: batch.frozenFacilityChargeCents,
    exceptionCount: batch.exceptionCount,
    nextActions: lifecycleNextActions(batch.state),
    lifecycle: {
      reviewActorReference: batch.reviewedBy ? safeReference("operator", batch.reviewedBy) : null,
      reviewedAt: batch.reviewedAt?.toISOString() || null,
      approvalActorReference: batch.approvedBy ? safeReference("operator", batch.approvedBy) : null,
      approvedAt: batch.approvedAt?.toISOString() || null,
      cancellationActorReference: batch.cancelledBy ? safeReference("operator", batch.cancelledBy) : null,
      cancelledAt: batch.cancelledAt?.toISOString() || null,
    },
  };
}

export type FinancialBatchEndpointDependencies = {
  getUser(userId: string): Promise<{ id: string; role?: string | null } | null | undefined>;
  create?: (request: CanonicalBatchDraftRequest, context: CanonicalBatchDraftContext) => Promise<CanonicalBatchDraftResult>;
  preview?: (request: Pick<CanonicalBatchDraftRequest, "facilityId" | "fromDate" | "throughDate">, context: CanonicalBatchDraftContext) => Promise<CanonicalFinancialBatchPreview>;
  list?: (filters: Required<Pick<CanonicalBatchListFilters, "page" | "pageSize">> & Omit<CanonicalBatchListFilters, "page" | "pageSize">) => Promise<CanonicalFinancialBatch[]>;
  detail?: (batchId: string) => ReturnType<typeof getCanonicalFinancialBatchDetail>;
  transition?: (action: CanonicalBatchLifecycleAction, request: CanonicalBatchLifecycleRequest, actor: CanonicalBatchDraftContext) => Promise<CanonicalBatchLifecycleResult>;
};

function authorizedActor(user: { id: string; role?: string | null } | null | undefined) {
  return user && isPlatformFinancialOperationsRole(user.role) ? { actorUserId: user.id, actorRole: user.role! } : null;
}

export function createAdminFinancialBatchDraftHandler(dependencies: FinancialBatchEndpointDependencies) {
  return async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = authorizedActor(await dependencies.getUser(req.user.id));
    if (!actor) return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    try {
      const body = req.body || {};
      const result = await (dependencies.create || createCanonicalFinancialBatchDraft)({
        facilityId: body.facilityId,
        fromDate: body.fromDate,
        throughDate: body.throughDate,
        idempotencyKey: req.get?.("Idempotency-Key") || body.idempotencyKey,
        reason: body.reason,
        selectionHash: body.selectionHash,
      }, actor);
      return res.status(result.created ? 201 : 200).json({ batch: safeBatchProjection(result.batch), created: result.created, exceptions: result.exceptions });
    } catch (error) {
      if (error instanceof CanonicalBatchDraftError) {
        const status = error.code === "invalid_request" || error.code === "invalid_facility_timezone" ? 400 : 409;
        return res.status(status).json({ message: error.message, code: error.code, exceptions: error.exceptions });
      }
      console.error("[CANONICAL_FINANCIAL_BATCH_DRAFT_UNAVAILABLE]", { actorUserId: actor.actorUserId, category: error instanceof Error ? error.name : "unknown" });
      return res.status(503).json({ message: "Canonical financial batch service is unavailable", code: "financial_batch_unavailable" });
    }
  };
}

export function createAdminFinancialBatchPreviewHandler(dependencies: FinancialBatchEndpointDependencies) {
  return async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = authorizedActor(await dependencies.getUser(req.user.id));
    if (!actor) return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    try {
      const body = req.body || {};
      const preview = await (dependencies.preview || previewCanonicalFinancialBatchSelection)({
        facilityId: body.facilityId,
        fromDate: body.fromDate,
        throughDate: body.throughDate,
      }, actor);
      return res.json(preview);
    } catch (error) {
      if (error instanceof CanonicalBatchDraftError) return res.status(error.code === "invalid_request" || error.code === "invalid_facility_timezone" ? 400 : 409).json({ message: error.message, code: error.code });
      console.error("[CANONICAL_FINANCIAL_BATCH_PREVIEW_UNAVAILABLE]", { category: error instanceof Error ? error.name : "unknown" });
      return res.status(503).json({ message: "Canonical financial batch preview is unavailable", code: "financial_batch_preview_unavailable" });
    }
  };
}

export function createAdminFinancialBatchListHandler(dependencies: FinancialBatchEndpointDependencies) {
  return async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = authorizedActor(await dependencies.getUser(req.user.id));
    if (!actor) return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    try {
      const parsePositive = (value: unknown, fallback: number, maximum: number) => {
        if (value === undefined) return fallback;
        if (typeof value !== "string" || !/^\d+$/.test(value)) throw new CanonicalBatchDraftError("invalid_request", "Invalid pagination filter");
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new CanonicalBatchDraftError("invalid_request", "Invalid pagination filter");
        return parsed;
      };
      const facilityId = req.query?.facilityId;
      if (facilityId !== undefined && (typeof facilityId !== "string" || !facilityId.trim() || facilityId.length > 128)) throw new CanonicalBatchDraftError("invalid_request", "Invalid Facility filter");
      const state = req.query?.state;
  if (state !== undefined && !["draft", "ready_for_review", "approved", "processing", "paid", "failed", "cancelled"].includes(state)) throw new CanonicalBatchDraftError("invalid_request", "Invalid batch state filter");
      const filters = {
        facilityId: typeof facilityId === "string" ? facilityId.trim() : undefined,
        state: state as CanonicalBatchListFilters["state"],
        page: parsePositive(req.query?.page, 1, 10_000),
        pageSize: parsePositive(req.query?.pageSize ?? req.query?.limit, DEFAULT_BATCH_PAGE_SIZE, MAX_BATCH_PAGE_SIZE),
      };
      const batches = await (dependencies.list || listCanonicalFinancialBatches)(filters);
      const pageItems = batches.slice(0, filters.pageSize);
      return res.json({
        items: pageItems.map(safeBatchProjection),
        pagination: { page: filters.page, pageSize: filters.pageSize, hasMore: batches.length > filters.pageSize, totalScope: "page_window" },
      });
    } catch (error) {
      if (error instanceof CanonicalBatchDraftError) return res.status(400).json({ message: error.message, code: error.code });
      return res.status(503).json({ message: "Canonical financial batch service is unavailable", code: "financial_batch_unavailable" });
    }
  };
}

export function createAdminFinancialBatchDetailHandler(dependencies: FinancialBatchEndpointDependencies) {
  return async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = authorizedActor(await dependencies.getUser(req.user.id));
    if (!actor) return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    try {
      const detail = await (dependencies.detail || getCanonicalFinancialBatchDetail)(req.params?.id);
      if (!detail) return res.status(404).json({ message: "Canonical financial batch not found", code: "canonical_batch_not_found" });
      return res.json({
        batch: safeBatchProjection(detail.batch),
        memberships: detail.memberships.map((membership) => ({ obligationReference: safeReference("obligation", membership.paymentId), frozenDriverIncentiveCents: membership.frozenDriverIncentiveCents, frozenPlatformFeeCents: membership.frozenPlatformFeeCents, frozenFacilityChargeCents: membership.frozenFacilityChargeCents })),
        events: detail.events.map((event) => ({ eventType: event.eventType, createdAt: event.createdAt.toISOString(), reason: event.reason })),
      });
    } catch {
      return res.status(503).json({ message: "Canonical financial batch service is unavailable", code: "financial_batch_unavailable" });
    }
  };
}

export function createAdminFinancialBatchLifecycleHandler(action: CanonicalBatchLifecycleAction, dependencies: FinancialBatchEndpointDependencies) {
  return async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    const actor = authorizedActor(await dependencies.getUser(req.user.id));
    if (!actor) return res.status(403).json({ message: "Platform Operations access required", code: "PLATFORM_OPERATIONS_ACCESS_REQUIRED" });
    try {
      const body = req.body || {};
      const result = await (dependencies.transition || transitionCanonicalFinancialBatch)(action, {
        batchId: req.params?.id,
        expectedState: body.expectedState,
        reason: body.reason,
        approvedCancellationConfirmed: body.approvedCancellationConfirmed === true,
        cancellationCategory: body.cancellationCategory,
      }, actor);
      return res.status(result.transitioned ? 200 : 200).json({
        batch: safeBatchProjection(result.batch), transitioned: result.transitioned, releasedMemberships: result.releasedMemberships,
      });
    } catch (error) {
      if (error instanceof FinancialBatchLifecycleError) {
        const status = error.code === "FINANCIAL_BATCH_NOT_FOUND" ? 404
          : error.code === "FINANCIAL_BATCH_INVALID_REQUEST" ? 400
            : error.code === "FINANCIAL_BATCH_INVALID_STATE" || error.code === "FINANCIAL_BATCH_ALREADY_APPROVED" || error.code === "FINANCIAL_BATCH_ALREADY_CANCELLED" ? 409 : 422;
        return res.status(status).json({ message: error.message, code: error.code });
      }
      console.error("[CANONICAL_FINANCIAL_BATCH_LIFECYCLE_UNAVAILABLE]", { action, actorUserId: actor.actorUserId, category: error instanceof Error ? error.name : "unknown" });
      return res.status(503).json({ message: "Canonical financial batch lifecycle service is unavailable", code: "FINANCIAL_BATCH_UNAVAILABLE" });
    }
  };
}

export function formatCanonicalBatchTotalForAudit(cents: number): string {
  return formatCentsToDollars(cents);
}
