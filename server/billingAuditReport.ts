import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BillingBatch, Driver, Owner, Payment, User, WashoutActivity, WashoutLocation, WashoutPhoto } from "../shared/schema";
import { formatAddress } from "../shared/addressUtils";
import { resolveReportDateRange } from "../shared/reportFilters";
import {
  type BillingAuditItem,
  type BillingAuditReportResponse,
  type BillingAuditReportSummary,
  type BillingAuditRun,
  type BillingAuditRunStatus,
  type BillingAuditRunType,
  type BillingAuditStatusFilter,
  type BillingAuditReportQueryInput,
} from "../shared/billingAuditReport";

type PaymentRow = Payment & {
  driver: Driver & { user: User };
  owner: Owner & { user: User };
  activity: WashoutActivity & { location: WashoutLocation };
};

type ActivityRow = WashoutActivity & {
  location: WashoutLocation;
  driver: Driver & { user: User };
};

type BillingBatchRow = BillingBatch & {
  owner: Owner & { user: User };
};

export interface BillingAuditStorage {
  getAllPayments(startDate?: Date, endDate?: Date): Promise<PaymentRow[]>;
  getAllActivities(startDate?: Date, endDate?: Date): Promise<ActivityRow[]>;
  getBillingBatches(startDate?: Date, endDate?: Date): Promise<BillingBatchRow[]>;
  getPhotosByActivity(activityId: string): Promise<WashoutPhoto[]>;
}

function toCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const parsed = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function toMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toDollarString(amount: number): string {
  return amount.toFixed(2);
}

function formatDateTime(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatPersonName(person?: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!person) return "";
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

function normalizePaymentStatus(payment: Payment): BillingAuditStatusFilter {
  const status = String(payment.status || "").toLowerCase();
  if (payment.refundedAt || payment.refundAmount || status === "refunded" || status === "refund") return "refunded";
  if (status === "disputed") return "disputed";
  if (status === "failed" || status === "canceled" || status === "cancelled") return "failed";
  if (status === "paid" || status === "posted" || status === "completed" || status === "succeeded") return "paid";
  return "pending";
}

function normalizeRunStatus(
  batch: BillingBatchRow | undefined,
  paymentStatuses: BillingAuditStatusFilter[],
): BillingAuditRunStatus {
  if (batch?.status === "failed") return "failed";
  if (paymentStatuses.includes("disputed")) return "disputed";
  if (paymentStatuses.includes("refunded")) return "refunded";
  if (paymentStatuses.includes("failed")) return "failed";
  if (paymentStatuses.includes("pending")) return "pending";
  if (batch?.status === "processing") return "processing";
  if (batch?.status === "completed") return "paid";
  return "paid";
}

function normalizePhotoReviewStatus(photos: WashoutPhoto[], legacyPhotoUrls: string[] | null | undefined): string {
  if (photos.length === 0 && (!legacyPhotoUrls || legacyPhotoUrls.length === 0)) {
    return "none";
  }

  const statuses = photos.map((photo) => String(photo.verificationStatus || "").toLowerCase());
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("needs_review")) return "needs_review";
  if (statuses.length > 0 && statuses.every((status) => status === "verified")) return "verified";
  if (legacyPhotoUrls && legacyPhotoUrls.length > 0 && photos.length === 0) {
    return "legacy";
  }
  return statuses[0] || "unknown";
}

function matchesStatusFilter(row: BillingAuditItem, statusFilter?: BillingAuditStatusFilter | string | null): boolean {
  if (!statusFilter || statusFilter === "all") return true;
  return row.paymentStatus === statusFilter || row.billingRunStatus === statusFilter;
}

function buildLegacyBillingRunId(ownerId: string): string {
  return `legacy/unlinked:${ownerId}`;
}

function buildBillingRunLabel(batch: BillingBatchRow | undefined, legacy: boolean): string {
  if (legacy) return "Legacy / Unlinked";
  if (!batch) return "Billing Run";
  return `Billing Batch ${batch.businessDate}`;
}

function buildBillingRunPeriod(rows: BillingAuditItem[]): { start: string; end: string } {
  const sorted = rows
    .map((row) => new Date(row.checkInTime))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) {
    return { start: "", end: "" };
  }
  return { start: sorted[0].toISOString(), end: sorted[sorted.length - 1].toISOString() };
}

function buildCounts<T extends string>(values: T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function buildSummary(rows: BillingAuditItem[], runs: BillingAuditRun[]): BillingAuditReportSummary {
  const summary = rows.reduce(
    (acc, row) => {
      const amount = Number.parseFloat(row.amountCharged || "0");
      const platformFee = Number.parseFloat(row.platformFeeTotal || "0");
      const driverTip = Number.parseFloat(row.driverIncentiveTip || "0");
      acc.totalWashouts += 1;
      acc.totalAmountCharged += amount;
      acc.totalPlatformFeeTotal += platformFee;
      acc.totalDriverTips += driverTip;
      if (row.paymentStatus === "paid") acc.totalPaid += amount;
      if (row.paymentStatus === "pending") acc.totalPending += amount;
      if (row.paymentStatus === "failed") acc.totalFailed += amount;
      if (row.paymentStatus === "refunded") acc.totalRefunded += amount;
      if (row.paymentStatus === "disputed") acc.totalDisputed += amount;
      if (row.legacyUnlinked) acc.totalLegacyUnlinked += 1;
      return acc;
    },
    {
      totalRuns: runs.length,
      totalWashouts: 0,
      totalAmountCharged: 0,
      totalPlatformFeeTotal: 0,
      totalDriverTips: 0,
      totalPaid: 0,
      totalPending: 0,
      totalFailed: 0,
      totalRefunded: 0,
      totalDisputed: 0,
      totalLegacyUnlinked: 0,
    }
  );

  return {
    totalRuns: summary.totalRuns,
    totalWashouts: summary.totalWashouts,
    totalAmountCharged: toDollarString(summary.totalAmountCharged),
    totalPlatformFeeTotal: toDollarString(summary.totalPlatformFeeTotal),
    totalDriverTips: toDollarString(summary.totalDriverTips),
    totalPaid: toDollarString(summary.totalPaid),
    totalPending: toDollarString(summary.totalPending),
    totalFailed: toDollarString(summary.totalFailed),
    totalRefunded: toDollarString(summary.totalRefunded),
    totalDisputed: toDollarString(summary.totalDisputed),
    totalLegacyUnlinked: summary.totalLegacyUnlinked,
  };
}

export async function buildBillingAuditReport(
  storage: BillingAuditStorage,
  query: BillingAuditReportQueryInput,
): Promise<BillingAuditReportResponse> {
  const dateRange = resolveReportDateRange(query.dateRange, query.startDate, query.endDate);
  const payments = await storage.getAllPayments(dateRange.startDate, dateRange.endDate);
  const activities = await storage.getAllActivities(dateRange.startDate, dateRange.endDate);
  const batches = await storage.getBillingBatches(dateRange.startDate, dateRange.endDate);

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));

  const interimRows: Array<BillingAuditItem & {
    _paymentStatus: BillingAuditStatusFilter;
    _amountChargedCents: number;
    _platformFeeCents: number;
    _paymentCreatedAtDate: Date;
    _paymentPaidAtDate?: Date | null;
    _paymentFailedAtDate?: Date | null;
    _paymentRefundedAtDate?: Date | null;
    _checkInDate: Date;
    _groupKey: string;
    _batch: BillingBatchRow | undefined;
    _activity: ActivityRow;
    _payment: PaymentRow;
  }> = [];

  for (const payment of payments) {
    const activity = activityById.get(payment.activityId);
    if (!activity) continue;

    const batch = payment.batchId ? batchById.get(payment.batchId) : undefined;
    const paymentStatus = normalizePaymentStatus(payment);
    const groupKey = batch?.id || buildLegacyBillingRunId(payment.ownerId);
    const driverIncentiveTipCents = Number(payment.tipAmountCents || 0);
    const amountChargedCents = toCents(payment.amount) + toCents(payment.processingFee) + driverIncentiveTipCents;
    const platformFeeCents = toCents(payment.processingFee);
    const paymentCreatedAtDate = new Date(payment.createdAt as unknown as string | number | Date);
    const paymentPaidAtDate = payment.paidAt ? new Date(payment.paidAt as unknown as string | number | Date) : null;
    const paymentFailedAtDate = payment.status === "failed" ? new Date(payment.updatedAt as unknown as string | number | Date) : null;
    const paymentRefundedAtDate = payment.refundedAt ? new Date(payment.refundedAt as unknown as string | number | Date) : null;
    const checkInDate = new Date(activity.checkInTime as unknown as string | number | Date);

    interimRows.push({
      billingRunId: groupKey,
      billingRunLabel: buildBillingRunLabel(batch, !batch),
      billingRunType: batch ? "billing_batch" : "legacy_unlinked",
      billingRunStatus: normalizeRunStatus(batch, [paymentStatus]),
      billingBatchId: batch?.id || null,
      billingPeriodStart: "",
      billingPeriodEnd: "",
      billingRunCreatedAt: formatDateTime(batch?.createdAt || payment.createdAt),
      billingRunPaidAt: formatDateTime(batch?.completedAt || payment.paidAt),
      billingRunFailedAt: formatDateTime(
        batch?.status === "failed" ? batch.updatedAt : paymentFailedAtDate || payment.refundedAt || batch?.updatedAt || null,
      ),
      stripePaymentIntentId: payment.stripePaymentIntentId || batch?.stripePaymentIntentId || "",
      stripeChargeId: payment.stripeChargeId || "",
      stripeBatchTransferId: batch?.stripeBatchTransferId || "",
      ownerId: payment.ownerId,
      ownerDisplayName: formatPersonName(payment.owner.user),
      ownerCompanyName: payment.owner.companyName || "",
      ownerCustomerId: payment.owner.stripeCustomerId || payment.owner.user.stripeCustomerId || "",
      driverId: payment.driverId,
      driverDisplayName: formatPersonName(payment.driver.user),
      truckNumber: payment.driver.truckNumber || "",
      locationId: activity.locationId,
      locationName: activity.location?.name || "",
      locationAddress: formatAddress({
        street: activity.location?.street,
        city: activity.location?.city,
        state: activity.location?.state,
        zip: activity.location?.zip,
      }),
      washoutId: activity.id,
      washoutStatus: activity.status,
      verificationStatus: activity.status,
      checkInTime: formatDateTime(activity.checkInTime),
      amountCharged: toMoney(amountChargedCents),
      platformFeeTotal: toMoney(platformFeeCents),
      driverIncentiveTip: toMoney(driverIncentiveTipCents),
      paymentStatus,
      paymentId: payment.id,
      paymentCreatedAt: formatDateTime(paymentCreatedAtDate),
      paymentPaidAt: formatDateTime(paymentPaidAtDate),
      paymentFailedAt: formatDateTime(paymentFailedAtDate),
      paymentRefundedAt: formatDateTime(paymentRefundedAtDate),
      notes: [activity.notes, payment.deferReason, payment.refundReason].filter(Boolean).join(" | "),
      photoCount: 0,
      photoReviewStatus: "unknown",
      legacyUnlinked: !batch,
      _paymentStatus: paymentStatus,
      _amountChargedCents: amountChargedCents,
      _platformFeeCents: platformFeeCents,
      _paymentCreatedAtDate: paymentCreatedAtDate,
      _paymentPaidAtDate: paymentPaidAtDate,
      _paymentFailedAtDate: paymentFailedAtDate,
      _paymentRefundedAtDate: paymentRefundedAtDate,
      _checkInDate: checkInDate,
      _groupKey: groupKey,
      _batch: batch,
      _activity: activity,
      _payment: payment,
    });
  }

  const filteredInterimRows = interimRows.filter((row) => {
    if (query.ownerId && row.ownerId !== query.ownerId) return false;
    if (query.locationId && row.locationId !== query.locationId) return false;
    if (query.driverId && row.driverId !== query.driverId) return false;
    if (query.billingRunId && row.billingRunId !== query.billingRunId && row.billingBatchId !== query.billingRunId) return false;
    if (query.stripeTransactionId) {
      const needle = query.stripeTransactionId.trim().toLowerCase();
      if (
        ![
          row.billingRunId,
          row.billingBatchId || "",
          row.stripePaymentIntentId,
          row.stripeChargeId,
          row.stripeBatchTransferId,
          row.paymentId,
        ].some((value) => String(value || "").toLowerCase().includes(needle))
      ) {
        return false;
      }
    }
    if (query.status && !matchesStatusFilter(row, query.status as BillingAuditStatusFilter)) return false;
    return true;
  });

  const uniqueActivityIds = Array.from(new Set(filteredInterimRows.map((row) => row.washoutId)));
  const photoEntries = await Promise.all(
    uniqueActivityIds.map(async (activityId) => [activityId, await storage.getPhotosByActivity(activityId)] as const)
  );
  const photosByActivityId = new Map(photoEntries);

  const finalizedRows: BillingAuditItem[] = filteredInterimRows.map((row) => {
    const photos = photosByActivityId.get(row.washoutId) || [];
    const photoCount = photos.length || (row._activity.photoUrls?.length || 0);
    const photoReviewStatus = normalizePhotoReviewStatus(photos, row._activity.photoUrls);
    return {
      billingRunId: row.billingRunId,
      billingRunLabel: row.billingRunLabel,
      billingRunType: row.billingRunType,
      billingRunStatus: row.billingRunStatus,
      billingBatchId: row.billingBatchId,
      billingPeriodStart: row.billingPeriodStart,
      billingPeriodEnd: row.billingPeriodEnd,
      billingRunCreatedAt: row.billingRunCreatedAt,
      billingRunPaidAt: row.billingRunPaidAt,
      billingRunFailedAt: row.billingRunFailedAt,
      stripePaymentIntentId: row.stripePaymentIntentId,
      stripeChargeId: row.stripeChargeId,
      stripeBatchTransferId: row.stripeBatchTransferId,
      ownerId: row.ownerId,
      ownerDisplayName: row.ownerDisplayName,
      ownerCompanyName: row.ownerCompanyName,
      ownerCustomerId: row.ownerCustomerId,
      driverId: row.driverId,
      driverDisplayName: row.driverDisplayName,
      truckNumber: row.truckNumber,
      locationId: row.locationId,
      locationName: row.locationName,
      locationAddress: row.locationAddress,
      washoutId: row.washoutId,
      washoutStatus: row.washoutStatus,
      verificationStatus: row.verificationStatus,
      checkInTime: row.checkInTime,
      amountCharged: row.amountCharged,
      platformFeeTotal: row.platformFeeTotal,
      driverIncentiveTip: row.driverIncentiveTip,
      paymentStatus: row.paymentStatus,
      paymentId: row.paymentId,
      paymentCreatedAt: row.paymentCreatedAt,
      paymentPaidAt: row.paymentPaidAt,
      paymentFailedAt: row.paymentFailedAt,
      paymentRefundedAt: row.paymentRefundedAt,
      notes: row.notes,
      photoCount,
      photoReviewStatus,
      legacyUnlinked: row.legacyUnlinked,
    };
  });

  const grouped = new Map<string, BillingAuditItem[]>();
  for (const row of finalizedRows) {
    if (!grouped.has(row.billingRunId)) {
      grouped.set(row.billingRunId, []);
    }
    grouped.get(row.billingRunId)!.push(row);
  }

  const runs: BillingAuditRun[] = Array.from(grouped.entries()).map(([billingRunId, items]) => {
    const sample = items[0];
    const batch = sample.billingBatchId ? batchById.get(sample.billingBatchId) : undefined;
    const paymentStatuses = items.map((item) => item.paymentStatus as BillingAuditStatusFilter);
    const runStatus = normalizeRunStatus(batch, paymentStatuses);
    const period = buildBillingRunPeriod(items);
    const driverCounts = buildCounts(items.map((item) => item.driverId));
    const locationCounts = buildCounts(items.map((item) => item.locationId));
    const locationsVisited = Array.from(new Set(items.map((item) => item.locationName).filter(Boolean))).sort();
    const totalAmountCharged = items.reduce((sum, item) => sum + Number.parseFloat(item.amountCharged || "0"), 0);
    const totalPlatformFeeTotal = items.reduce((sum, item) => sum + Number.parseFloat(item.platformFeeTotal || "0"), 0);
    const totalDriverTips = items.reduce((sum, item) => sum + Number.parseFloat(item.driverIncentiveTip || "0"), 0);

    const billingRunCreatedAt = batch?.createdAt ? formatDateTime(batch.createdAt) : items.reduce((earliest, item) => (earliest && earliest < item.paymentCreatedAt ? earliest : item.paymentCreatedAt), items[0]?.paymentCreatedAt || "");
    const billingRunPaidAt = batch?.completedAt ? formatDateTime(batch.completedAt) : items.find((item) => item.paymentPaidAt)?.paymentPaidAt || "";
    const billingRunFailedAt = batch?.status === "failed" ? formatDateTime(batch.updatedAt) : items.find((item) => item.paymentFailedAt)?.paymentFailedAt || "";

  return {
    billingRunId,
    billingRunLabel: sample.billingRunLabel,
      billingRunType: sample.billingRunType,
      billingRunStatus: runStatus,
      billingBatchId: sample.billingBatchId,
      ownerId: sample.ownerId,
      ownerDisplayName: sample.ownerDisplayName,
      ownerCompanyName: sample.ownerCompanyName,
      ownerCustomerId: sample.ownerCustomerId,
      stripePaymentIntentId: batch?.stripePaymentIntentId || sample.stripePaymentIntentId || "",
      stripeChargeId: items.find((item) => item.stripeChargeId)?.stripeChargeId || "",
      stripeBatchTransferId: batch?.stripeBatchTransferId || sample.stripeBatchTransferId || "",
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      billingRunCreatedAt,
      billingRunPaidAt,
      billingRunFailedAt,
      totalAmountCharged: toMoney(totalAmountCharged),
      totalPlatformFeeTotal: toMoney(totalPlatformFeeTotal),
      totalDriverTips: toMoney(totalDriverTips),
      washoutCount: items.length,
      driverCount: driverCounts.length,
      locationCount: locationCounts.length,
      locationsVisited,
      washoutCountPerLocation: locationCounts.map((entry) => ({
        locationId: entry.key,
        locationName: items.find((item) => item.locationId === entry.key)?.locationName || entry.key,
        count: entry.count,
      })),
      washoutCountPerDriver: driverCounts.map((entry) => ({
        driverId: entry.key,
        driverDisplayName: items.find((item) => item.driverId === entry.key)?.driverDisplayName || entry.key,
        count: entry.count,
      })),
      items: items.sort((a, b) => a.checkInTime.localeCompare(b.checkInTime)),
    };
  }).sort((a, b) => b.billingRunCreatedAt.localeCompare(a.billingRunCreatedAt));

  const summary = buildSummary(finalizedRows, runs);

  return {
    reportType: "billing_audit",
    scope: "super_admin",
    generatedAt: new Date().toISOString(),
    dateRange,
    filters: {
      ownerId: query.ownerId || null,
      locationId: query.locationId || null,
      driverId: query.driverId || null,
      stripeTransactionId: query.stripeTransactionId || null,
      billingRunId: query.billingRunId || null,
      status: (query.status as BillingAuditStatusFilter) || null,
    },
    summary,
    runs,
    rows: finalizedRows,
  };
}

const AUDIT_CSV_COLUMNS: Array<{ key: keyof BillingAuditItem; label: string }> = [
  { key: "billingRunId", label: "Billing Run ID" },
  { key: "billingRunLabel", label: "Billing Run Label" },
  { key: "billingRunType", label: "Billing Run Type" },
  { key: "billingRunStatus", label: "Billing Run Status" },
  { key: "billingBatchId", label: "Billing Batch ID" },
  { key: "billingPeriodStart", label: "Billing Period Start" },
  { key: "billingPeriodEnd", label: "Billing Period End" },
  { key: "billingRunCreatedAt", label: "Billing Run Created At" },
  { key: "billingRunPaidAt", label: "Billing Run Paid At" },
  { key: "billingRunFailedAt", label: "Billing Run Failed At" },
  { key: "stripePaymentIntentId", label: "Stripe PaymentIntent ID" },
  { key: "stripeChargeId", label: "Stripe Charge ID" },
  { key: "stripeBatchTransferId", label: "Stripe Batch Transfer ID" },
  { key: "ownerId", label: "Owner ID" },
  { key: "ownerDisplayName", label: "Owner Name" },
  { key: "ownerCompanyName", label: "Owner Company" },
  { key: "ownerCustomerId", label: "Owner Customer ID" },
  { key: "driverId", label: "Driver ID" },
  { key: "driverDisplayName", label: "Driver Name" },
  { key: "truckNumber", label: "Truck Number" },
  { key: "locationId", label: "Location ID" },
  { key: "locationName", label: "Location Name" },
  { key: "locationAddress", label: "Location Address" },
  { key: "washoutId", label: "Washout ID" },
  { key: "washoutStatus", label: "Washout Status" },
  { key: "verificationStatus", label: "Verification Status" },
  { key: "checkInTime", label: "Washout Date/Time" },
  { key: "amountCharged", label: "Amount Charged" },
  { key: "platformFeeTotal", label: "Platform Fee Total" },
  { key: "driverIncentiveTip", label: "Driver Incentive Tip" },
  { key: "paymentStatus", label: "Payment Status" },
  { key: "paymentId", label: "Payment ID" },
  { key: "paymentCreatedAt", label: "Payment Created At" },
  { key: "paymentPaidAt", label: "Payment Paid At" },
  { key: "paymentFailedAt", label: "Payment Failed At" },
  { key: "paymentRefundedAt", label: "Payment Refunded At" },
  { key: "photoCount", label: "Photo Count" },
  { key: "photoReviewStatus", label: "Photo Review Status" },
  { key: "notes", label: "Notes / Exceptions" },
  { key: "legacyUnlinked", label: "Legacy / Unlinked" },
];

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function billingAuditReportToCsv(report: BillingAuditReportResponse): string {
  const headers = AUDIT_CSV_COLUMNS.map((column) => column.label);
  const rows = report.rows.map((row) =>
    AUDIT_CSV_COLUMNS.map((column) => escapeCsvValue(row[column.key])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function billingAuditReportToJson(report: BillingAuditReportResponse) {
  return report;
}

export function billingAuditReportToPdfBuffer(report: BillingAuditReportResponse): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text("Billing & Washout Audit Report", 14, 16);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 14, 24);
  doc.text(`Date range: ${report.dateRange.label}`, 14, 30);
  doc.text(`Filters: ${[
    report.filters.ownerId ? `owner=${report.filters.ownerId}` : null,
    report.filters.locationId ? `location=${report.filters.locationId}` : null,
    report.filters.driverId ? `driver=${report.filters.driverId}` : null,
    report.filters.billingRunId ? `run=${report.filters.billingRunId}` : null,
    report.filters.stripeTransactionId ? `transaction=${report.filters.stripeTransactionId}` : null,
    report.filters.status ? `status=${report.filters.status}` : null,
  ].filter(Boolean).join(" | ") || "none"}`, 14, 36);

  const summaryLines = [
    `Runs: ${report.summary.totalRuns}`,
    `Washouts: ${report.summary.totalWashouts}`,
    `Charged: $${report.summary.totalAmountCharged}`,
    `Platform fees: $${report.summary.totalPlatformFeeTotal}`,
    `Driver tips: $${report.summary.totalDriverTips}`,
    `Paid: $${report.summary.totalPaid}`,
    `Pending: $${report.summary.totalPending}`,
    `Failed: $${report.summary.totalFailed}`,
    `Refunded: $${report.summary.totalRefunded}`,
    `Disputed: $${report.summary.totalDisputed}`,
    `Legacy / Unlinked: ${report.summary.totalLegacyUnlinked}`,
  ];

  summaryLines.forEach((line, index) => {
    doc.text(line, 14 + (index % 2) * 120, 44 + Math.floor(index / 2) * 6);
  });

  let startY = 44 + Math.ceil(summaryLines.length / 2) * 6 + 6;
  for (const run of report.runs) {
    doc.setFontSize(12);
    doc.text(`${run.billingRunLabel} (${run.billingRunId})`, 14, startY);
    doc.setFontSize(9);
    startY += 5;
    doc.text(
      `Owner: ${run.ownerDisplayName || run.ownerCompanyName || run.ownerId} | Status: ${run.billingRunStatus} | Washouts: ${run.washoutCount} | Drivers: ${run.driverCount} | Locations: ${run.locationCount}`,
      14,
      startY
    );
    startY += 5;
    doc.text(
      `Period: ${run.billingPeriodStart || "n/a"} to ${run.billingPeriodEnd || "n/a"} | Created: ${run.billingRunCreatedAt || "n/a"} | Paid: ${run.billingRunPaidAt || "n/a"} | Failed: ${run.billingRunFailedAt || "n/a"}`,
      14,
      startY
    );
    startY += 4;

    autoTable(doc, {
      startY: startY + 2,
      head: [[
        "Washout ID",
        "Driver",
        "Location",
        "Date/Time",
        "Amount",
        "Payment",
        "Photos",
        "Review",
      ]],
      body: run.items.map((item) => [
        item.washoutId,
        item.driverDisplayName,
        item.locationName,
        item.checkInTime,
        `$${item.amountCharged}`,
        item.paymentStatus,
        String(item.photoCount),
        item.photoReviewStatus,
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      margin: { left: 14, right: 14 },
      pageBreak: "auto",
    });

    startY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : startY + 30;
    if (startY > 180 && run !== report.runs[report.runs.length - 1]) {
      doc.addPage();
      startY = 16;
    }
  }

  const buffer = doc.output("arraybuffer");
  return Buffer.from(buffer);
}
