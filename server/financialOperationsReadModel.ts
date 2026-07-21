import { desc, eq } from "drizzle-orm";
import {
  billingBatches,
  canonicalFinancialPaymentAttempts,
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
import { db } from "./db";
import { CANONICAL_FINANCIAL_BATCH_MODEL_VERSION } from "./financialBatchDrafts";
import { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND } from "./financialObligations";
import { isCurrentFinancialRecord } from "./financialCutoff";
import { createFinancialWorkspaceSelectionToken } from "./financialWorkspaceSelection";

/**
 * The Financial Operations read model is deliberately projection-only.  It is
 * the single owner-centred view of canonical financial data and must never
 * create obligations, memberships, attempts, or audit events while reading.
 */
export type FinancialOperationsOwnerRow = {
  ownerId: string;
  ownerName: string;
  facilityCount: number;
  awaitingFinancialSetup: number;
  readyToBatch: number;
  openBatches: number;
  oldestOutstandingAt: string | null;
  newestApprovalAt: string | null;
  unbatchedFrozenAmountCents: number | null;
  batchedButUnpaidAmountCents: number | null;
  lastConfirmedPaymentStatus: "paid" | "failed" | "processing" | "unavailable";
  attentionRequired: boolean;
  attentionAmountCents: number | null;
  nextAction: "review_approved_washouts" | "create_financial_obligations" | "create_batch" | "review_batch" | "approve_batch" | "resolve_exception" | "no_action_required";
};

export type FinancialOperationsActivityRow = {
  activityReference: string;
  activityId: string;
  driver: string;
  facility: string;
  checkInAt: string | null;
  approvalAt: string | null;
  approvedBy: string | null;
  frozenAmountCents: number | null;
  financialSetupStatus: "awaiting_financial_setup" | "ready_to_batch" | "in_active_batch" | "completed" | "attention_required";
  obligationReference: string | null;
  obligationStatus: string | null;
  batchReference: string | null;
  batchState: string | null;
  paymentStatus: "paid" | "failed" | "processing" | "unavailable";
  attentionRequired: boolean;
  /** Opaque, short-lived server selection token used only for authorized obligation creation. */
  selectionToken: string | null;
};

export type FinancialOperationsBatchRow = {
  batchId: string;
  reference: string;
  ownerId: string;
  ownerName: string;
  state: string;
  periodStart: string | null;
  periodEnd: string | null;
  timezone: string | null;
  obligationCount: number;
  frozenDriverIncentiveCents: number | null;
  frozenPlatformFeeCents: number | null;
  frozenFacilityChargeCents: number | null;
  exceptionCount: number;
  createdAt: string | null;
  createdBy: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  executionStatus: "paid" | "failed" | "processing" | "unavailable";
};

export type FinancialOperationsOverview = {
  summary: {
    ownersRequiringAction: number;
    approvedWashoutsAwaitingFinancialSetup: number;
    obligationsReadyToBatch: number;
    openBatches: number;
    batchedButNotPaidCents: number | null;
    confirmedPaidCents: number | null;
    attentionRequiredCount: number;
    attentionRequiredCents: number | null;
  };
  owners: FinancialOperationsOwnerRow[];
  generatedAt: string;
};

type RawModel = Awaited<ReturnType<typeof loadRawModel>>;
const safeReference = (prefix: string, id: string | null | undefined) => `${prefix}_${id ? id.slice(-8) : "unknown"}`;
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const cents = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const result = Math.round(n * 100);
  return Number.isSafeInteger(result) ? result : null;
};
const sum = (values: Array<number | null>): number | null => values.every((value) => value !== null) ? values.reduce((total, value) => total + (value || 0), 0) : null;
const statusOrder = (status: string) => status === "succeeded" ? 4 : status === "failed" ? 3 : status === "processing" || status === "created" ? 2 : 1;
function paymentStatus(attempts: Array<{ status: string | null }>): FinancialOperationsOwnerRow["lastConfirmedPaymentStatus"] {
  const status = attempts.map((attempt) => attempt.status || "").sort((a, b) => statusOrder(b) - statusOrder(a))[0];
  return status === "succeeded" ? "paid" : status === "failed" ? "failed" : status === "processing" || status === "created" ? "processing" : "unavailable";
}
function ownerDisplay(owner: { companyName: string | null; firstName: string | null; lastName: string | null; id: string }) {
  return owner.companyName?.trim() || [owner.firstName, owner.lastName].filter(Boolean).join(" ") || safeReference("owner", owner.id);
}

async function loadRawModel() {
  const [settings, ownerRows, locationRows, activityRows, obligationRows, membershipRows, batchRows, attemptRows, exceptionRows, eventRows, actorRows] = await Promise.all([
    db.select({ cutoff: systemSettings.financialHistoryCutoffAt }).from(systemSettings).limit(1),
    db.select({ id: owners.id, companyName: owners.companyName, userId: owners.userId, firstName: users.firstName, lastName: users.lastName }).from(owners).leftJoin(users, eq(users.id, owners.userId)),
    db.select({ id: washoutLocations.id, ownerId: washoutLocations.ownerId, name: washoutLocations.name }).from(washoutLocations),
    db.select({ id: washoutActivities.id, driverId: washoutActivities.driverId, locationId: washoutActivities.locationId, status: washoutActivities.status, amount: washoutActivities.amount, checkInTime: washoutActivities.checkInTime, verifiedAt: washoutActivities.verifiedAt, verifiedBy: washoutActivities.verifiedBy, createdAt: washoutActivities.createdAt, driverFirstName: users.firstName, driverLastName: users.lastName })
      .from(washoutActivities).leftJoin(drivers, eq(drivers.id, washoutActivities.driverId)).leftJoin(users, eq(users.id, drivers.userId)),
    db.select({ id: payments.id, ownerId: payments.ownerId, activityId: payments.activityId, amount: payments.amount, processingFee: payments.processingFee, status: payments.status, paidAt: payments.paidAt, createdAt: payments.createdAt }).from(payments).where(eq(payments.obligationKind, CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND)),
    db.select({ id: financialBatchMemberships.id, batchId: financialBatchMemberships.batchId, paymentId: financialBatchMemberships.paymentId, state: financialBatchMemberships.state, frozenDriverIncentiveCents: financialBatchMemberships.frozenDriverIncentiveCents, frozenPlatformFeeCents: financialBatchMemberships.frozenPlatformFeeCents, frozenFacilityChargeCents: financialBatchMemberships.frozenFacilityChargeCents }).from(financialBatchMemberships),
    db.select({ id: billingBatches.id, ownerId: billingBatches.ownerId, reference: billingBatches.canonicalReference, state: billingBatches.canonicalState, periodStart: billingBatches.periodStart, periodEnd: billingBatches.periodEnd, timezone: billingBatches.timezone, count: billingBatches.paymentCount, driverTotal: billingBatches.frozenDriverIncentiveCents, feeTotal: billingBatches.frozenPlatformFeeCents, facilityTotal: billingBatches.frozenFacilityChargeCents, exceptionCount: billingBatches.exceptionCount, createdAt: billingBatches.createdAt, createdBy: billingBatches.canonicalCreatedBy, reviewedAt: billingBatches.reviewedAt, approvedAt: billingBatches.approvedAt }).from(billingBatches).where(eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION)),
    db.select({ id: canonicalFinancialPaymentAttempts.id, batchId: canonicalFinancialPaymentAttempts.batchId, status: canonicalFinancialPaymentAttempts.status, createdAt: canonicalFinancialPaymentAttempts.createdAt }).from(canonicalFinancialPaymentAttempts),
    db.select({ id: financialBatchExceptions.id, batchId: financialBatchExceptions.batchId, paymentId: financialBatchExceptions.paymentId, status: financialBatchExceptions.status, category: financialBatchExceptions.category }).from(financialBatchExceptions),
    db.select({ id: financialBatchAuditEvents.id, batchId: financialBatchAuditEvents.batchId, eventType: financialBatchAuditEvents.eventType, actorId: financialBatchAuditEvents.actorId, actorRole: financialBatchAuditEvents.actorRole, reason: financialBatchAuditEvents.reason, priorState: financialBatchAuditEvents.priorState, newState: financialBatchAuditEvents.newState, createdAt: financialBatchAuditEvents.createdAt }).from(financialBatchAuditEvents).orderBy(desc(financialBatchAuditEvents.createdAt)),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users),
  ]);
  return { cutoff: settings[0]?.cutoff || null, ownerRows, locationRows, activityRows, obligationRows, membershipRows, batchRows, attemptRows, exceptionRows, eventRows, actorRows };
}

/** Pure projection builder; tests use this with in-memory persisted-row fixtures. */
export function buildFinancialOperationsReadModel(raw: RawModel): FinancialOperationsOverview {
  const ownersById = new Map(raw.ownerRows.map((row) => [row.id, row]));
  const locationsById = new Map(raw.locationRows.map((row) => [row.id, row]));
  const actorsById = new Map(raw.actorRows.map((row) => [row.id, [row.firstName, row.lastName].filter(Boolean).join(" ") || safeReference("user", row.id)]));
  const obligationsByActivity = new Map(raw.obligationRows.map((row) => [row.activityId, row]));
  const membershipsByPayment = new Map(raw.membershipRows.filter((row) => row.state === "active").map((row) => [row.paymentId, row]));
  const batchesById = new Map(raw.batchRows.map((row) => [row.id, row]));
  const attemptsByBatch = new Map<string, typeof raw.attemptRows>();
  for (const attempt of raw.attemptRows) attemptsByBatch.set(attempt.batchId, [...(attemptsByBatch.get(attempt.batchId) || []), attempt]);
  const exceptionsByPayment = new Map<string, typeof raw.exceptionRows>();
  const exceptionsByBatch = new Map<string, typeof raw.exceptionRows>();
  for (const exception of raw.exceptionRows.filter((row) => row.status === "open")) {
    if (exception.paymentId) exceptionsByPayment.set(exception.paymentId, [...(exceptionsByPayment.get(exception.paymentId) || []), exception]);
    if (exception.batchId) exceptionsByBatch.set(exception.batchId, [...(exceptionsByBatch.get(exception.batchId) || []), exception]);
  }
  const facilitiesByOwner = new Map<string, typeof raw.locationRows>();
  for (const location of raw.locationRows) facilitiesByOwner.set(location.ownerId, [...(facilitiesByOwner.get(location.ownerId) || []), location]);
  const rows: Array<FinancialOperationsActivityRow & { ownerId: string; verifiedAt: Date | string | null; current: boolean }> = [];
  for (const activity of raw.activityRows) {
    if (activity.status !== "verified") continue;
    const facility = locationsById.get(activity.locationId);
    if (!facility) continue;
    const obligation = obligationsByActivity.get(activity.id);
    const membership = obligation ? membershipsByPayment.get(obligation.id) : undefined;
    const batch = membership ? batchesById.get(membership.batchId) : undefined;
    const isException = Boolean((obligation && exceptionsByPayment.get(obligation.id)?.length) || (batch && exceptionsByBatch.get(batch.id)?.length));
    const confirmed = batch ? paymentStatus(attemptsByBatch.get(batch.id) || []) : "unavailable";
    const current = isCurrentFinancialRecord({ verifiedAt: activity.verifiedAt, createdAt: activity.createdAt }, raw.cutoff);
    const completed = confirmed === "paid";
    const setup = isException ? "attention_required" : completed ? "completed" : batch ? "in_active_batch" : obligation ? "ready_to_batch" : "awaiting_financial_setup";
    rows.push({
      ownerId: facility.ownerId,
      activityReference: safeReference("activity", activity.id), activityId: activity.id,
      driver: [activity.driverFirstName, activity.driverLastName].filter(Boolean).join(" ") || safeReference("driver", activity.driverId),
      facility: facility.name, checkInAt: iso(activity.checkInTime), approvalAt: iso(activity.verifiedAt), approvedBy: activity.verifiedBy ? actorsById.get(activity.verifiedBy) || safeReference("user", activity.verifiedBy) : null,
      frozenAmountCents: obligation ? cents(obligation.amount) : cents(activity.amount), financialSetupStatus: setup,
      obligationReference: obligation ? safeReference("obligation", obligation.id) : null, obligationStatus: obligation?.status || null,
      batchReference: batch?.reference || null, batchState: batch?.state || null, paymentStatus: confirmed, attentionRequired: isException,
      selectionToken: !obligation && current ? createFinancialWorkspaceSelectionToken(activity.id) : null,
      verifiedAt: activity.verifiedAt, current,
    });
  }
  const owners = raw.ownerRows.map((owner) => {
    const ownerRows = rows.filter((row) => row.ownerId === owner.id);
    const currentRows = ownerRows.filter((row) => row.current);
    const awaiting = currentRows.filter((row) => row.financialSetupStatus === "awaiting_financial_setup");
    const ready = currentRows.filter((row) => row.financialSetupStatus === "ready_to_batch");
    const active = currentRows.filter((row) => row.financialSetupStatus === "in_active_batch");
    const attention = currentRows.filter((row) => row.attentionRequired);
    const openBatches = raw.batchRows.filter((batch) => batch.ownerId === owner.id && !["paid", "failed", "cancelled"].includes(batch.state || "")).length;
    const ownerBatches = raw.batchRows.filter((batch) => batch.ownerId === owner.id);
    const lastStatus = paymentStatus(ownerBatches.flatMap((batch) => attemptsByBatch.get(batch.id) || []));
    const oldest = [...awaiting, ...ready].map((row) => row.approvalAt).filter((value): value is string => Boolean(value)).sort()[0] || null;
    const newest = ownerRows.map((row) => row.approvalAt).filter((value): value is string => Boolean(value)).sort().at(-1) || null;
    const nextAction: FinancialOperationsOwnerRow["nextAction"] = attention.length ? "resolve_exception" : awaiting.length ? "create_financial_obligations" : ready.length ? "create_batch" : ownerBatches.some((batch) => batch.state === "draft") ? "review_batch" : ownerBatches.some((batch) => batch.state === "ready_for_review") ? "approve_batch" : "no_action_required";
    const batchedButUnpaid = ownerBatches.filter((batch) => paymentStatus(attemptsByBatch.get(batch.id) || []) !== "paid" && !["cancelled", "failed"].includes(batch.state || ""));
    return { ownerId: owner.id, ownerName: ownerDisplay(owner), facilityCount: (facilitiesByOwner.get(owner.id) || []).length, awaitingFinancialSetup: awaiting.length, readyToBatch: ready.length, openBatches, oldestOutstandingAt: oldest, newestApprovalAt: newest, unbatchedFrozenAmountCents: sum(ready.map((row) => row.frozenAmountCents)), batchedButUnpaidAmountCents: sum(batchedButUnpaid.map((batch) => batch.facilityTotal)), lastConfirmedPaymentStatus: lastStatus, attentionRequired: attention.length > 0, attentionAmountCents: sum(attention.map((row) => row.frozenAmountCents)), nextAction };
  }).filter((row) => row.facilityCount > 0).sort((a, b) => Number(b.attentionRequired) - Number(a.attentionRequired) || (b.awaitingFinancialSetup + b.readyToBatch) - (a.awaitingFinancialSetup + a.readyToBatch) || a.ownerName.localeCompare(b.ownerName));
  const currentRows = rows.filter((row) => row.current);
  const canonicalBatches = raw.batchRows;
  const paidBatches = canonicalBatches.filter((batch) => paymentStatus(attemptsByBatch.get(batch.id) || []) === "paid");
  const outstandingBatches = canonicalBatches.filter((batch) => paymentStatus(attemptsByBatch.get(batch.id) || []) !== "paid" && !["cancelled", "failed"].includes(batch.state || ""));
  const openExceptions = raw.exceptionRows.filter((row) => row.status === "open");
  return { summary: { ownersRequiringAction: owners.filter((owner) => owner.nextAction !== "no_action_required").length, approvedWashoutsAwaitingFinancialSetup: currentRows.filter((row) => row.financialSetupStatus === "awaiting_financial_setup").length, obligationsReadyToBatch: currentRows.filter((row) => row.financialSetupStatus === "ready_to_batch").length, openBatches: canonicalBatches.filter((batch) => !["paid", "failed", "cancelled"].includes(batch.state || "")).length, batchedButNotPaidCents: sum(outstandingBatches.map((batch) => batch.facilityTotal)), confirmedPaidCents: sum(paidBatches.map((batch) => batch.facilityTotal)), attentionRequiredCount: openExceptions.length, attentionRequiredCents: sum(rows.filter((row) => row.attentionRequired).map((row) => row.frozenAmountCents)) }, owners, generatedAt: new Date().toISOString() };
}

export async function getFinancialOperationsOverview() { return buildFinancialOperationsReadModel(await loadRawModel()); }
export async function getFinancialOperationsOwner(ownerId: string) {
  const raw = await loadRawModel(); const overview = buildFinancialOperationsReadModel(raw); const owner = overview.owners.find((row) => row.ownerId === ownerId);
  if (!owner) return null;
  const ownerActivities = raw.activityRows.filter((activity) => raw.locationRows.find((location) => location.id === activity.locationId)?.ownerId === ownerId && activity.status === "verified");
  const projection = buildFinancialOperationsReadModel(raw);
  const byActivity = new Map<string, FinancialOperationsActivityRow>();
  // Rebuild a compact owner detail from the same persisted data without exposing provider identifiers.
  for (const activity of ownerActivities) {
    const location = raw.locationRows.find((item) => item.id === activity.locationId)!;
    const obligation = raw.obligationRows.find((item) => item.activityId === activity.id);
    const membership = obligation ? raw.membershipRows.find((item) => item.paymentId === obligation.id && item.state === "active") : undefined;
    const batch = membership ? raw.batchRows.find((item) => item.id === membership.batchId) : undefined;
    const attempts = batch ? raw.attemptRows.filter((item) => item.batchId === batch.id) : [];
    const exception = Boolean((obligation && raw.exceptionRows.some((item) => item.paymentId === obligation.id && item.status === "open")) || (batch && raw.exceptionRows.some((item) => item.batchId === batch.id && item.status === "open")));
    const status = paymentStatus(attempts);
    byActivity.set(activity.id, { activityReference: safeReference("activity", activity.id), activityId: activity.id, driver: [activity.driverFirstName, activity.driverLastName].filter(Boolean).join(" ") || safeReference("driver", activity.driverId), facility: location.name, checkInAt: iso(activity.checkInTime), approvalAt: iso(activity.verifiedAt), approvedBy: activity.verifiedBy ? raw.actorRows.find((user) => user.id === activity.verifiedBy) ? ([raw.actorRows.find((user) => user.id === activity.verifiedBy)?.firstName, raw.actorRows.find((user) => user.id === activity.verifiedBy)?.lastName].filter(Boolean).join(" ") || safeReference("user", activity.verifiedBy)) : safeReference("user", activity.verifiedBy) : null, frozenAmountCents: obligation ? cents(obligation.amount) : cents(activity.amount), financialSetupStatus: exception ? "attention_required" : status === "paid" ? "completed" : batch ? "in_active_batch" : obligation ? "ready_to_batch" : "awaiting_financial_setup", obligationReference: obligation ? safeReference("obligation", obligation.id) : null, obligationStatus: obligation?.status || null, batchReference: batch?.reference || null, batchState: batch?.state || null, paymentStatus: status, attentionRequired: exception, selectionToken: !obligation && isCurrentFinancialRecord({ verifiedAt: activity.verifiedAt, createdAt: activity.createdAt }, raw.cutoff) ? createFinancialWorkspaceSelectionToken(activity.id) : null });
  }
  const batches = raw.batchRows.filter((batch) => batch.ownerId === ownerId).map((batch) => projectBatch(batch, raw));
  const ownerBatchIds = new Set(batches.map((batch) => batch.batchId));
  const activityValues = Array.from(byActivity.values());
  return { owner, activities: activityValues.sort((a, b) => (b.approvalAt || "").localeCompare(a.approvalAt || "")), obligations: activityValues.filter((item) => item.obligationReference), batches, audit: raw.eventRows.filter((event) => ownerBatchIds.has(event.batchId)).map((event) => ({ eventType: event.eventType, state: event.newState, actor: event.actorId ? raw.actorRows.find((user) => user.id === event.actorId) ? ([raw.actorRows.find((user) => user.id === event.actorId)?.firstName, raw.actorRows.find((user) => user.id === event.actorId)?.lastName].filter(Boolean).join(" ") || safeReference("user", event.actorId)) : safeReference("user", event.actorId) : null, reason: event.reason, createdAt: iso(event.createdAt) })), generatedAt: projection.generatedAt };
}
function projectBatch(batch: RawModel["batchRows"][number], raw: RawModel): FinancialOperationsBatchRow {
  const owner = raw.ownerRows.find((item) => item.id === batch.ownerId); const attempts = raw.attemptRows.filter((item) => item.batchId === batch.id);
  return { batchId: batch.id, reference: batch.reference || safeReference("batch", batch.id), ownerId: batch.ownerId, ownerName: owner ? ownerDisplay(owner) : safeReference("owner", batch.ownerId), state: batch.state || "unknown", periodStart: iso(batch.periodStart), periodEnd: iso(batch.periodEnd), timezone: batch.timezone || null, obligationCount: batch.count || 0, frozenDriverIncentiveCents: batch.driverTotal, frozenPlatformFeeCents: batch.feeTotal, frozenFacilityChargeCents: batch.facilityTotal, exceptionCount: batch.exceptionCount || raw.exceptionRows.filter((item) => item.batchId === batch.id && item.status === "open").length, createdAt: iso(batch.createdAt), createdBy: batch.createdBy ? raw.actorRows.find((user) => user.id === batch.createdBy) ? ([raw.actorRows.find((user) => user.id === batch.createdBy)?.firstName, raw.actorRows.find((user) => user.id === batch.createdBy)?.lastName].filter(Boolean).join(" ") || safeReference("user", batch.createdBy)) : safeReference("user", batch.createdBy) : null, reviewedAt: iso(batch.reviewedAt), approvedAt: iso(batch.approvedAt), executionStatus: paymentStatus(attempts) };
}
export async function getFinancialOperationsBatch(batchId: string) {
  const raw = await loadRawModel(); const batch = raw.batchRows.find((item) => item.id === batchId); if (!batch) return null;
  const batchProjection = projectBatch(batch, raw); const memberships = raw.membershipRows.filter((membership) => membership.batchId === batchId).map((membership) => {
    const obligation = raw.obligationRows.find((item) => item.id === membership.paymentId); const activity = obligation ? raw.activityRows.find((item) => item.id === obligation.activityId) : undefined; const location = activity ? raw.locationRows.find((item) => item.id === activity.locationId) : undefined;
    return { obligationReference: safeReference("obligation", membership.paymentId), activityReference: activity ? safeReference("activity", activity.id) : null, driver: activity ? [activity.driverFirstName, activity.driverLastName].filter(Boolean).join(" ") || safeReference("driver", activity.driverId) : null, facility: location?.name || null, checkInAt: activity ? iso(activity.checkInTime) : null, approvalAt: activity ? iso(activity.verifiedAt) : null, approvedBy: activity?.verifiedBy ? safeReference("user", activity.verifiedBy) : null, membershipState: membership.state, frozenDriverIncentiveCents: membership.frozenDriverIncentiveCents, frozenPlatformFeeCents: membership.frozenPlatformFeeCents, frozenFacilityChargeCents: membership.frozenFacilityChargeCents };
  });
  return { batch: batchProjection, memberships, audit: raw.eventRows.filter((event) => event.batchId === batchId).map((event) => ({ eventType: event.eventType, state: event.newState, actor: event.actorId ? safeReference("user", event.actorId) : null, reason: event.reason, createdAt: iso(event.createdAt) })), exceptions: raw.exceptionRows.filter((exception) => exception.batchId === batchId && exception.status === "open").map((exception) => ({ category: exception.category, reference: safeReference("exception", exception.id) })), generatedAt: new Date().toISOString() };
}
export async function searchFinancialOperationsAudit(filters: { ownerId?: string; batchId?: string; status?: string; from?: string; through?: string }) {
  const raw = await loadRawModel(); const allowedBatches = raw.batchRows.filter((batch) => (!filters.ownerId || batch.ownerId === filters.ownerId) && (!filters.batchId || batch.id === filters.batchId) && (!filters.status || batch.state === filters.status));
  const ids = new Set(allowedBatches.map((batch) => batch.id)); const from = filters.from ? new Date(filters.from) : null; const through = filters.through ? new Date(filters.through) : null;
  return { items: raw.eventRows.filter((event) => ids.has(event.batchId)).filter((event) => (!from || new Date(event.createdAt) >= from) && (!through || new Date(event.createdAt) <= through)).map((event) => ({ batchReference: projectBatch(raw.batchRows.find((batch) => batch.id === event.batchId)!, raw).reference, eventType: event.eventType, lifecycleStatus: event.newState, actor: event.actorId ? safeReference("user", event.actorId) : null, reason: event.reason, createdAt: iso(event.createdAt) })), generatedAt: new Date().toISOString() };
}
