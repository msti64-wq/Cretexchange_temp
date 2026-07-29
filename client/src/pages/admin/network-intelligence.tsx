import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Building2, Globe2, ShieldCheck, Users } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";

type NetworkResponse = {
  window: { start: string; end: string; timezone: "UTC" };
  history: { effectiveAnalyticsStartAt: string | null; partialHistory: boolean };
  overview: Record<string, number>;
  engagement: Record<string, number | null>;
  quality: Record<string, number | null>;
  growth: Record<string, number | string | null>;
  adoption: Record<string, number | null>;
  trends: { monthly: Array<{ bucket: string; verifiedCount: number }> };
  geography: {
    dimension: "state";
    rows: Array<{ state: string; activeDrivers: number; activeFacilities: number; verifiedWashouts: number; newFacilities: number; repeatDriverRate: number | null; activeDriversPerActiveFacility: number | null }>;
    pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  };
  utilization: Record<string, number | boolean | null>;
};

function value(number: number | null | undefined) { return number == null ? "—" : Number.isInteger(number) ? number.toLocaleString() : number.toFixed(1); }
function percent(number: number | null | undefined) { return number == null ? "—" : `${Math.round(number * 100)}%`; }
function Metric({ label, value: metricValue }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{metricValue}</p></CardContent></Card>;
}

export default function NetworkIntelligence() {
  const { user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [days, setDays] = useState("30");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const query = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (Number(days) - 1) * 86_400_000);
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), page: String(page), pageSize: "10", sort: "verified", direction: "desc" });
    if (state.trim()) params.set("state", state.trim().toUpperCase());
    return params.toString();
  }, [days, page, state]);
  const network = useQuery<NetworkResponse>({
    queryKey: ["/api/admin/analytics/network/overview", query],
    queryFn: async () => (await apiRequest("GET", `/api/admin/analytics/network/overview?${query}`)).json(),
    retry: false,
  });
  const allowed = user?.role === "admin" || user?.role === "super_admin";
  if (!allowed) return <main className="p-6" role="alert">{t("network.accessRequired")}</main>;
  const data = network.data;
  const monthlyMax = Math.max(1, ...(data?.trends.monthly.map((item) => item.verifiedCount) || [1]));
  return <main className="min-h-screen bg-background pb-24">
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-primary">{t("network.eyebrow")}</p><h1 className="text-3xl font-semibold">{t("network.title")}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("network.description")}</p></div>
        <div className="flex gap-2" aria-label={t("language.toggle")}><Button size="sm" variant={language === "en" ? "default" : "outline"} onClick={() => setLanguage("en")}>EN</Button><Button size="sm" variant={language === "es" ? "default" : "outline"} onClick={() => setLanguage("es")}>ES</Button></div>
      </header>

      <Card><CardHeader><CardTitle>{t("network.filters")}</CardTitle><CardDescription>{t("network.filtersHelp")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span>{t("network.dateRange")}</span><select aria-label={t("network.dateRange")} className="h-10 rounded-md border bg-background px-3" value={days} onChange={(event) => { setDays(event.target.value); setPage(1); }}><option value="30">{t("network.last30")}</option><option value="90">{t("network.last90")}</option><option value="365">{t("network.last365")}</option></select></label>
        <label className="grid gap-1 text-sm"><span>{t("network.state")}</span><Input maxLength={2} aria-label={t("network.state")} value={state} onChange={(event) => { setState(event.target.value.replace(/[^a-z]/gi, "").slice(0, 2)); setPage(1); }} placeholder={t("network.allStates")} /></label>
      </CardContent></Card>

      {network.isLoading && <Card><CardContent className="p-8 text-sm text-muted-foreground">{t("network.loading")}</CardContent></Card>}
      {network.error && <Card><CardContent className="p-8 text-sm text-destructive" role="alert">{t("network.error")}</CardContent></Card>}
      {data && <>
        {data.history.partialHistory && <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-700 dark:text-amber-300">{t("network.partialHistory")}</CardContent></Card>}
        <section aria-label={t("network.overview")}><div className="mb-3 flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">{t("network.overview")}</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label={t("network.verified")} value={value(data.overview.totalVerifiedWashouts)} /><Metric label={t("network.activeDrivers")} value={value(data.overview.activeDrivers)} /><Metric label={t("network.activeFacilities")} value={value(data.overview.activeFacilities)} /><Metric label={t("network.newDrivers")} value={value(data.overview.newDrivers)} /><Metric label={t("network.newFacilities")} value={value(data.overview.newFacilities)} /><Metric label={t("network.repeatDriverRate")} value={percent(data.engagement.repeatDriverRate)} />
        </div></section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />{t("network.growth")}</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3"><Metric label={t("network.driverGrowth")} value={percent(data.growth.driverGrowth as number | null)} /><Metric label={t("network.facilityGrowth")} value={percent(data.growth.facilityGrowth as number | null)} /><Metric label={t("network.activityGrowth")} value={percent(data.growth.verifiedActivityGrowth as number | null)} /></div>
            {data.trends.monthly.length ? data.trends.monthly.map((item) => <div key={item.bucket}><div className="mb-1 flex justify-between text-xs"><span>{item.bucket}</span><span>{item.verifiedCount}</span></div><Progress value={(item.verifiedCount / monthlyMax) * 100} aria-label={`${item.bucket} ${t("network.verified")}`} /></div>) : <p className="text-sm text-muted-foreground">{t("network.empty")}</p>}
            {data.growth.yearOverYearStatus === "insufficient_history" && <p className="text-xs text-muted-foreground">{t("network.insufficientYoy")}</p>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{t("network.engagement")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label={t("network.perDriver")} value={value(data.engagement.averageVerifiedPerActiveDriver)} /><Metric label={t("network.perFacility")} value={value(data.engagement.averageVerifiedPerActiveFacility)} /><Metric label={t("network.driverFacilityRatio")} value={value(data.engagement.driverToFacilityRatio)} /><Metric label={t("network.activeRatio")} value={value(data.engagement.activeDriverToActiveFacilityRatio)} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{t("network.quality")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label={t("network.verificationRate")} value={percent(data.quality.verificationRate)} /><Metric label={t("network.rejectionRate")} value={percent(data.quality.rejectionRate)} /><Metric label={t("network.reviewRate")} value={percent(data.quality.administrativeReviewRate)} /><Metric label={t("network.completionRate")} value={percent(data.quality.journeyCompletionRate)} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />{t("network.adoption")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label={t("network.returningDrivers")} value={value(data.overview.returningDrivers)} /><Metric label={t("network.retainedDrivers")} value={value(data.overview.retainedDrivers)} /><Metric label={t("network.activatedDrivers")} value={value(data.adoption.activatedDrivers)} /><Metric label={t("network.recurringFacilities")} value={value(data.adoption.recurringFacilities)} />
          </CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{t("network.geography")}</CardTitle><CardDescription>{t("network.geographyHelp")}</CardDescription></CardHeader><CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>{t("network.state")}</TableHead><TableHead>{t("network.activeDrivers")}</TableHead><TableHead>{t("network.activeFacilities")}</TableHead><TableHead>{t("network.verified")}</TableHead><TableHead>{t("network.repeatDriverRate")}</TableHead><TableHead>{t("network.density")}</TableHead></TableRow></TableHeader><TableBody>
            {data.geography.rows.length ? data.geography.rows.map((row) => <TableRow key={row.state}><TableCell className="font-medium">{row.state}</TableCell><TableCell>{row.activeDrivers}</TableCell><TableCell>{row.activeFacilities}</TableCell><TableCell>{row.verifiedWashouts}</TableCell><TableCell>{percent(row.repeatDriverRate)}</TableCell><TableCell>{value(row.activeDriversPerActiveFacility)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t("network.empty")}</TableCell></TableRow>}</TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">{t("network.page")} {data.geography.pagination.page} / {data.geography.pagination.totalPages}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("network.previous")}</Button><Button size="sm" variant="outline" disabled={page >= data.geography.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>{t("network.next")}</Button></div></div>
        </CardContent></Card>
        <p className="text-xs text-muted-foreground">{t("network.capacityLimit")}</p>
      </>}
    </div><MobileNav role={user?.role as "admin" | "super_admin"} />
  </main>;
}
