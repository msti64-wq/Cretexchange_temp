import type { ReportColumn } from "./reportColumns";
import type { ReportDateRangeKey, ResolvedReportDateRange } from "./reportFilters";

export interface ReportRow {
  ownerId: string | null;
  ownerDisplayName: string;
  ownerCompanyName: string;
  driverId: string | null;
  driverDisplayName: string;
  driverPhone: string;
  driverEmail: string;
  truckNumber: string;
  locationId: string;
  locationName: string;
  locationAddress: string;
  checkInTime: string;
  washoutId: string;
  washoutStatus: string;
  serviceType: string;
  quantity: string;
  unit: string;
  amountCharged: string;
  paymentStatus: string;
  paymentDate: string;
  paymentId: string;
  ticketNumber: string;
  tipAmount: string;
  driverPaymentAmount: string;
  notes: string;
}

export interface ReportSummary {
  totalWashouts: number;
  totalAmountCharged: string;
  totalPaid: string;
  totalUnpaidPending: string;
  totalTips: string;
  totalDriverPayments: string;
}

export interface ReportResponse {
  reportType: "owner" | "driver";
  scope: "owner" | "driver" | "admin";
  generatedAt: string;
  dateRange: ResolvedReportDateRange;
  filters: {
    ownerId?: string | null;
    driverId?: string | null;
    locationId?: string | null;
    paymentStatus?: string | null;
    washoutStatus?: string | null;
  };
  summary: ReportSummary;
  rows: ReportRow[];
  columns?: ReportColumn[];
}

export interface ReportQueryInput {
  dateRange?: ReportDateRangeKey | string;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  driverId?: string;
  locationId?: string;
  paymentStatus?: string;
  washoutStatus?: string;
}

