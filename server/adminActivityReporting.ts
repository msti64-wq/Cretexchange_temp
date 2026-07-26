import { sql, type SQL } from "drizzle-orm";

export const ADMIN_ACTIVITY_REPORT_MAX_PAGE_SIZE = 100;
export const ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS = 5_000;

export type AdminActivityReportKind = "driver" | "facility";
export type AdminActivityStatus = "pending" | "verified" | "rejected";
export type AdminActivityDateRange =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "current_month"
  | "previous_month"
  | "current_year"
  | "custom";

export type AdminActivitySort = "verified" | "total" | "most_recent" | "name" | "unique_drivers";
export type SortDirection = "asc" | "desc";

export interface AdminActivityReportQuery {
  kind: AdminActivityReportKind;
  dateRange: AdminActivityDateRange;
  startDate?: string;
  endDate?: string;
  status?: AdminActivityStatus;
  driverQuery?: string;
  facilityQuery?: string;
  ownerQuery?: string;
  page: number;
  pageSize: number;
  sort: AdminActivitySort;
  direction: SortDirection;
}

export interface ResolvedAdminActivityDateRange {
  key: AdminActivityDateRange;
  label: string;
  start: Date;
  end: Date;
  timezoneLabel: "Server local time";
}

export interface AdminActivityReportRow {
  reference: string;
  name: string;
  ownerName?: string;
  totalCount: number;
  verifiedCount: number;
  pendingCount: number;
  rejectedCount: number;
  adminReviewCount: number;
  uniqueDriverCount?: number;
  firstActivityAt: string | null;
  latestActivityAt: string | null;
}

export interface AdminActivityReport {
  reportType: AdminActivityReportKind;
  generatedAt: string;
  dateRange: {
    key: AdminActivityDateRange;
    label: string;
    start: string;
    end: string;
    timezoneLabel: "Server local time";
  };
  filters: Pick<AdminActivityReportQuery, "status" | "driverQuery" | "facilityQuery" | "ownerQuery">;
  summary: {
    totalActivityCount: number;
    verifiedCount: number;
    pendingCount: number;
    rejectedCount: number;
    adminReviewCount: number;
    uniqueActiveDriverCount?: number;
    uniqueFacilityCount?: number;
    averageVerifiedPerActiveDriver?: number;
    averageVerifiedPerFacility?: number;
  };
  rows: AdminActivityReportRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}

export interface AdminActivityQueryExecutor {
  execute(query: SQL): Promise<unknown>;
}

export class AdminActivityReportInputError extends Error {}
export class AdminActivityReportExportLimitError extends Error {}

const DATE_RANGE_LABELS: Record<AdminActivityDateRange, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  current_month: "Current month",
  previous_month: "Previous month",
  current_year: "Current year",
  custom: "Custom range",
};

function stringValue(value: unknown, maximum = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : undefined;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function parseAdminActivityReportQuery(
  input: Record<string, unknown>,
  kind: AdminActivityReportKind,
): AdminActivityReportQuery {
  const rawDateRange = stringValue(input.dateRange) || "last_30_days";
  const supportedDateRanges: AdminActivityDateRange[] = [
    "today",
    "last_7_days",
    "last_30_days",
    "current_month",
    "previous_month",
    "current_year",
    "custom",
  ];
  if (!supportedDateRanges.includes(rawDateRange as AdminActivityDateRange)) {
    throw new AdminActivityReportInputError("Unsupported date range");
  }

  const rawStatus = stringValue(input.status);
  if (rawStatus && !["pending", "verified", "rejected"].includes(rawStatus)) {
    throw new AdminActivityReportInputError("Unsupported activity status");
  }

  const rawSort = stringValue(input.sort) || "verified";
  const supportedSorts: AdminActivitySort[] = kind === "driver"
    ? ["verified", "total", "most_recent", "name"]
    : ["verified", "total", "unique_drivers", "most_recent", "name"];
  if (!supportedSorts.includes(rawSort as AdminActivitySort)) {
    throw new AdminActivityReportInputError("Unsupported sort field");
  }

  const rawDirection = stringValue(input.direction) || "desc";
  if (rawDirection !== "asc" && rawDirection !== "desc") {
    throw new AdminActivityReportInputError("Unsupported sort direction");
  }

  const query: AdminActivityReportQuery = {
    kind,
    dateRange: rawDateRange as AdminActivityDateRange,
    startDate: stringValue(input.startDate, 10),
    endDate: stringValue(input.endDate, 10),
    status: rawStatus as AdminActivityStatus | undefined,
    driverQuery: stringValue(input.driver, 120),
    facilityQuery: stringValue(input.facility, 120),
    ownerQuery: stringValue(input.owner, 120),
    page: positiveInteger(input.page, 1, 10_000),
    pageSize: positiveInteger(input.pageSize, 25, ADMIN_ACTIVITY_REPORT_MAX_PAGE_SIZE),
    sort: rawSort as AdminActivitySort,
    direction: rawDirection,
  };

  if (query.dateRange === "custom" && (!query.startDate || !query.endDate)) {
    throw new AdminActivityReportInputError("Custom date ranges require startDate and endDate");
  }
  return query;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function resolveAdminActivityDateRange(
  query: Pick<AdminActivityReportQuery, "dateRange" | "startDate" | "endDate">,
  now = new Date(),
): ResolvedAdminActivityDateRange {
  const today = startOfLocalDay(now);
  let start: Date;
  let end: Date;

  switch (query.dateRange) {
    case "today":
      start = today;
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      break;
    case "last_7_days":
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      break;
    case "last_30_days":
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      break;
    case "current_month":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      break;
    case "previous_month":
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "current_year":
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear() + 1, 0, 1);
      break;
    case "custom": {
      const customStart = query.startDate ? localDate(query.startDate) : null;
      const customEnd = query.endDate ? localDate(query.endDate) : null;
      if (!customStart || !customEnd || customEnd < customStart) {
        throw new AdminActivityReportInputError("Custom date range is invalid");
      }
      start = customStart;
      end = new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate() + 1);
      break;
    }
    default:
      throw new AdminActivityReportInputError("Unsupported date range");
  }

  return { key: query.dateRange, label: DATE_RANGE_LABELS[query.dateRange], start, end, timezoneLabel: "Server local time" };
}

export function canAccessAdminActivityReports(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampValue(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeReference(value: unknown): string {
  return String(value || "unknown").slice(0, 8).toUpperCase();
}

function reportFilters(query: AdminActivityReportQuery, dateRange: ResolvedAdminActivityDateRange): SQL[] {
  const filters: SQL[] = [
    sql`a.check_in_time >= ${dateRange.start}`,
    sql`a.check_in_time < ${dateRange.end}`,
  ];
  if (query.status) filters.push(sql`a.status = ${query.status}`);
  if (query.driverQuery) {
    const search = `%${query.driverQuery}%`;
    filters.push(sql`(concat_ws(' ', driver_user.first_name, driver_user.last_name) ILIKE ${search} OR d.id ILIKE ${search} OR d.truck_number ILIKE ${search})`);
  }
  if (query.facilityQuery) {
    const search = `%${query.facilityQuery}%`;
    filters.push(sql`(l.name ILIKE ${search} OR l.id ILIKE ${search})`);
  }
  if (query.ownerQuery) {
    const search = `%${query.ownerQuery}%`;
    filters.push(sql`(o.company_name ILIKE ${search} OR concat_ws(' ', owner_user.first_name, owner_user.last_name) ILIKE ${search} OR o.id ILIKE ${search})`);
  }
  return filters;
}

function filteredActivityCte(query: AdminActivityReportQuery, dateRange: ResolvedAdminActivityDateRange): SQL {
  const filters = reportFilters(query, dateRange);
  return sql`
    WITH filtered_activity AS (
      SELECT
        a.id,
        a.driver_id,
        a.location_id,
        a.status,
        a.check_in_time,
        COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', driver_user.first_name, driver_user.last_name)), ''), NULLIF(d.truck_number, ''), a.driver_id) AS driver_display_name,
        l.name AS facility_name,
        COALESCE(NULLIF(o.company_name, ''), NULLIF(BTRIM(CONCAT_WS(' ', owner_user.first_name, owner_user.last_name)), ''), o.id) AS owner_display_name,
        EXISTS (
          SELECT 1
          FROM washout_activity_admin_reviews admin_review
          WHERE admin_review.activity_id = a.id
            AND admin_review.resolution IS NULL
        ) AS has_admin_review
      FROM washout_activities a
      INNER JOIN drivers d ON d.id = a.driver_id
      INNER JOIN users driver_user ON driver_user.id = d.user_id
      INNER JOIN washout_locations l ON l.id = a.location_id
      INNER JOIN owners o ON o.id = l.owner_id
      INNER JOIN users owner_user ON owner_user.id = o.user_id
      WHERE ${sql.join(filters, sql` AND `)}
    )
  `;
}

function sortOrder(kind: AdminActivityReportKind, sort: AdminActivitySort, direction: SortDirection): SQL {
  const directionSql = direction === "asc" ? sql`ASC` : sql`DESC`;
  const expressions: Record<AdminActivitySort, SQL> = {
    verified: sql`verified_count`,
    total: sql`total_count`,
    most_recent: sql`latest_activity_at`,
    name: sql`display_name`,
    unique_drivers: sql`unique_driver_count`,
  };
  const expression = expressions[sort];
  const tieBreaker = kind === "driver" ? sql`driver_id ASC` : sql`location_id ASC`;
  return sql`${expression} ${directionSql} NULLS LAST, display_name ASC, ${tieBreaker}`;
}

function summaryQuery(kind: AdminActivityReportKind, cte: SQL): SQL {
  const grouping = kind === "driver" ? sql`COUNT(DISTINCT driver_id)` : sql`COUNT(DISTINCT location_id)`;
  return sql`${cte}
    SELECT
      COUNT(*)::int AS total_activity_count,
      COUNT(*) FILTER (WHERE status = 'verified')::int AS verified_count,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count,
      COUNT(*) FILTER (WHERE has_admin_review)::int AS admin_review_count,
      ${grouping}::int AS group_count,
      COUNT(DISTINCT driver_id)::int AS unique_driver_count
    FROM filtered_activity`;
}

function rowsQuery(query: AdminActivityReportQuery, cte: SQL): SQL {
  const groupFields = query.kind === "driver"
    ? sql`driver_id, driver_display_name`
    : sql`location_id, facility_name, owner_display_name`;
  const id = query.kind === "driver" ? sql`driver_id` : sql`location_id`;
  const name = query.kind === "driver" ? sql`driver_display_name` : sql`facility_name`;
  const owner = query.kind === "facility" ? sql`MAX(owner_display_name) AS owner_display_name,` : sql``;
  const distinctDrivers = query.kind === "facility" ? sql`COUNT(DISTINCT driver_id)::int AS unique_driver_count,` : sql``;
  const offset = (query.page - 1) * query.pageSize;
  return sql`${cte}
    SELECT
      ${id} AS entity_id,
      ${name} AS display_name,
      ${owner}
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE status = 'verified')::int AS verified_count,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count,
      COUNT(*) FILTER (WHERE has_admin_review)::int AS admin_review_count,
      ${distinctDrivers}
      MIN(check_in_time) AS first_activity_at,
      MAX(check_in_time) AS latest_activity_at,
      COUNT(*) OVER()::int AS total_rows
    FROM filtered_activity
    GROUP BY ${groupFields}
    ORDER BY ${sortOrder(query.kind, query.sort, query.direction)}
    LIMIT ${query.pageSize} OFFSET ${offset}`;
}

export async function buildAdminActivityReport(
  executor: AdminActivityQueryExecutor,
  query: AdminActivityReportQuery,
  now = new Date(),
): Promise<AdminActivityReport> {
  const dateRange = resolveAdminActivityDateRange(query, now);
  const cte = filteredActivityCte(query, dateRange);
  const [summaryResult, rowsResult] = await Promise.all([
    executor.execute(summaryQuery(query.kind, cte)),
    executor.execute(rowsQuery(query, cte)),
  ]);
  const summaryRow = resultRows(summaryResult)[0] || {};
  const databaseRows = resultRows(rowsResult);
  const totalRows = numberValue(databaseRows[0]?.total_rows);
  const groupCount = numberValue(summaryRow.group_count);
  const verifiedCount = numberValue(summaryRow.verified_count);

  return {
    reportType: query.kind,
    generatedAt: new Date().toISOString(),
    dateRange: {
      key: dateRange.key,
      label: dateRange.label,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
      timezoneLabel: dateRange.timezoneLabel,
    },
    filters: {
      status: query.status,
      driverQuery: query.driverQuery,
      facilityQuery: query.facilityQuery,
      ownerQuery: query.ownerQuery,
    },
    summary: {
      totalActivityCount: numberValue(summaryRow.total_activity_count),
      verifiedCount,
      pendingCount: numberValue(summaryRow.pending_count),
      rejectedCount: numberValue(summaryRow.rejected_count),
      adminReviewCount: numberValue(summaryRow.admin_review_count),
      ...(query.kind === "driver"
        ? {
            uniqueActiveDriverCount: groupCount,
            averageVerifiedPerActiveDriver: groupCount ? verifiedCount / groupCount : 0,
          }
        : {
            uniqueFacilityCount: groupCount,
            uniqueActiveDriverCount: numberValue(summaryRow.unique_driver_count),
            averageVerifiedPerFacility: groupCount ? verifiedCount / groupCount : 0,
          }),
    },
    rows: databaseRows.map((row) => ({
      reference: safeReference(row.entity_id),
      name: String(row.display_name || "Unknown"),
      ...(query.kind === "facility" ? { ownerName: String(row.owner_display_name || "Unassigned") } : {}),
      totalCount: numberValue(row.total_count),
      verifiedCount: numberValue(row.verified_count),
      pendingCount: numberValue(row.pending_count),
      rejectedCount: numberValue(row.rejected_count),
      adminReviewCount: numberValue(row.admin_review_count),
      ...(query.kind === "facility" ? { uniqueDriverCount: numberValue(row.unique_driver_count) } : {}),
      firstActivityAt: timestampValue(row.first_activity_at),
      latestActivityAt: timestampValue(row.latest_activity_at),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalRows,
      totalPages: Math.ceil(totalRows / query.pageSize),
    },
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function adminActivityReportToCsv(report: AdminActivityReport): string {
  const metadata = [
    ["Report Type", report.reportType === "driver" ? "Driver Activity" : "Facility Activity"],
    ["Generated At", report.generatedAt],
    ["Date Range", `${report.dateRange.label} (${report.dateRange.timezoneLabel})`],
    ["Range Start", report.dateRange.start],
    ["Range End", report.dateRange.end],
  ];
  const headers = report.reportType === "driver"
    ? ["Driver", "Driver Reference", "Total", "Verified", "Pending", "Rejected", "Administrative Review", "First Activity", "Latest Activity"]
    : ["Facility", "Facility Reference", "Facility Owner", "Total", "Verified", "Pending", "Rejected", "Administrative Review", "Distinct Drivers", "First Activity", "Latest Activity"];
  const rows = report.rows.map((row) => report.reportType === "driver"
    ? [row.name, row.reference, row.totalCount, row.verifiedCount, row.pendingCount, row.rejectedCount, row.adminReviewCount, row.firstActivityAt || "", row.latestActivityAt || ""]
    : [row.name, row.reference, row.ownerName || "", row.totalCount, row.verifiedCount, row.pendingCount, row.rejectedCount, row.adminReviewCount, row.uniqueDriverCount || 0, row.firstActivityAt || "", row.latestActivityAt || ""]);
  return [...metadata, [], headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export async function buildBoundedAdminActivityCsv(
  executor: AdminActivityQueryExecutor,
  query: AdminActivityReportQuery,
): Promise<string> {
  const exportQuery = { ...query, page: 1, pageSize: ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS + 1 };
  const report = await buildAdminActivityReport(executor, exportQuery);
  if (report.pagination.totalRows > ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS) {
    throw new AdminActivityReportExportLimitError(`CSV export is limited to ${ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS.toLocaleString()} report rows. Narrow the filters and try again.`);
  }
  return adminActivityReportToCsv(report);
}
