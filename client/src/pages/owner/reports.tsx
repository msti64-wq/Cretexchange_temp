import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileNav } from "@/components/MobileNav";
import logoImage from "@assets/cretexchange logo_1760644229633.png";
import { ReportExplorer } from "@/components/ReportExplorer";
import { OWNER_REPORT_COLUMNS } from "@shared/reportColumns";
import type { ReportRow } from "@shared/reportTypes";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { formatCentsToDollars } from "@/lib/utils";

function activityStatusBucket(status: string): "approved" | "pending" | "rejected" {
  const normalized = status.toLowerCase();
  if (["verified", "approved", "completed"].includes(normalized)) return "approved";
  if (["rejected", "declined", "cancelled", "canceled"].includes(normalized)) return "rejected";
  return "pending";
}

function OwnerOperationalInsights({
  rows,
  locations,
  locationsLoading,
  locationsError,
}: {
  rows: ReportRow[];
  locations: any[];
  locationsLoading: boolean;
  locationsError: boolean;
}) {
  const approvedRows = rows.filter((row) => activityStatusBucket(row.washoutStatus) === "approved");
  const approvedByDriver = approvedRows.reduce<Record<string, number>>((acc, row) => {
    if (!row.driverId) return acc;
    acc[row.driverId] = (acc[row.driverId] || 0) + 1;
    return acc;
  }, {});
  const repeatDriverCount = Object.values(approvedByDriver).filter((count) => count > 1).length;
  const recentActivityCount = rows.filter((row) => {
    const time = new Date(row.checkInTime || 0).getTime();
    return Number.isFinite(time) && time >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;
  const rewardEntryRows = rows.filter((row) => Boolean(row.ticketNumber));
  const rewardEntryFieldAvailable = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "ticketNumber"));
  const locationActivity = rows.reduce<Record<string, { name: string; total: number; approved: number; rewards: number }>>((acc, row) => {
    const key = row.locationId || row.locationName || "unknown";
    if (!acc[key]) acc[key] = { name: row.locationName || "Unknown location", total: 0, approved: 0, rewards: 0 };
    acc[key].total += 1;
    if (activityStatusBucket(row.washoutStatus) === "approved") acc[key].approved += 1;
    if (row.ticketNumber) acc[key].rewards += 1;
    return acc;
  }, {});
  const locationSummaries = Object.values(locationActivity)
    .sort((left, right) => right.approved - left.approved || right.total - left.total || left.name.localeCompare(right.name));
  const topLocation = locationSummaries[0] || null;
  const rewardMonths = Object.values(rewardEntryRows.reduce<Record<string, { label: string; count: number }>>((acc, row) => {
    const date = new Date(row.checkInTime || 0);
    if (Number.isNaN(date.getTime())) return acc;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!acc[key]) acc[key] = { label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }), count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const configuredRates = locations.map((location) => {
    const rate = location?.rate;
    const cents = rate === null || rate === undefined || rate === "" ? null : resolveLocationDriverTipRateCents(rate);
    return {
      id: location?.id,
      name: location?.name || "Unnamed location",
      cents: Number.isFinite(cents) ? cents : null,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">Location Activity & Reward Entries</h2>
            <p className="text-sm text-muted-foreground">Reward entries are counted from existing ticket indicators only; ticket numbers are not shown to owners.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">Reward entries generated</p><p className="mt-1 text-2xl font-semibold">{rewardEntryRows.length}</p></div>
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">Repeat drivers</p><p className="mt-1 text-2xl font-semibold">{repeatDriverCount}</p></div>
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">Recent activity</p><p className="mt-1 text-2xl font-semibold">{recentActivityCount}</p></div>
          </div>
          {locationSummaries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No activity-by-location data matches the current report filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Location</th><th className="px-3 py-2 font-medium">Activity</th><th className="px-3 py-2 font-medium">Approved</th><th className="px-3 py-2 font-medium">Reward entries</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {locationSummaries.slice(0, 8).map((location) => <tr key={location.name}><td className="px-3 py-2 font-medium">{location.name}</td><td className="px-3 py-2">{location.total}</td><td className="px-3 py-2">{location.approved}</td><td className="px-3 py-2">{location.rewards}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Top location by approved activity: {topLocation ? `${topLocation.name} (${topLocation.approved})` : "—"}. {!rewardEntryFieldAvailable ? "Reward-entry indicators are unavailable in this report payload." : rewardMonths[0] ? `Most active reward-entry month: ${rewardMonths[0].label} (${rewardMonths[0].count}).` : "No reward-entry indicators in the selected range."}</p>
          {rewardMonths.length > 0 && <div className="flex flex-wrap gap-2">{rewardMonths.slice(0, 6).map((month) => <span key={month.label} className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{month.label}: {month.count}</span>)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">Configured Driver Incentives</h2>
            <p className="text-sm text-muted-foreground">Current location configuration only—not activity earnings, wallet value, payment, or settlement.</p>
          </div>
          {locationsLoading ? <p className="text-sm text-muted-foreground">Loading location configuration…</p> : locationsError ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Location configuration is temporarily unavailable. Activity reporting remains available.</p> : configuredRates.length === 0 ? <p className="text-sm text-muted-foreground">No location configuration is available.</p> : (
            <div className="space-y-2">
              {configuredRates.slice(0, 8).map((location) => <div key={location.id || location.name} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{location.name}</span><span className="shrink-0 text-sm text-muted-foreground">{location.cents === null ? "—" : formatCentsToDollars(location.cents)}</span></div>)}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function OwnerReports() {
  const { data: locationsData, isLoading: locationsLoading, isError: locationsError } = useQuery<any[]>({
    queryKey: ["/api/owners/locations"],
    retry: false,
  });
  const locationOptions = useMemo(() => (locationsData || []).map((location: any) => ({
    value: location.id,
    label: location.name || location.id,
  })).filter((option) => option.value), [locationsData]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center space-x-3">
          <img
            src={logoImage}
            alt="CreteXchange Logo"
            className="w-10 h-10 object-contain bg-white/20 rounded-full p-1"
          />
          <div>
            <h1 className="font-semibold text-lg">Owner Reports</h1>
            <p className="text-white/80 text-sm">Operational activity, location engagement, and reward-entry reporting</p>
          </div>
        </div>
      </header>

      <main className="p-4">
        <ReportExplorer
          title="Owner Report"
          description="Filter operational activity across your locations. Activity status is distinct from payment and settlement state."
          endpoint="/api/reports/owner"
          filenamePrefix="owner-report"
          defaultDateRange="weekly"
          columns={OWNER_REPORT_COLUMNS}
          showLocationFilter
          showPaymentStatusFilter={false}
          locationOptions={locationOptions}
          enableClientFilters
          summaryVariant="operational"
          renderInsights={(_, rows) => (
            <OwnerOperationalInsights
              rows={rows}
              locations={locationsData || []}
              locationsLoading={locationsLoading}
              locationsError={locationsError}
            />
          )}
        />
      </main>

      <MobileNav role="owner" />
    </div>
  );
}
