import { sql } from "drizzle-orm";
import type { NotificationService } from "./notificationService";
import type { OwnerLocationAccessState } from "../shared/ownerLocationAccess";

export const OWNER_OPERATIONAL_PENDING_AGE_HOURS = 72;
export const OWNER_OPERATIONAL_PREVIEW_LIMIT = 5;

type Database = {
  execute: (query: any) => any;
};

type QueryResult<T> = { rows?: T[] } | T[];

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as QueryResult<T> & { rows: T[] }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoValue(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function privacySafeDriverName(firstName: unknown, lastName: unknown): string {
  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";
  if (first && last) return `${first} ${last.slice(0, 1).toUpperCase()}.`;
  return first || "—";
}

function materialLabel(row: Record<string, unknown>): string {
  const custom = typeof row.material_custom_label === "string" ? row.material_custom_label.trim() : "";
  const catalog = typeof row.material_display_name === "string" ? row.material_display_name.trim() : "";
  if (custom) return custom;
  if (catalog) return catalog;
  return row.service_type === "rubble_dropoff" ? "Material Recovery" : "Concrete Washout";
}

function evidenceState(row: Record<string, unknown>): "missing" | "failed" | "available" {
  if (numberValue(row.photo_count) === 0) return "missing";
  if (numberValue(row.failed_photo_count) > 0) return "failed";
  return "available";
}

export type OwnerOperationalFacility = {
  id: string;
  name: string;
  isActive: boolean;
  isVisible: boolean;
};

export type OwnerOperationalActivity = {
  id: string;
  driverDisplayName: string;
  material: string;
  facilityId: string;
  facilityName: string;
  submittedAt: string | null;
  status: "pending" | "verified" | "rejected";
  evidence: "missing" | "failed" | "available";
  photoCount: number;
  returnedFromAdministrativeReview: boolean;
  reviewLink: string;
};

export type OwnerOperationalSummary = {
  selection: {
    state: "selected" | "required" | "empty";
    selectedFacilityId: string | null;
    selectedFacilityName: string | null;
    source: "request" | "single" | null;
    facilities: OwnerOperationalFacility[];
  };
  today: null | {
    submitted: number;
    awaitingReview: number;
    verified: number;
    rejected: number;
    activeDrivers: number;
    latestActivityAt: string | null;
    timezone: "UTC";
  };
  attention: null | {
    pendingReviews: number;
    allPendingReviews: number;
    agedPendingReviews: number;
    missingEvidence: number;
    returnedFromAdministrativeReview: number;
    failedEvidence: number;
    unresolvedOperationalNotices: number;
    facilityConfigurationIssues: string[];
    termsAcceptanceRequired: boolean;
    readinessActionRequired: boolean;
  };
  pendingReviews: OwnerOperationalActivity[];
  recentActivity: OwnerOperationalActivity[];
  facilityStatus: null | {
    id: string;
    name: string;
    ownerApproved: boolean;
    active: boolean;
    visible: boolean;
    profileComplete: boolean;
    operatingHoursConfigured: boolean;
    acceptedMaterials: string[];
    operational: boolean;
    issues: string[];
    intelligenceLink: string;
    manageLink: string;
  };
  notifications: {
    unreadCount: number;
    recent: Array<{
      id: string;
      title: string;
      message: string;
      templateKey: string | null;
      category: string;
      priority: string;
      isRead: boolean;
      deepLink: string | null;
      metadata: Record<string, string>;
      createdAt: string | null;
    }>;
    centerLink: "/notifications";
  };
  generatedAt: string;
  dataState: "facility_selection_required" | "no_facilities" | "ready";
};

export class OwnerOperationalDashboardError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "OwnerOperationalDashboardError";
  }
}

async function listFacilities(database: Database, ownerId: string) {
  const result = await database.execute(sql`
    select id, name, is_active, is_visible, operating_hours
    from washout_locations
    where owner_id = ${ownerId}
    order by lower(name), id
  `);
  return rowsOf<Record<string, unknown>>(result);
}

async function loadActivitySummary(database: Database, facilityId: string, start: Date, end: Date) {
  const result = await database.execute(sql`
    select
      count(*) filter (where created_at >= ${start} and created_at < ${end}) as submitted,
      count(*) filter (where status = 'pending') as awaiting_review,
      count(*) filter (where verified_at >= ${start} and verified_at < ${end}) as verified,
      count(*) filter (where rejected_at >= ${start} and rejected_at < ${end}) as rejected,
      count(distinct driver_id) filter (where created_at >= ${start} and created_at < ${end}) as active_drivers,
      max(created_at) as latest_activity_at
    from washout_activities
    where location_id = ${facilityId}
  `);
  return rowsOf<Record<string, unknown>>(result)[0] || {};
}

async function loadAttentionSummary(database: Database, facilityId: string, ownerId: string, agedBefore: Date) {
  const result = await database.execute(sql`
    select
      count(*) filter (where a.status = 'pending') as pending_reviews,
      (
        select count(*)
        from washout_activities owner_activity
        join washout_locations owner_location on owner_location.id = owner_activity.location_id
        where owner_location.owner_id = ${ownerId} and owner_activity.status = 'pending'
      ) as all_pending_reviews,
      count(*) filter (where a.status = 'pending' and a.created_at < ${agedBefore}) as aged_pending_reviews,
      count(*) filter (where a.status = 'pending' and not exists (
        select 1 from washout_photos p where p.activity_id = a.id
      )) as missing_evidence,
      count(*) filter (where a.status = 'pending' and exists (
        select 1 from washout_photos p where p.activity_id = a.id and p.verification_status = 'failed'
      )) as failed_evidence,
      count(*) filter (where a.status = 'pending' and exists (
        select 1 from washout_activity_admin_reviews r
        where r.activity_id = a.id and r.resolution = 'returned_to_owner_review'
      )) as returned_from_admin_review
    from washout_activities a
    where a.location_id = ${facilityId}
  `);
  return rowsOf<Record<string, unknown>>(result)[0] || {};
}

async function loadActivityPreview(database: Database, facilityId: string, pendingOnly: boolean, limit: number) {
  const statusPredicate = pendingOnly ? sql`and a.status = 'pending'` : sql``;
  const result = await database.execute(sql`
    select
      a.id,
      a.location_id,
      l.name as facility_name,
      a.status,
      a.service_type,
      a.material_custom_label,
      m.display_name as material_display_name,
      a.created_at,
      u.first_name,
      u.last_name,
      count(distinct p.id) as photo_count,
      count(distinct p.id) filter (where p.verification_status = 'failed') as failed_photo_count,
      bool_or(r.resolution = 'returned_to_owner_review') as returned_from_admin_review
    from washout_activities a
    join washout_locations l on l.id = a.location_id
    join drivers d on d.id = a.driver_id
    join users u on u.id = d.user_id
    left join materials m on m.slug = a.material_slug
    left join washout_photos p on p.activity_id = a.id
    left join washout_activity_admin_reviews r on r.activity_id = a.id
    where a.location_id = ${facilityId} ${statusPredicate}
    group by a.id, a.location_id, l.name, a.status, a.service_type, a.material_custom_label, m.display_name, a.created_at, u.first_name, u.last_name
    order by a.created_at desc, a.id desc
    limit ${limit}
  `);
  return rowsOf<Record<string, unknown>>(result).slice(0, limit).map((row): OwnerOperationalActivity => {
    const id = String(row.id);
    const locationId = String(row.location_id);
    return {
      id,
      driverDisplayName: privacySafeDriverName(row.first_name, row.last_name),
      material: materialLabel(row),
      facilityId: locationId,
      facilityName: String(row.facility_name || "—"),
      submittedAt: isoValue(row.created_at),
      status: String(row.status) as OwnerOperationalActivity["status"],
      evidence: evidenceState(row),
      photoCount: numberValue(row.photo_count),
      returnedFromAdministrativeReview: row.returned_from_admin_review === true,
      reviewLink: `/dashboard/reviews?facilityId=${encodeURIComponent(locationId)}&activityId=${encodeURIComponent(id)}#activity-${encodeURIComponent(id)}`,
    };
  });
}

async function loadAcceptedMaterials(database: Database, facilityId: string) {
  const result = await database.execute(sql`
    select coalesce(nullif(trim(i.custom_label), ''), nullif(trim(i.material_custom_label), ''), m.display_name) as label
    from location_material_intents i
    left join materials m on m.slug = i.material_slug
    where i.location_id = ${facilityId} and i.active = true
    order by lower(coalesce(nullif(trim(i.custom_label), ''), nullif(trim(i.material_custom_label), ''), m.display_name))
    limit 100
  `);
  return rowsOf<Record<string, unknown>>(result)
    .map((row) => typeof row.label === "string" ? row.label.trim() : "")
    .filter(Boolean);
}

export async function buildOwnerOperationalSummary(input: {
  database: Database;
  notificationService: Pick<NotificationService, "list" | "unreadCount">;
  ownerId: string;
  ownerUserId: string;
  requestedFacilityId?: string | null;
  ownerApproved: boolean;
  accessState: OwnerLocationAccessState;
  termsAcceptanceRequired: boolean;
  now?: Date;
}): Promise<OwnerOperationalSummary> {
  const now = input.now || new Date();
  const facilityRows = await listFacilities(input.database, input.ownerId);
  const facilities = facilityRows.map((row): OwnerOperationalFacility => ({
    id: String(row.id),
    name: String(row.name),
    isActive: row.is_active === true,
    isVisible: row.is_visible === true,
  }));

  let selectedFacilityId: string | null = null;
  let selectionSource: "request" | "single" | null = null;
  if (input.requestedFacilityId) {
    if (!facilities.some((facility) => facility.id === input.requestedFacilityId)) {
      throw new OwnerOperationalDashboardError(403, "This Recovery Facility is not available to the authenticated Owner.");
    }
    selectedFacilityId = input.requestedFacilityId;
    selectionSource = "request";
  } else if (facilities.length === 1) {
    selectedFacilityId = facilities[0].id;
    selectionSource = "single";
  }

  const [unreadCount, notificationPage] = await Promise.all([
    input.notificationService.unreadCount(input.ownerUserId),
    input.notificationService.list(input.ownerUserId, 1, OWNER_OPERATIONAL_PREVIEW_LIMIT),
  ]);
  const notifications = {
    unreadCount,
    recent: notificationPage.items.slice(0, OWNER_OPERATIONAL_PREVIEW_LIMIT).map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      templateKey: item.templateKey,
      category: item.category,
      priority: item.priority,
      isRead: item.isRead,
      deepLink: item.deepLink,
      metadata: item.metadata,
      createdAt: isoValue(item.createdAt),
    })),
    centerLink: "/notifications" as const,
  };

  if (!selectedFacilityId) {
    const empty = facilities.length === 0;
    return {
      selection: {
        state: empty ? "empty" : "required",
        selectedFacilityId: null,
        selectedFacilityName: null,
        source: null,
        facilities,
      },
      today: null,
      attention: null,
      pendingReviews: [],
      recentActivity: [],
      facilityStatus: null,
      notifications,
      generatedAt: now.toISOString(),
      dataState: empty ? "no_facilities" : "facility_selection_required",
    };
  }

  const selectedRow = facilityRows.find((row) => String(row.id) === selectedFacilityId)!;
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const agedBefore = new Date(now.getTime() - OWNER_OPERATIONAL_PENDING_AGE_HOURS * 60 * 60 * 1000);
  const [activitySummary, attentionSummary, pendingReviews, recentActivity, acceptedMaterials] = await Promise.all([
    loadActivitySummary(input.database, selectedFacilityId, startOfToday, endOfToday),
    loadAttentionSummary(input.database, selectedFacilityId, input.ownerId, agedBefore),
    loadActivityPreview(input.database, selectedFacilityId, true, OWNER_OPERATIONAL_PREVIEW_LIMIT),
    loadActivityPreview(input.database, selectedFacilityId, false, OWNER_OPERATIONAL_PREVIEW_LIMIT),
    loadAcceptedMaterials(input.database, selectedFacilityId),
  ]);

  const operatingHours = selectedRow.operating_hours;
  const operatingHoursConfigured = Boolean(
    operatingHours && typeof operatingHours === "object" && Object.keys(operatingHours as object).length > 0,
  );
  const facilityConfigurationIssues: string[] = [];
  if (!input.ownerApproved) facilityConfigurationIssues.push("owner_approval_required");
  if (!input.accessState.profileCompleted) facilityConfigurationIssues.push("owner_profile_incomplete");
  if (selectedRow.is_active !== true) facilityConfigurationIssues.push("facility_inactive");
  if (selectedRow.is_visible !== true) facilityConfigurationIssues.push("facility_hidden");
  if (acceptedMaterials.length === 0) facilityConfigurationIssues.push("accepted_materials_missing");
  if (!operatingHoursConfigured) facilityConfigurationIssues.push("operating_hours_missing");
  if (input.termsAcceptanceRequired) facilityConfigurationIssues.push("terms_acceptance_required");

  const facilityStatus = {
    id: selectedFacilityId,
    name: String(selectedRow.name),
    ownerApproved: input.ownerApproved,
    active: selectedRow.is_active === true,
    visible: selectedRow.is_visible === true,
    profileComplete: input.accessState.profileCompleted,
    operatingHoursConfigured,
    acceptedMaterials,
    operational: facilityConfigurationIssues.length === 0,
    issues: facilityConfigurationIssues,
    intelligenceLink: `/intelligence?facilityId=${encodeURIComponent(selectedFacilityId)}`,
    manageLink: "/locations",
  };

  return {
    selection: {
      state: "selected",
      selectedFacilityId,
      selectedFacilityName: String(selectedRow.name),
      source: selectionSource,
      facilities,
    },
    today: {
      submitted: numberValue(activitySummary.submitted),
      awaitingReview: numberValue(activitySummary.awaiting_review),
      verified: numberValue(activitySummary.verified),
      rejected: numberValue(activitySummary.rejected),
      activeDrivers: numberValue(activitySummary.active_drivers),
      latestActivityAt: isoValue(activitySummary.latest_activity_at),
      timezone: "UTC",
    },
    attention: {
      pendingReviews: numberValue(attentionSummary.pending_reviews),
      allPendingReviews: numberValue(attentionSummary.all_pending_reviews),
      agedPendingReviews: numberValue(attentionSummary.aged_pending_reviews),
      missingEvidence: numberValue(attentionSummary.missing_evidence),
      returnedFromAdministrativeReview: numberValue(attentionSummary.returned_from_admin_review),
      failedEvidence: numberValue(attentionSummary.failed_evidence),
      unresolvedOperationalNotices: unreadCount,
      facilityConfigurationIssues,
      termsAcceptanceRequired: input.termsAcceptanceRequired,
      readinessActionRequired: !input.accessState.canManageLocations,
    },
    pendingReviews,
    recentActivity,
    facilityStatus,
    notifications,
    generatedAt: now.toISOString(),
    dataState: "ready",
  };
}
