import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronLeft, ChevronRight, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

type ReportKind = "driver" | "facility";
type DateRange = "today" | "last_7_days" | "last_30_days" | "current_month" | "previous_month" | "current_year" | "custom";
type Sort = "verified" | "total" | "most_recent" | "name" | "unique_drivers";

type ActivityReportRow = {
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
};

type ActivityReport = {
  reportType: ReportKind;
  generatedAt: string;
  dateRange: { label: string; timezoneLabel: string };
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
  rows: ActivityReportRow[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
};

const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "current_month", label: "Current month" },
  { value: "previous_month", label: "Previous month" },
  { value: "current_year", label: "Current year" },
  { value: "custom", label: "Custom range" },
];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}

export default function AdminReports() {
  const { user } = useAuth();
  const [kind, setKind] = useState<ReportKind>("driver");
  const [dateRange, setDateRange] = useState<DateRange>("last_30_days");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [driver, setDriver] = useState("");
  const [facility, setFacility] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("verified");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [exportError, setExportError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ dateRange, page: String(page), pageSize: "25", sort, direction });
    if (dateRange === "custom") { if (startDate) query.set("startDate", startDate); if (endDate) query.set("endDate", endDate); }
    if (status) query.set("status", status);
    if (driver.trim()) query.set("driver", driver.trim());
    if (facility.trim()) query.set("facility", facility.trim());
    if (owner.trim()) query.set("owner", owner.trim());
    return query.toString();
  }, [dateRange, direction, driver, endDate, facility, owner, page, sort, startDate, status]);

  const endpoint = `/api/admin/activity-reports/${kind === "driver" ? "drivers" : "facilities"}`;
  const report = useQuery<ActivityReport>({
    queryKey: [endpoint, queryString],
    queryFn: async () => (await apiRequest("GET", `${endpoint}?${queryString}`)).json(),
    retry: false,
  });

  function resetPage() { setPage(1); }
  function updateKind(next: ReportKind) {
    setKind(next);
    if (next === "driver") setOwner("");
    else setDriver("");
    setPage(1);
    setSort("verified");
    setDirection("desc");
  }
  function updateSort(next: Sort) {
    if (sort === next) setDirection((value) => value === "desc" ? "asc" : "desc");
    else { setSort(next); setDirection(next === "name" ? "asc" : "desc"); }
    setPage(1);
  }
  async function downloadCsv() {
    try {
      setExportError(null);
      const response = await apiRequest("GET", `${endpoint}?${queryString}&format=csv`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind}-activity-report.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export the report.");
    }
  }

  const summary = report.data?.summary;
  const rows = report.data?.rows || [];
  const canAccess = user?.role === "admin" || user?.role === "super_admin";
  const sortButton = (label: string, value: Sort) => <Button variant="ghost" className="h-auto p-0 text-left font-medium" onClick={() => updateSort(value)} aria-label={`Sort by ${label}`}><span>{label}</span><ArrowDownUp className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Button>;

  if (!canAccess) return <main className="p-6" role="alert">Admin access is required to view activity reports.</main>;

  return <main className="min-h-screen bg-background pb-24"><div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-primary">Platform operations</p><h1 className="text-3xl font-semibold">Activity Reports</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Server-side operational reporting for canonical pending, verified, and rejected activity. Administrative Review counts represent unique activities with an open facilitator review; they are not additional washouts.</p></div><Button variant="outline" onClick={downloadCsv} disabled={report.isLoading}><Download className="mr-2 h-4 w-4" />Export CSV</Button></header>

    <div className="flex flex-wrap gap-2"><Button variant={kind === "driver" ? "default" : "outline"} onClick={() => updateKind("driver")}>Driver Activity</Button><Button variant={kind === "facility" ? "default" : "outline"} onClick={() => updateKind("facility")}>Facility Activity</Button></div>

    <Card><CardHeader><CardTitle>Filters</CardTitle><CardDescription>Date ranges use the application server’s local-time policy. All-time reporting is intentionally unavailable until a query plan proves it remains safely bounded.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm"><span>Date range</span><select aria-label="Date range" className="h-10 rounded-md border bg-background px-3" value={dateRange} onChange={(event) => { setDateRange(event.target.value as DateRange); resetPage(); }}>{DATE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>Status</span><select aria-label="Status" className="h-10 rounded-md border bg-background px-3" value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}><option value="">All statuses</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></label>
      {kind === "driver" && <label className="grid gap-1 text-sm"><span>Driver</span><Input aria-label="Driver filter" value={driver} onChange={(event) => { setDriver(event.target.value); resetPage(); }} placeholder="Name, truck, or safe reference" /></label>}
      <label className="grid gap-1 text-sm"><span>Facility</span><Input aria-label="Facility filter" value={facility} onChange={(event) => { setFacility(event.target.value); resetPage(); }} placeholder="Name or safe reference" /></label>
      {kind === "facility" && <label className="grid gap-1 text-sm"><span>Facility Owner</span><Input aria-label="Facility owner filter" value={owner} onChange={(event) => { setOwner(event.target.value); resetPage(); }} placeholder="Company, name, or safe reference" /></label>}
      {dateRange === "custom" && <><label className="grid gap-1 text-sm"><span>Start date</span><Input aria-label="Start date" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); resetPage(); }} /></label><label className="grid gap-1 text-sm"><span>End date</span><Input aria-label="End date" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); resetPage(); }} /></label></>}
    </CardContent></Card>

    {exportError && <p className="text-sm text-destructive" role="alert">{exportError}</p>}
    {report.error && <p className="text-sm text-destructive" role="alert">{report.error instanceof Error ? report.error.message : "Unable to load the report."}</p>}

    <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <Metric label="Total records" value={summary?.totalActivityCount ?? "—"} /><Metric label="Verified" value={summary?.verifiedCount ?? "—"} /><Metric label="Pending" value={summary?.pendingCount ?? "—"} /><Metric label="Rejected" value={summary?.rejectedCount ?? "—"} /><Metric label="Administrative Review" value={summary?.adminReviewCount ?? "—"} />
      {kind === "driver" ? <><Metric label="Active drivers" value={summary?.uniqueActiveDriverCount ?? "—"} /><Metric label="Avg. verified / active" value={summary ? (summary.averageVerifiedPerActiveDriver || 0).toFixed(1) : "—"} /></> : <><Metric label="Active facilities" value={summary?.uniqueFacilityCount ?? "—"} /><Metric label="Unique drivers" value={summary?.uniqueActiveDriverCount ?? "—"} /><Metric label="Avg. verified / facility" value={summary ? (summary.averageVerifiedPerFacility || 0).toFixed(1) : "—"} /></>}
    </section>

    <Card><CardHeader><CardTitle>{kind === "driver" ? "Driver activity" : "Facility activity"}</CardTitle><CardDescription>{report.data ? `${report.data.dateRange.label} · ${report.data.dateRange.timezoneLabel} · ${report.data.pagination.totalRows} grouped result${report.data.pagination.totalRows === 1 ? "" : "s"}` : "Loading report…"}</CardDescription></CardHeader><CardContent className="overflow-x-auto">
      <Table><TableHeader><TableRow><TableHead>{sortButton(kind === "driver" ? "Driver" : "Facility", "name")}</TableHead>{kind === "facility" && <TableHead>Facility Owner</TableHead>}<TableHead>Reference</TableHead><TableHead>{sortButton("Total", "total")}</TableHead><TableHead>{sortButton("Verified", "verified")}</TableHead><TableHead>Pending</TableHead><TableHead>Rejected</TableHead><TableHead>Administrative Review</TableHead>{kind === "facility" && <TableHead>{sortButton("Distinct drivers", "unique_drivers")}</TableHead>}<TableHead>First activity</TableHead><TableHead>{sortButton("Latest activity", "most_recent")}</TableHead></TableRow></TableHeader>
      <TableBody>{report.isLoading ? <TableRow><TableCell colSpan={kind === "driver" ? 9 : 11} className="py-12 text-center text-muted-foreground">Loading activity report…</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={kind === "driver" ? 9 : 11} className="py-12 text-center text-muted-foreground">No activity matches these filters.</TableCell></TableRow> : rows.map((row) => <TableRow key={`${kind}-${row.reference}`}><TableCell className="font-medium">{row.name}</TableCell>{kind === "facility" && <TableCell>{row.ownerName}</TableCell>}<TableCell><Badge variant="outline" className="font-mono">{row.reference}</Badge></TableCell><TableCell>{row.totalCount}</TableCell><TableCell>{row.verifiedCount}</TableCell><TableCell>{row.pendingCount}</TableCell><TableCell>{row.rejectedCount}</TableCell><TableCell>{row.adminReviewCount}</TableCell>{kind === "facility" && <TableCell>{row.uniqueDriverCount}</TableCell>}<TableCell className="whitespace-nowrap text-sm">{formatDate(row.firstActivityAt)}</TableCell><TableCell className="whitespace-nowrap text-sm">{formatDate(row.latestActivityAt)}</TableCell></TableRow>)}</TableBody>
      </Table>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Page {report.data?.pagination.page || 1} of {Math.max(1, report.data?.pagination.totalPages || 1)}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!report.data || report.data.pagination.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={!report.data || report.data.pagination.page >= report.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </CardContent></Card>
  </div><MobileNav role={user?.role as "admin" | "super_admin"} /></main>;
}
