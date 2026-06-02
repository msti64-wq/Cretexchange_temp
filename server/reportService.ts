import type { Driver, Owner, Payment, WashoutActivity, WashoutLocation, User } from "../shared/schema";
import { OWNER_REPORT_COLUMNS, DRIVER_REPORT_COLUMNS, type ReportColumn } from "../shared/reportColumns";
import { resolveReportDateRange, type ResolvedReportDateRange } from "../shared/reportFilters";
import { formatAddress } from "../shared/addressUtils";

type ActivityRow = WashoutActivity & {
  location: WashoutLocation & { ownerId?: string };
  driver: Driver & { user: User };
};

type PaymentRow = Payment & {
  activity: WashoutActivity;
  driver?: Driver & { user: User };
  owner?: Owner & { user: User };
  refundReason?: string | null;
};

type LotteryRow = {
  activityId: string;
  ticketNumber: string | null;
};

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
  platformFee: string;
  paymentStatus: string;
  paymentDate: string;
  paymentId: string;
  ticketNumber: string;
  driverIncentiveTip: string;
  tipAmount: string;
  driverPaymentAmount: string;
  notes: string;
}

export interface ReportSummary {
  totalWashouts: number;
  totalAmountCharged: string;
  totalPlatformFees: string;
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
}

export interface ReportStorage {
  getUser(userId: string): Promise<User | undefined>;
  getOwner(userId: string): Promise<Owner | undefined>;
  getDriver(userId: string): Promise<Driver | undefined>;
  getOwnerById(ownerId: string): Promise<Owner | undefined>;
  getDriverById(driverId: string): Promise<Driver | undefined>;
  getAllOwners(): Promise<(Owner & { user: User })[]>;
  getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<ActivityRow[]>;
  getActivitiesByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation })[]>;
  getAllActivities(startDate?: Date, endDate?: Date): Promise<ActivityRow[]>;
  getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<PaymentRow[]>;
  getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation } })[]>;
  getAllPayments(startDate?: Date, endDate?: Date): Promise<PaymentRow[]>;
  getAllDriverLotteryEntries(startDate?: Date, endDate?: Date): Promise<Array<{ activityId: string; ticketNumber: string | null } & Record<string, any>>>;
}

export interface ReportQueryInput {
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  driverId?: string;
  locationId?: string;
  paymentStatus?: string;
  washoutStatus?: string;
}

export interface ReportSubjectContext {
  userId: string;
  role: string;
  owner?: Owner | null;
  driver?: Driver | null;
}

function formatPersonName(person?: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!person) return "";
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

function formatDateTime(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0.00";
  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

function toLower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function normalizePaymentStatus(status: string | null | undefined, hasPayment: boolean): string {
  const raw = toLower(status);
  if (!hasPayment) return "unpaid";
  if (["completed", "posted", "paid", "succeeded"].includes(raw)) return "paid";
  if (["pending", "processing", "queued"].includes(raw)) return "pending";
  if (["failed", "canceled", "cancelled", "reversed"].includes(raw)) return "failed";
  return raw || "pending";
}

function buildSummary(rows: ReportRow[], reportType: "owner" | "driver"): ReportSummary {
  const summary = rows.reduce(
    (acc, row) => {
      const amountCharged = Number.parseFloat(row.amountCharged || "0");
      const platformFee = Number.parseFloat(row.platformFee || "0");
      const paymentAmount = Number.parseFloat(row.driverPaymentAmount || "0");
      const tipAmount = Number.parseFloat(row.tipAmount || "0");
      const isPaid = row.paymentStatus === "paid";
      const settlementAmount = reportType === "owner" ? amountCharged : paymentAmount;

      acc.totalWashouts += 1;
      acc.totalAmountCharged += amountCharged;
      acc.totalPlatformFees += platformFee;
      if (isPaid) {
        acc.totalPaid += settlementAmount;
      } else {
        acc.totalUnpaidPending += settlementAmount || amountCharged;
      }
      acc.totalTips += tipAmount;
      if (reportType === "driver" && isPaid) {
        acc.totalDriverPayments += paymentAmount;
      }
      return acc;
    },
    {
      totalWashouts: 0,
      totalAmountCharged: 0,
      totalPlatformFees: 0,
      totalPaid: 0,
      totalUnpaidPending: 0,
      totalTips: 0,
      totalDriverPayments: 0,
    }
  );

  return {
    totalWashouts: summary.totalWashouts,
    totalAmountCharged: summary.totalAmountCharged.toFixed(2),
    totalPlatformFees: summary.totalPlatformFees.toFixed(2),
    totalPaid: summary.totalPaid.toFixed(2),
    totalUnpaidPending: summary.totalUnpaidPending.toFixed(2),
    totalTips: summary.totalTips.toFixed(2),
    totalDriverPayments: summary.totalDriverPayments.toFixed(2),
  };
}

function buildCsv(rows: ReportRow[], columns: ReportColumn[]): string {
  const headers = columns.map((column) => column.label);
  const values = rows.map((row) =>
    columns
      .map((column) => {
        const value = row[column.key as keyof ReportRow];
        if (value === null || value === undefined) return "";
        const text = String(value);
        return `"${text.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  return [headers.join(","), ...values].join("\n");
}

function applyFilters(rows: ReportRow[], query: ReportQueryInput): ReportRow[] {
  return rows.filter((row) => {
    if (query.ownerId && row.ownerId !== query.ownerId) return false;
    if (query.driverId && row.driverId !== query.driverId) return false;
    if (query.locationId && row.locationId !== query.locationId) return false;
    if (query.paymentStatus && row.paymentStatus !== query.paymentStatus) return false;
    if (query.washoutStatus && row.washoutStatus !== query.washoutStatus) return false;
    return true;
  });
}

async function loadOwnerLookup(storage: ReportStorage): Promise<Map<string, { owner: Owner; user: User }>> {
  const owners = await storage.getAllOwners();
  return new Map(owners.map((entry) => [entry.id, { owner: entry, user: entry.user }]));
}

function buildRowsFromActivities({
  activities,
  payments,
  lotteryEntries,
  ownerLookup,
  explicitOwner,
  reportType,
}: {
  activities: ActivityRow[];
  payments: PaymentRow[];
  lotteryEntries: Array<{ activityId: string; ticketNumber: string | null }>;
  ownerLookup: Map<string, { owner: Owner; user: User }>;
  explicitOwner?: { owner: Owner; user: User } | null;
  reportType: "owner" | "driver";
}): ReportRow[] {
  const paymentsByActivityId = new Map(payments.map((payment) => [payment.activityId, payment]));
  const ticketsByActivityId = new Map<string, string | null>(
    lotteryEntries.map((entry) => [entry.activityId, entry.ticketNumber ?? null])
  );

  return activities.map((activity) => {
    const payment = paymentsByActivityId.get(activity.id);
    const ownerEntry = explicitOwner
      ? explicitOwner
      : ownerLookup.get(activity.location.ownerId) || null;
    const ticketNumber = ticketsByActivityId.get(activity.id) || "";
    const displayOwnerName = ownerEntry
      ? formatPersonName(ownerEntry.user)
      : "";
    const driverTipCents = payment?.tipAmountCents ?? 0;
    const baseAmount = payment ? Number.parseFloat(payment.amount || "0") : Number.parseFloat(activity.amount || "0");
    const platformFeeAmount = payment ? Number.parseFloat(payment.processingFee || "0") : 0;
    const driverPaymentAmount = baseAmount + (driverTipCents / 100);
    const amountChargedAmount = baseAmount + platformFeeAmount + (driverTipCents / 100);

    const notes = [activity.notes, payment?.refundReason].filter(Boolean).join(" | ");
    const paymentStatus = normalizePaymentStatus(payment?.status, Boolean(payment));

    return {
      ownerId: ownerEntry?.owner.id ?? activity.location.ownerId ?? null,
      ownerDisplayName: displayOwnerName,
      ownerCompanyName: ownerEntry?.owner.companyName || "",
      driverId: activity.driver?.id ?? null,
      driverDisplayName: formatPersonName(activity.driver?.user),
      driverPhone: activity.driver?.user?.phone || "",
      driverEmail: activity.driver?.user?.email || "",
      truckNumber: activity.driver?.truckNumber || "",
      locationId: activity.location?.id || "",
      locationName: activity.location?.name || "",
      locationAddress: formatAddress({
        street: activity.location?.street,
        city: activity.location?.city,
        state: activity.location?.state,
        zip: activity.location?.zip,
      }),
      checkInTime: formatDateTime(activity.checkInTime),
      washoutId: activity.id,
      washoutStatus: activity.status,
      serviceType: activity.serviceType || "washout",
      quantity: activity.qty ? String(activity.qty) : "",
      unit: activity.unit || "",
      amountCharged: formatMoney(amountChargedAmount),
      platformFee: formatMoney(platformFeeAmount),
      paymentStatus,
      paymentDate: formatDateTime(payment?.paidAt || payment?.createdAt),
      paymentId: payment?.id || "",
      ticketNumber,
      driverIncentiveTip: formatMoney(driverTipCents / 100),
      tipAmount: formatMoney(driverTipCents / 100),
      driverPaymentAmount: formatMoney(driverPaymentAmount),
      notes,
    };
  });
}

export async function buildOwnerReport(
  storage: ReportStorage,
  subject: ReportSubjectContext,
  query: ReportQueryInput,
): Promise<ReportResponse> {
  const dateRange = resolveReportDateRange(query.dateRange, query.startDate, query.endDate);
  const ownerLookup = await loadOwnerLookup(storage);

  let explicitOwner: { owner: Owner; user: User } | null = null;
  let activities: ActivityRow[] = [];
  let payments: PaymentRow[] = [];

  if (subject.role === "owner") {
    if (!subject.owner) {
      throw new Error("Owner profile not found");
    }
    if (query.ownerId && query.ownerId !== subject.owner.id) {
      throw new Error("Forbidden");
    }
    explicitOwner = { owner: subject.owner, user: await storage.getUser(subject.userId).then((user) => user as User) };
    activities = await storage.getActivitiesByOwner(subject.owner.id, dateRange.startDate, dateRange.endDate);
    payments = await storage.getPaymentsByOwner(subject.owner.id, dateRange.startDate, dateRange.endDate);
  } else if (subject.role === "admin" || subject.role === "super_admin") {
    if (query.ownerId) {
      const owner = await storage.getOwnerById(query.ownerId);
      if (!owner) {
        throw new Error("Owner not found");
      }
      const user = await storage.getUser(owner.userId);
      if (!user) {
        throw new Error("Owner user not found");
      }
      explicitOwner = { owner, user };
      activities = await storage.getActivitiesByOwner(owner.id, dateRange.startDate, dateRange.endDate);
      payments = await storage.getPaymentsByOwner(owner.id, dateRange.startDate, dateRange.endDate);
    } else {
      activities = await storage.getAllActivities(dateRange.startDate, dateRange.endDate);
      payments = await storage.getAllPayments(dateRange.startDate, dateRange.endDate);
    }
  } else {
    throw new Error("Forbidden");
  }

  const lotteryEntries = await storage.getAllDriverLotteryEntries(dateRange.startDate, dateRange.endDate);
  const rows = buildRowsFromActivities({
    activities,
    payments,
    lotteryEntries: lotteryEntries.filter((entry) => {
      if (query.ownerId && entry.ownerId !== query.ownerId) return false;
      return true;
    }),
    ownerLookup,
    explicitOwner,
    reportType: "owner",
  });

  const filteredRows = applyFilters(rows, {
    ownerId: query.ownerId || undefined,
    locationId: query.locationId || undefined,
    paymentStatus: query.paymentStatus || undefined,
    washoutStatus: query.washoutStatus || undefined,
  });

  return {
    reportType: "owner",
    scope: subject.role === "owner" ? "owner" : "admin",
    generatedAt: new Date().toISOString(),
    dateRange,
    filters: {
      ownerId: query.ownerId || explicitOwner?.owner.id || null,
      locationId: query.locationId || null,
      paymentStatus: query.paymentStatus || null,
      washoutStatus: query.washoutStatus || null,
    },
    summary: buildSummary(filteredRows, "owner"),
    rows: filteredRows,
  };
}

export async function buildDriverReport(
  storage: ReportStorage,
  subject: ReportSubjectContext,
  query: ReportQueryInput,
): Promise<ReportResponse> {
  const dateRange = resolveReportDateRange(query.dateRange, query.startDate, query.endDate);
  const ownerLookup = await loadOwnerLookup(storage);

  let activities: ActivityRow[] = [];
  let payments: PaymentRow[] = [];
  let explicitDriver: Driver | null = null;

  if (subject.role === "driver") {
    if (!subject.driver) {
      throw new Error("Driver profile not found");
    }
    if (query.driverId && query.driverId !== subject.driver.id) {
      throw new Error("Forbidden");
    }
    explicitDriver = subject.driver;
    activities = (await storage.getAllActivities(dateRange.startDate, dateRange.endDate)).filter(
      (activity: any) => activity.driverId === subject.driver?.id
    ) as ActivityRow[];
    payments = (await storage.getPaymentsByDriver(subject.driver.id, dateRange.startDate, dateRange.endDate)) as PaymentRow[];
  } else if (subject.role === "admin" || subject.role === "super_admin") {
    if (query.driverId) {
      const driver = await storage.getDriverById(query.driverId);
      if (!driver) {
        throw new Error("Driver not found");
      }
      explicitDriver = driver;
      activities = (await storage.getAllActivities(dateRange.startDate, dateRange.endDate)).filter(
        (activity: any) => activity.driverId === driver.id
      ) as ActivityRow[];
      payments = (await storage.getPaymentsByDriver(driver.id, dateRange.startDate, dateRange.endDate)) as PaymentRow[];
    } else {
      activities = await storage.getAllActivities(dateRange.startDate, dateRange.endDate);
      payments = await storage.getAllPayments(dateRange.startDate, dateRange.endDate);
    }
  } else {
    throw new Error("Forbidden");
  }

  const lotteryEntries = await storage.getAllDriverLotteryEntries(dateRange.startDate, dateRange.endDate);
  const rows = buildRowsFromActivities({
    activities,
    payments,
    lotteryEntries: lotteryEntries.filter((entry) => {
      if (query.driverId && entry.driverId !== query.driverId) return false;
      return true;
    }),
    ownerLookup,
    explicitOwner: null,
    reportType: "driver",
  });

  const filteredRows = applyFilters(rows, {
    driverId: query.driverId || undefined,
    ownerId: query.ownerId || undefined,
    locationId: query.locationId || undefined,
    paymentStatus: query.paymentStatus || undefined,
    washoutStatus: query.washoutStatus || undefined,
  });

  return {
    reportType: "driver",
    scope: subject.role === "driver" ? "driver" : "admin",
    generatedAt: new Date().toISOString(),
    dateRange,
    filters: {
      ownerId: query.ownerId || null,
      driverId: query.driverId || explicitDriver?.id || null,
      locationId: query.locationId || null,
      paymentStatus: query.paymentStatus || null,
      washoutStatus: query.washoutStatus || null,
    },
    summary: buildSummary(filteredRows, "driver"),
    rows: filteredRows,
  };
}

export function reportResponseToCsv(response: ReportResponse): string {
  const columns = response.reportType === "owner" ? OWNER_REPORT_COLUMNS : DRIVER_REPORT_COLUMNS;
  return buildCsv(response.rows, columns);
}

export function reportResponseToJsonWithColumns(response: ReportResponse) {
  const columns = response.reportType === "owner" ? OWNER_REPORT_COLUMNS : DRIVER_REPORT_COLUMNS;
  return {
    ...response,
    columns,
  };
}

export function resolveReportRangeForRequest(query: ReportQueryInput) {
  return resolveReportDateRange(query.dateRange, query.startDate, query.endDate);
}
