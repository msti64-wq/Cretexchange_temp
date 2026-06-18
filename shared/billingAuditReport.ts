import type { ResolvedReportDateRange } from "./reportFilters";

export type BillingAuditStatusFilter = "paid" | "pending" | "failed" | "refunded" | "disputed";
export type BillingAuditRunType = "billing_batch" | "legacy_unlinked";
export type BillingAuditRunStatus = BillingAuditStatusFilter | "processing";

export interface BillingAuditReportQueryInput {
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  locationId?: string;
  driverId?: string;
  stripeTransactionId?: string;
  billingRunId?: string;
  status?: BillingAuditStatusFilter | string;
}

export interface BillingAuditPhotoSummary {
  photoCount: number;
  photoReviewStatus: string;
}

export interface BillingAuditItem {
  billingRunId: string;
  billingRunLabel: string;
  billingRunType: BillingAuditRunType;
  billingRunStatus: BillingAuditRunStatus;
  billingBatchId: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingRunCreatedAt: string;
  billingRunPaidAt: string;
  billingRunFailedAt: string;
  stripePaymentIntentId: string;
  stripeChargeId: string;
  stripeBatchTransferId: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerCompanyName: string;
  ownerCustomerId: string;
  driverId: string;
  driverDisplayName: string;
  truckNumber: string;
  locationId: string;
  locationName: string;
  locationAddress: string;
  washoutId: string;
  washoutStatus: string;
  verificationStatus: string;
  checkInTime: string;
  amountCharged: string;
  platformFeeTotal: string;
  driverTipRate: string;
  paymentStatus: string;
  paymentId: string;
  paymentCreatedAt: string;
  paymentPaidAt: string;
  paymentFailedAt: string;
  paymentRefundedAt: string;
  notes: string;
  photoCount: number;
  photoReviewStatus: string;
  legacyUnlinked: boolean;
}

export interface BillingAuditRunDriverSummary {
  driverId: string;
  driverDisplayName: string;
  count: number;
}

export interface BillingAuditRunLocationSummary {
  locationId: string;
  locationName: string;
  count: number;
}

export interface BillingAuditRun {
  billingRunId: string;
  billingRunLabel: string;
  billingRunType: BillingAuditRunType;
  billingRunStatus: BillingAuditRunStatus;
  billingBatchId: string | null;
  ownerId: string;
  ownerDisplayName: string;
  ownerCompanyName: string;
  ownerCustomerId: string;
  stripePaymentIntentId: string;
  stripeChargeId: string;
  stripeBatchTransferId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingRunCreatedAt: string;
  billingRunPaidAt: string;
  billingRunFailedAt: string;
  totalAmountCharged: string;
  totalPlatformFeeTotal: string;
  totalDriverTips: string;
  washoutCount: number;
  driverCount: number;
  locationCount: number;
  locationsVisited: string[];
  washoutCountPerLocation: BillingAuditRunLocationSummary[];
  washoutCountPerDriver: BillingAuditRunDriverSummary[];
  items: BillingAuditItem[];
}

export interface BillingAuditReportSummary {
  totalRuns: number;
  totalWashouts: number;
  totalAmountCharged: string;
  totalPlatformFeeTotal: string;
  totalDriverTips: string;
  totalPaid: string;
  totalPending: string;
  totalFailed: string;
  totalRefunded: string;
  totalDisputed: string;
  totalLegacyUnlinked: number;
}

export interface BillingAuditReportResponse {
  reportType: "billing_audit";
  scope: "super_admin";
  generatedAt: string;
  dateRange: ResolvedReportDateRange;
  filters: {
    ownerId?: string | null;
    locationId?: string | null;
    driverId?: string | null;
    stripeTransactionId?: string | null;
    billingRunId?: string | null;
    status?: BillingAuditStatusFilter | null;
  };
  summary: BillingAuditReportSummary;
  runs: BillingAuditRun[];
  rows: BillingAuditItem[];
}

export const BILLING_AUDIT_STATUS_OPTIONS: Array<{ value: BillingAuditStatusFilter; label: string }> = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "disputed", label: "Disputed" },
];
