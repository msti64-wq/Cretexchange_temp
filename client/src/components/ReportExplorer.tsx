import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Download, FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import type { ReportColumn } from "@shared/reportColumns";
import type { ReportResponse, ReportRow } from "@shared/reportTypes";
import type { ReportDateRangeKey } from "@shared/reportFilters";
import { formatCurrency } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface ReportExplorerProps {
  title: string;
  description: string;
  endpoint: string;
  filenamePrefix: string;
  defaultDateRange?: ReportDateRangeKey;
  columns: ReportColumn[];
  showOwnerFilter?: boolean;
  showDriverFilter?: boolean;
  showLocationFilter?: boolean;
  showPaymentStatusFilter?: boolean;
  showWashoutStatusFilter?: boolean;
  ownerOptions?: SelectOption[];
  driverOptions?: SelectOption[];
  locationOptions?: SelectOption[];
  enableClientFilters?: boolean;
  summaryVariant?: "financial" | "operational";
  renderInsights?: (data: ReportResponse & { columns: ReportColumn[] }, rows: ReportRow[]) => ReactNode;
}

const DATE_RANGE_OPTIONS: Array<{ value: ReportDateRangeKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
  { value: "all", label: "All Time" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "unpaid", label: "Unpaid" },
  { value: "failed", label: "Failed" },
];

const WASHOUT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

function statusBadge(value: string) {
  const normalized = value.toLowerCase();
  const variant = normalized === "paid" || normalized === "verified" ? "default" : normalized === "pending" ? "secondary" : normalized === "failed" || normalized === "rejected" ? "destructive" : "outline";
  return <Badge variant={variant as any}>{value}</Badge>;
}

function activityStatusBucket(value: string | null | undefined): "approved" | "pending" | "rejected" {
  const normalized = String(value || "").toLowerCase();
  if (["verified", "approved", "completed"].includes(normalized)) return "approved";
  if (["rejected", "declined", "cancelled", "canceled"].includes(normalized)) return "rejected";
  return "pending";
}

function formatCellValue(columnKey: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (columnKey === "paymentStatus" || columnKey === "washoutStatus") {
    return statusBadge(String(value));
  }

  if (columnKey === "ticketNumber") {
    return (
      <span className="rounded bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary">
        {String(value)}
      </span>
    );
  }

  return String(value);
}

export function ReportExplorer({
  title,
  description,
  endpoint,
  filenamePrefix,
  defaultDateRange = "daily",
  columns,
  showOwnerFilter = false,
  showDriverFilter = false,
  showLocationFilter = false,
  showPaymentStatusFilter = true,
  showWashoutStatusFilter = true,
  ownerOptions = [],
  driverOptions = [],
  locationOptions = [],
  enableClientFilters = false,
  summaryVariant = "financial",
  renderInsights,
}: ReportExplorerProps) {
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>(defaultDateRange);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [washoutStatus, setWashoutStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [clientDriverId, setClientDriverId] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "driver" | "location">("newest");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dateRange", dateRange);

    if (dateRange === "custom") {
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    }

    if (showOwnerFilter && ownerId) params.set("ownerId", ownerId);
    if (showDriverFilter && driverId) params.set("driverId", driverId);
    if (showLocationFilter && locationId) params.set("locationId", locationId);
    if (showPaymentStatusFilter && paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
    if (showWashoutStatusFilter && washoutStatus !== "all") params.set("washoutStatus", washoutStatus);

    return params.toString();
  }, [dateRange, startDate, endDate, ownerId, driverId, locationId, paymentStatus, washoutStatus, showOwnerFilter, showDriverFilter, showLocationFilter, showPaymentStatusFilter, showWashoutStatusFilter]);

  const canFetch = dateRange !== "custom" || Boolean(startDate && endDate);

  const { data, isLoading, error, refetch } = useQuery<ReportResponse & { columns: ReportColumn[] }, Error>({
    queryKey: [endpoint, queryString],
    enabled: canFetch,
    queryFn: async (): Promise<ReportResponse & { columns: ReportColumn[] }> => {
      const response = await apiRequest(`${endpoint}?${queryString}`, { method: "GET" });
      return response.json() as Promise<ReportResponse & { columns: ReportColumn[] }>;
    },
    retry: false,
  });

  const clientDriverOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Map(data.rows
      .filter((row) => row.driverId)
      .map((row) => [row.driverId as string, row.driverDisplayName || "Unnamed driver"])).entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [data]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return data.rows
      .filter((row) => {
        const matchesDriver = !enableClientFilters || clientDriverId === "all" || row.driverId === clientDriverId;
        const matchesSearch = !enableClientFilters || !normalizedSearch || [
          row.driverDisplayName,
          row.locationName,
          row.washoutStatus,
          row.serviceType,
          row.washoutId,
        ].join(" ").toLocaleLowerCase().includes(normalizedSearch);
        return matchesDriver && matchesSearch;
      })
      .sort((left, right) => {
        if (sortBy === "driver") return left.driverDisplayName.localeCompare(right.driverDisplayName);
        if (sortBy === "location") return left.locationName.localeCompare(right.locationName);
        const leftTime = new Date(left.checkInTime || 0).getTime();
        const rightTime = new Date(right.checkInTime || 0).getTime();
        return sortBy === "oldest" ? leftTime - rightTime : rightTime - leftTime;
      });
  }, [data, search, clientDriverId, sortBy, enableClientFilters]);

  const operationalSummary = useMemo(() => {
    const statusCounts = visibleRows.reduce((acc, row) => {
      acc[activityStatusBucket(row.washoutStatus)] += 1;
      return acc;
    }, { approved: 0, pending: 0, rejected: 0 });
    return {
      ...statusCounts,
      uniqueDrivers: new Set(visibleRows.map((row) => row.driverId).filter(Boolean)).size,
      rewardEntries: visibleRows.filter((row) => Boolean(row.ticketNumber)).length,
    };
  }, [visibleRows]);

  const exportCsv = async () => {
    await downloadReportCsv(`${endpoint}?${queryString}&format=csv`, `${filenamePrefix}-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportPdf = () => {
    if (!data) return;
    downloadReportPdf(
      data,
      `${filenamePrefix}-${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as ReportDateRangeKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dateRange === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            {showPaymentStatusFilter && (
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showWashoutStatusFilter && (
              <div className="space-y-2">
                <Label>Recovery Verification Status</Label>
                <Select value={washoutStatus} onValueChange={setWashoutStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {WASHOUT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showOwnerFilter && (
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={ownerId || "all"} onValueChange={(value) => setOwnerId(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {ownerOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showDriverFilter && (
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={driverId || "all"} onValueChange={(value) => setDriverId(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All drivers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All drivers</SelectItem>
                    {driverOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showLocationFilter && (
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locationId || "all"} onValueChange={(value) => setLocationId(value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {locationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {enableClientFilters && (
            <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Search report rows</Label>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Driver, facility, status, or recovery activity ID" data-testid="input-report-search" />
              </div>
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={clientDriverId} onValueChange={setClientDriverId}>
                  <SelectTrigger data-testid="select-report-driver"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All drivers</SelectItem>
                    {clientDriverOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort rows</Label>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                  <SelectTrigger data-testid="select-report-sort"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest activity</SelectItem>
                    <SelectItem value="oldest">Oldest activity</SelectItem>
                    <SelectItem value="driver">Driver name</SelectItem>
                    <SelectItem value="location">Location name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportCsv} variant="outline" disabled={!data || !data.rows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={exportPdf} disabled={!data || !data.rows.length}>
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading report...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <span>Failed to load report.</span>
            <Button variant="outline" onClick={() => void refetch()}>Retry report</Button>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {summaryVariant === "operational" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Activity Rows</div><div className="text-2xl font-semibold">{visibleRows.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Approved / Verified</div><div className="text-2xl font-semibold">{operationalSummary.approved}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-semibold">{operationalSummary.pending}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Rejected</div><div className="text-2xl font-semibold">{operationalSummary.rejected}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Unique Drivers</div><div className="text-2xl font-semibold">{operationalSummary.uniqueDrivers}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Reward Entries</div><div className="text-2xl font-semibold">{operationalSummary.rewardEntries}</div></CardContent></Card>
            </div>
          ) : (
            <div className={`grid gap-4 ${data.reportType === "driver" ? "md:grid-cols-2 xl:grid-cols-7" : "md:grid-cols-2 xl:grid-cols-6"}`}>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Recovery Activities</div><div className="text-2xl font-semibold">{data.summary.totalWashouts}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Charged</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalAmountCharged))}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Platform Fees</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalPlatformFees))}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tips</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalTips))}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalPaid))}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Unpaid / Pending</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalUnpaidPending))}</div></CardContent></Card>
              {data.reportType === "driver" && <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Driver Payments</div><div className="text-2xl font-semibold">{formatCurrency(Number(data.summary.totalDriverPayments))}</div></CardContent></Card>}
            </div>
          )}

          {renderInsights?.(data, visibleRows)}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((column) => (
                        <TableHead key={column.key}>{column.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                          No recovery activities found for the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleRows.map((row) => (
                        <TableRow key={row.washoutId}>
                          {columns.map((column) => (
                            <TableCell key={column.key} className="align-top">
                              {formatCellValue(column.key, (row as any)[column.key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
