import { sql } from "drizzle-orm";

export type AdminPhotoReviewView = "needs_review" | "rejected_by_owner" | "escalated_disputed" | "completed" | "all";
export type AdminPhotoReviewEscalationState = "none" | "open" | "resolved" | "any";

export type AdminPhotoReviewFilter = {
  view: AdminPhotoReviewView;
  photoId?: string;
  driverId?: string;
  facilityId?: string;
  activityStatus?: "pending" | "verified" | "rejected";
  escalationState?: AdminPhotoReviewEscalationState;
  from?: Date;
  to?: Date;
  sort: "newest" | "oldest";
  page: number;
  pageSize: number;
};

export type AdminPhotoReviewItem = {
  photo: {
    id: string;
    activityId: string;
    verificationStatus: "verified" | "warning" | "failed" | "needs_review";
    verificationReason: string | null;
    photoTakenAt: Date | null;
    uploadedAt: Date | null;
    contentType: string | null;
  };
  activity: {
    id: string;
    status: string;
    checkInTime: Date | null;
    submittedAt: Date | null;
    rejectionReason: string | null;
    rejectedAt: Date | null;
  };
  location: { id: string; name: string; city: string | null; state: string | null };
  driver: { id: string | null; displayName: string };
  material: string;
  activeAdminAction: boolean;
  escalationState: "none" | "open" | "resolved";
  administrativeReview: {
    id: string;
    requestedAt: Date | null;
    resolution: string | null;
    decidedAt: Date | null;
    rationale: string | null;
  } | null;
  administrativeReviews: Array<{
    id: string;
    requestedAt: Date | null;
    resolution: string | null;
    decidedAt: Date | null;
    rationale: string | null;
  }>;
  history: Array<{
    id: string;
    previousStatus: string;
    newStatus: string;
    reason: string | null;
    createdAt: Date | null;
  }>;
  activityHistory: Array<{
    id: string;
    previousStatus: string;
    newStatus: string;
    createdAt: Date | null;
  }>;
};

type Database = { execute: (query: any) => any };
type QueryResult<T> = { rows?: T[] } | T[];

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: T[] }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function privacySafeDriverName(firstName: unknown, lastName: unknown): string {
  const first = textValue(firstName) || "Driver";
  const last = textValue(lastName);
  return last ? `${first} ${last.slice(0, 1).toUpperCase()}.` : first;
}

export function isActiveAdminPhotoReview(input: {
  activityStatus: string;
  rejectedBy: string | null;
  photoStatus: string;
  hasOpenAdministrativeReview: boolean;
}): boolean {
  return input.hasOpenAdministrativeReview
    || ((input.activityStatus !== "rejected" || !input.rejectedBy)
      && ["needs_review", "warning"].includes(input.photoStatus));
}

const activeAdminCondition = sql`(
  ((a.status <> 'rejected' or a.rejected_by is null)
    and p.verification_status in ('needs_review', 'warning'))
  or exists (
    select 1 from washout_activity_admin_reviews ar
    where ar.activity_id = a.id and ar.resolution is null
  )
)`;

function viewCondition(view: AdminPhotoReviewView) {
  if (view === "needs_review") return activeAdminCondition;
  if (view === "rejected_by_owner") return sql`a.status = 'rejected' and a.rejected_by is not null`;
  if (view === "escalated_disputed") return sql`exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id
  )`;
  if (view === "completed") return sql`(
    not ${activeAdminCondition}
    and (a.status = 'verified' or p.verification_status in ('verified', 'failed'))
  )`;
  return sql`true`;
}

function filterConditions(filter: AdminPhotoReviewFilter, includeView: boolean) {
  const conditions = includeView ? [viewCondition(filter.view)] : [];
  if (filter.photoId) conditions.push(sql`p.id = ${filter.photoId}`);
  if (filter.driverId) conditions.push(sql`p.driver_id = ${filter.driverId}`);
  if (filter.facilityId) conditions.push(sql`p.location_id = ${filter.facilityId}`);
  if (filter.activityStatus) conditions.push(sql`a.status = ${filter.activityStatus}`);
  if (filter.escalationState === "none") conditions.push(sql`not exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id
  )`);
  if (filter.escalationState === "open") conditions.push(sql`exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id and ar.resolution is null
  )`);
  if (filter.escalationState === "resolved") conditions.push(sql`exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id
  ) and not exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id and ar.resolution is null
  )`);
  if (filter.escalationState === "any") conditions.push(sql`exists (
    select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id
  )`);
  if (filter.from) conditions.push(sql`p.uploaded_at >= ${filter.from}`);
  if (filter.to) {
    const exclusiveEnd = new Date(filter.to.getTime() + 86_400_000);
    conditions.push(sql`p.uploaded_at < ${exclusiveEnd}`);
  }
  return conditions;
}

function predicate(conditions: any[]) {
  return conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
}

function idList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export async function listAdminPhotoReviewRetentionItems(
  database: Database,
  filter: AdminPhotoReviewFilter,
): Promise<{ items: AdminPhotoReviewItem[]; total: number; activeCount: number }> {
  const viewPredicate = predicate(filterConditions(filter, true));
  const activePredicate = predicate([...filterConditions(filter, false), activeAdminCondition]);
  const order = filter.sort === "oldest" ? sql`asc` : sql`desc`;
  const offset = (filter.page - 1) * filter.pageSize;

  const [totalResult, activeResult, pageResult] = await Promise.all([
    database.execute(sql`
      select count(*) as total
      from washout_photos p
      join washout_activities a on a.id = p.activity_id
      where ${viewPredicate}
    `),
    database.execute(sql`
      select count(*) as active_count
      from washout_photos p
      join washout_activities a on a.id = p.activity_id
      where ${activePredicate}
    `),
    database.execute(sql`
      select
        p.id as photo_id,
        p.activity_id,
        p.verification_status,
        p.verification_reason,
        p.photo_taken_at,
        p.uploaded_at,
        p.content_type,
        a.status as activity_status,
        a.check_in_time,
        a.created_at as submitted_at,
        a.rejection_reason,
        a.rejected_at,
        a.rejected_by,
        a.service_type,
        a.material_custom_label,
        m.display_name as material_display_name,
        l.id as facility_id,
        l.name as facility_name,
        l.city as facility_city,
        l.state as facility_state,
        d.id as driver_id,
        u.first_name as driver_first_name,
        u.last_name as driver_last_name,
        exists (
          select 1 from washout_activity_admin_reviews ar where ar.activity_id = a.id
        ) as has_administrative_review,
        exists (
          select 1 from washout_activity_admin_reviews ar
          where ar.activity_id = a.id and ar.resolution is null
        ) as has_open_administrative_review
      from washout_photos p
      join washout_activities a on a.id = p.activity_id
      join washout_locations l on l.id = p.location_id::text
      join drivers d on d.id = p.driver_id::text
      join users u on u.id = d.user_id
      left join materials m on m.slug = a.material_slug
      where ${viewPredicate}
      order by p.uploaded_at ${order}, p.id ${order}
      limit ${filter.pageSize} offset ${offset}
    `),
  ]);

  const pageRows = rowsOf<Record<string, unknown>>(pageResult);
  const photoIds = pageRows.map((row) => String(row.photo_id));
  const activityIds = Array.from(new Set(pageRows.map((row) => String(row.activity_id))));
  const [photoHistoryResult, activityHistoryResult, administrativeReviewResult] = pageRows.length === 0
    ? [[], [], []]
    : await Promise.all([
      database.execute(sql`
        select id, photo_id, previous_verification_status, new_verification_status, reason, created_at
        from washout_photo_review_events
        where photo_id in (${idList(photoIds)})
        order by created_at desc, id desc
      `),
      database.execute(sql`
        select id, activity_id, previous_status, new_status, created_at
        from washout_activity_review_events
        where activity_id in (${idList(activityIds)})
        order by created_at desc, id desc
      `),
      database.execute(sql`
        select id, activity_id, requested_at, resolution, decided_at, admin_rationale
        from washout_activity_admin_reviews
        where activity_id in (${idList(activityIds)})
        order by requested_at desc, id desc
      `),
    ]);

  const photoHistoryRows = rowsOf<Record<string, unknown>>(photoHistoryResult);
  const activityHistoryRows = rowsOf<Record<string, unknown>>(activityHistoryResult);
  const administrativeReviewRows = rowsOf<Record<string, unknown>>(administrativeReviewResult);

  const items = pageRows.map((row): AdminPhotoReviewItem => {
    const photoId = String(row.photo_id);
    const activityId = String(row.activity_id);
    const hasOpenReview = row.has_open_administrative_review === true;
    const hasReview = row.has_administrative_review === true;
    const photoStatus = String(row.verification_status) as AdminPhotoReviewItem["photo"]["verificationStatus"];
    const activityStatus = String(row.activity_status);
    const materialCustom = textValue(row.material_custom_label);
    const materialCatalog = textValue(row.material_display_name);
    const material = materialCustom || materialCatalog || (row.service_type === "rubble_dropoff" ? "Material Recovery" : "Concrete Washout");
    const administrativeReviews = administrativeReviewRows
      .filter((review) => String(review.activity_id) === activityId)
      .map((review) => ({
        id: String(review.id),
        requestedAt: dateValue(review.requested_at),
        resolution: textValue(review.resolution),
        decidedAt: dateValue(review.decided_at),
        rationale: textValue(review.admin_rationale),
      }));
    return {
      photo: {
        id: photoId,
        activityId,
        verificationStatus: photoStatus,
        verificationReason: textValue(row.verification_reason),
        photoTakenAt: dateValue(row.photo_taken_at),
        uploadedAt: dateValue(row.uploaded_at),
        contentType: textValue(row.content_type),
      },
      activity: {
        id: activityId,
        status: activityStatus,
        checkInTime: dateValue(row.check_in_time),
        submittedAt: dateValue(row.submitted_at),
        rejectionReason: textValue(row.rejection_reason),
        rejectedAt: dateValue(row.rejected_at),
      },
      location: {
        id: String(row.facility_id),
        name: String(row.facility_name || "—"),
        city: textValue(row.facility_city),
        state: textValue(row.facility_state),
      },
      driver: {
        id: textValue(row.driver_id),
        displayName: privacySafeDriverName(row.driver_first_name, row.driver_last_name),
      },
      material,
      activeAdminAction: isActiveAdminPhotoReview({
        activityStatus,
        rejectedBy: textValue(row.rejected_by),
        photoStatus,
        hasOpenAdministrativeReview: hasOpenReview,
      }),
      escalationState: hasOpenReview ? "open" : hasReview ? "resolved" : "none",
      administrativeReview: administrativeReviews[0] || null,
      administrativeReviews,
      history: photoHistoryRows
        .filter((event) => String(event.photo_id) === photoId)
        .map((event) => ({
          id: String(event.id),
          previousStatus: String(event.previous_verification_status),
          newStatus: String(event.new_verification_status),
          reason: textValue(event.reason),
          createdAt: dateValue(event.created_at),
        })),
      activityHistory: activityHistoryRows
        .filter((event) => String(event.activity_id) === activityId)
        .map((event) => ({
          id: String(event.id),
          previousStatus: String(event.previous_status),
          newStatus: String(event.new_status),
          createdAt: dateValue(event.created_at),
        })),
    };
  });

  return {
    items,
    total: Number(rowsOf<Record<string, unknown>>(totalResult)[0]?.total || 0),
    activeCount: Number(rowsOf<Record<string, unknown>>(activeResult)[0]?.active_count || 0),
  };
}
