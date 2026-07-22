import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileNav } from "@/components/MobileNav";
import logoImage from "@assets/cretexchange logo_1760644229633.png";
import { ReportExplorer } from "@/components/ReportExplorer";
import { OWNER_REPORT_COLUMNS } from "@shared/reportColumns";
import type { ReportRow } from "@shared/reportTypes";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { formatLocalizedCurrency, formatLocalizedDate, useLanguage } from "@/lib/i18n";

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
  const { t, language } = useLanguage();
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
    if (!acc[key]) acc[key] = { label: formatLocalizedDate(date, language, { month: "short", year: "numeric" }), count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const configuredRates = locations.map((location) => {
    const rate = location?.rate;
    const cents = rate === null || rate === undefined || rate === "" ? null : resolveLocationDriverTipRateCents(rate);
    return {
      id: location?.id,
      name: location?.name || t("common.unknown"),
      cents: Number.isFinite(cents) ? cents : null,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">{t("owner.reports.locationActivity")}</h2>
            <p className="text-sm text-muted-foreground">{t("owner.reports.rewardEntryHelp")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">{t("owner.reports.rewardEntries")}</p><p className="mt-1 text-2xl font-semibold">{rewardEntryRows.length}</p></div>
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">{t("owner.reports.repeatDrivers")}</p><p className="mt-1 text-2xl font-semibold">{repeatDriverCount}</p></div>
            <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">{t("owner.reports.recentActivity")}</p><p className="mt-1 text-2xl font-semibold">{recentActivityCount}</p></div>
          </div>
          {locationSummaries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("owner.reports.noLocationActivity")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{t("common.locations")}</th><th className="px-3 py-2 font-medium">{t("owner.dashboard.activity")}</th><th className="px-3 py-2 font-medium">{t("common.approved")}</th><th className="px-3 py-2 font-medium">{t("owner.reports.rewardEntries")}</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {locationSummaries.slice(0, 8).map((location) => <tr key={location.name}><td className="px-3 py-2 font-medium">{location.name}</td><td className="px-3 py-2">{location.total}</td><td className="px-3 py-2">{location.approved}</td><td className="px-3 py-2">{location.rewards}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{topLocation ? t("owner.reports.topLocation", { name: topLocation.name, count: topLocation.approved }) : "—"}</p>
          {rewardMonths.length > 0 && <div className="flex flex-wrap gap-2">{rewardMonths.slice(0, 6).map((month) => <span key={month.label} className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{t("owner.reports.rewardMonth", { month: month.label, count: month.count })}</span>)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold">{t("owner.reports.configuredIncentives")}</h2>
            <p className="text-sm text-muted-foreground">{t("owner.reports.configuredIncentivesHelp")}</p>
          </div>
          {locationsLoading ? <p className="text-sm text-muted-foreground">{t("owner.reports.loadingConfiguration")}</p> : locationsError ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("owner.reports.configurationUnavailable")}</p> : configuredRates.length === 0 ? <p className="text-sm text-muted-foreground">{t("owner.reports.noConfiguration")}</p> : (
            <div className="space-y-2">
              {configuredRates.slice(0, 8).map((location) => <div key={location.id || location.name} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{location.name}</span><span className="shrink-0 text-sm text-muted-foreground">{location.cents === null ? "—" : formatLocalizedCurrency(location.cents / 100, language)}</span></div>)}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function OwnerReports() {
  const { t } = useLanguage();
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
            alt={t("owner.reports.title")}
            className="w-10 h-10 object-contain bg-white/20 rounded-full p-1"
          />
          <div>
            <h1 className="font-semibold text-lg">{t("owner.reports.title")}</h1>
            <p className="text-white/80 text-sm">{t("owner.reports.subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="p-4">
        <ReportExplorer
          title={t("owner.reports.reportTitle")}
          description={t("owner.reports.reportDescription")}
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
