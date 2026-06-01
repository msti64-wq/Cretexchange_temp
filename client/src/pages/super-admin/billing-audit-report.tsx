import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Download, FileText, Loader2, ShieldAlert, ReceiptText, TriangleAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BILLING_AUDIT_STATUS_OPTIONS, type BillingAuditReportResponse } from "@shared/billingAuditReport";

interface SelectOption {
  value: string;
  label: string;
}

function statusBadge(value: string) {
  const normalized = value.toLowerCase();
  const variant = normalized === "paid"
    ? "default"
    : normalized === "pending" || normalized === "processing"
      ? "secondary"
      : normalized === "failed" || normalized === "disputed"
        ? "destructive"
        : normalized === "refunded"
          ? "outline"
          : "outline";
  return <Badge variant={variant as any}>{value}</Badge>;
}

function downloadBlobUrl(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default function BillingAuditReportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "daily" | "weekly" | "monthly" | "custom" | "all">("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [stripeTransactionId, setStripeTransactionId] = useState("");
  const [billingRunId, setBillingRunId] = useState("");
  const [status, setStatus] = useState("all");
  const [downloadLoading, setDownloadLoading] = useState<"csv" | "pdf" | null>(null);

  const isSuperAdmin = user?.role === "super_admin";

  const { data: ownersData } = useQuery<any[]>({
    queryKey: ["/api/admin/owners"],
    retry: false,
    enabled: isSuperAdmin,
  });

  const { data: locationsData } = useQuery<any[]>({
    queryKey: ["/api/admin/locations"],
    retry: false,
    enabled: isSuperAdmin,
  });

  const { data: usersData } = useQuery<any>({
    queryKey: ["/api/admin/users"],
    retry: false,
    enabled: isSuperAdmin,
  });

  const ownerOptions = useMemo(() => {
    const owners = ownersData || [];
    return owners.map((entry: any) => ({
      value: entry.owners?.id,
      label: `${entry.users?.firstName || "Owner"} ${entry.users?.lastName || ""}`.trim() || entry.owners?.companyName || entry.owners?.id,
    })).filter((option: SelectOption) => option.value);
  }, [ownersData]);

  const driverOptions = useMemo(() => {
    const drivers = usersData?.drivers || [];
    return drivers.map((entry: any) => ({
      value: entry.drivers?.id,
      label: `${entry.users?.firstName || "Driver"} ${entry.users?.lastName || ""}`.trim() || entry.drivers?.truckNumber || entry.drivers?.id,
    })).filter((option: SelectOption) => option.value);
  }, [usersData]);

  const locationOptions = useMemo(() => {
    const locations = locationsData || [];
    return locations.map((location: any) => ({
      value: location.id,
      label: `${location.name} - ${(location.street || "").trim()}`.trim(),
    })).filter((option: SelectOption) => option.value);
  }, [locationsData]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dateRange", dateRange);
    if (dateRange === "custom") {
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    }
    if (ownerId) params.set("ownerId", ownerId);
    if (locationId) params.set("locationId", locationId);
    if (driverId) params.set("driverId", driverId);
    if (stripeTransactionId) params.set("stripeTransactionId", stripeTransactionId);
    if (billingRunId) params.set("billingRunId", billingRunId);
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [dateRange, startDate, endDate, ownerId, locationId, driverId, stripeTransactionId, billingRunId, status]);

  const canFetch = dateRange !== "custom" || Boolean(startDate && endDate);

  const { data, isLoading, error } = useQuery<BillingAuditReportResponse, Error>({
    queryKey: ["/api/reports/billing-audit", queryString],
    enabled: isSuperAdmin && canFetch,
    queryFn: async () => {
      const response = await apiRequest(`/api/reports/billing-audit?${queryString}`, { method: "GET" });
      return response.json() as Promise<BillingAuditReportResponse>;
    },
    retry: false,
  });

  const runCount = data?.summary.totalRuns || 0;
  const washoutCount = data?.summary.totalWashouts || 0;
  const runStatus = runCount > 0 ? `${runCount} billing run${runCount === 1 ? "" : "s"}` : "No billing runs";

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setDownloadLoading(format);
      const response = await apiRequest(`/api/reports/billing-audit?${queryString}&format=${format}`, { method: "GET" });
      const blob = await response.blob();
      const filename = `billing-audit-report-${new Date().toISOString().split("T")[0]}.${format}`;
      downloadBlobUrl(blob, filename);
    } catch (err) {
      toast({
        title: "Export failed",
        description: "Unable to download the billing audit report.",
        variant: "destructive",
      });
    } finally {
      setDownloadLoading(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="gradient-bg p-4 text-white shadow-lg">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-lg font-semibold">Billing & Washout Audit Report</h1>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Superadmin access required</p>
                <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/80">
                  This report is restricted to superadmin users.
                </p>
              </div>
            </div>
          </div>
        </main>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  const summaryCards = [
    { label: "Billing Runs", value: runCount, helper: runStatus, icon: ReceiptText },
    { label: "Washouts", value: washoutCount, helper: `${data?.summary.totalLegacyUnlinked || 0} legacy / unlinked`, icon: FileText },
    { label: "Charged", value: formatCurrency(Number(data?.summary.totalAmountCharged || 0)), helper: "Total amount charged", icon: Download },
    { label: "Platform Fees", value: formatCurrency(Number(data?.summary.totalPlatformFeeTotal || 0)), helper: "Fees captured", icon: TriangleAlert },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="mx-auto max-w-6xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Superadmin report</p>
            <h1 className="text-lg font-semibold">Billing & Washout Audit Report</h1>
            <p className="text-sm text-white/80">Reconcile Stripe charges against washout activity, runs, and payouts.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              disabled={isLoading || downloadLoading !== null || !data}
              onClick={() => handleExport("csv")}
              data-testid="button-download-csv"
            >
              {downloadLoading === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download CSV
            </Button>
            <Button
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              disabled={isLoading || downloadLoading !== null || !data}
              onClick={() => handleExport("pdf")}
              data-testid="button-download-pdf"
            >
              {downloadLoading === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select value={dateRange} onValueChange={(value) => setDateRange(value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["today", "yesterday", "daily", "weekly", "monthly", "custom", "all"].map((value) => (
                      <SelectItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</SelectItem>
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
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={ownerId || "all"} onValueChange={(value) => setOwnerId(value === "all" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {ownerOptions.map((option: SelectOption) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locationId || "all"} onValueChange={(value) => setLocationId(value === "all" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {locationOptions.map((option: SelectOption) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={driverId || "all"} onValueChange={(value) => setDriverId(value === "all" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="All drivers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {driverOptions.map((option: SelectOption) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction / Intent ID</Label>
                <Input value={stripeTransactionId} onChange={(e) => setStripeTransactionId(e.target.value)} placeholder="pi_ or ch_ or batch id" />
              </div>
              <div className="space-y-2">
                <Label>Billing Run ID</Label>
                <Input value={billingRunId} onChange={(e) => setBillingRunId(e.target.value)} placeholder="batch or legacy run id" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {BILLING_AUDIT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/40 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-semibold text-red-800 dark:text-red-200">Report unavailable</p>
                <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/80">{error.message}</p>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Icon className="h-4 w-4 text-primary" />
                    {card.label}
                  </div>
                  <div className="text-2xl font-semibold tracking-tight">{card.value}</div>
                  <div className="text-xs text-muted-foreground">{card.helper}</div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Billing Runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && (
              <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading billing audit report...
              </div>
            )}

            {!isLoading && data && data.runs.length === 0 && (
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                No billing runs matched the selected filters.
              </div>
            )}

            {!isLoading && data?.runs.map((run) => (
              <details key={run.billingRunId} className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{run.billingRunLabel}</h3>
                        {statusBadge(run.billingRunStatus)}
                        {run.billingRunType === "legacy_unlinked" && <Badge variant="outline">Legacy / Unlinked</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {run.ownerDisplayName || run.ownerCompanyName || run.ownerId} · {run.billingRunId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Period: {run.billingPeriodStart || "n/a"} to {run.billingPeriodEnd || "n/a"} · Created: {run.billingRunCreatedAt || "n/a"} · Paid: {run.billingRunPaidAt || "n/a"} · Failed: {run.billingRunFailedAt || "n/a"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right text-xs sm:text-sm">
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-semibold">{formatCurrency(Number(run.totalAmountCharged || 0))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fees</p>
                        <p className="font-semibold">{formatCurrency(Number(run.totalPlatformFeeTotal || 0))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Washouts</p>
                        <p className="font-semibold">{run.washoutCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Drivers</p>
                        <p className="font-semibold">{run.driverCount}</p>
                      </div>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Locations visited</p>
                      <p className="mt-1 text-sm text-foreground">{run.locationsVisited.length ? run.locationsVisited.join(", ") : "None"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">By location</p>
                      <div className="mt-2 space-y-1 text-sm">
                        {run.washoutCountPerLocation.map((entry) => (
                          <div key={entry.locationId} className="flex items-center justify-between gap-3">
                            <span className="truncate">{entry.locationName}</span>
                            <span className="font-semibold">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">By driver</p>
                      <div className="mt-2 space-y-1 text-sm">
                        {run.washoutCountPerDriver.map((entry) => (
                          <div key={entry.driverId} className="flex items-center justify-between gap-3">
                            <span className="truncate">{entry.driverDisplayName}</span>
                            <span className="font-semibold">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Washout</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Date/Time</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Photos</TableHead>
                          <TableHead>Review</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {run.items.map((item) => (
                          <TableRow key={item.paymentId}>
                            <TableCell className="font-mono text-xs">{item.washoutId}</TableCell>
                            <TableCell>{item.driverDisplayName}</TableCell>
                            <TableCell>
                              <div className="space-y-0.5">
                                <div className="font-medium">{item.locationName}</div>
                                <div className="text-xs text-muted-foreground">{item.locationAddress}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{item.checkInTime}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(Number(item.amountCharged || 0))}</TableCell>
                            <TableCell>{statusBadge(item.paymentStatus)}</TableCell>
                            <TableCell>{item.photoCount}</TableCell>
                            <TableCell>{item.photoReviewStatus}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
