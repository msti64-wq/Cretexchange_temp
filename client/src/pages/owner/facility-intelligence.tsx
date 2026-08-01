import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BarChart3, CheckCircle2, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { OwnerHeader } from "@/components/OwnerHeader";
import { MobileNav } from "@/components/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import {
  ownerFacilityIntelligenceQueryKey,
  ownerFacilityIntelligenceRequest,
  type OwnerFacilityIntelligenceWindow,
} from "@/lib/ownerFacilityIntelligenceQuery";
import {
  ownerFacilityIntelligencePath,
  ownerFacilitySelectionStorageKey,
  parseOwnerFacilityUrlSelection,
  resolveOwnerFacilitySelection,
} from "@/lib/ownerFacilityIntelligenceSelection";
import { apiRequest } from "@/lib/queryClient";

type FacilityLocation = { id: string; name: string };
type Journey = { entryCount: number; exitCount: number; conversionRate: number | null; abandonmentRate: number | null; averageDurationMs: number | null; medianDurationMs: number | null; stages: Array<{ key: string; name: string; reachedCount: number; conversionFromPrevious: number | null; abandonmentFromPrevious: number | null; optional: boolean }> };
type Intelligence = {
  overview: { submittedCount: number; verifiedCount: number; rejectedCount: number; administrativeReviewCount: number; activeDriverCount: number; repeatDriverCount: number; verificationRate: number | null; rejectionRate: number | null; repeatDriverPercentage: number | null };
  trends: { dailyActivity: Array<{ bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number }>; weeklyActivity: Array<{ bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number }>; monthlyActivity: Array<{ bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number }> };
  drivers: Array<{ driverId: string; displayName: string; submittedCount: number; classification: "new_to_facility" | "returning"; latestActivityAt: string | null }>;
  facility: { peakOperatingHours: Array<{ label: string; volume: number }>; peakOperatingDays: Array<{ label: string; volume: number }>; averageDailyVolume: number; verificationRate: number | null; rejectionRate: number | null };
  health: { score: number | null; state: "insufficient_data" | "needs_attention" | "stable" | "strong" };
  indicators: Array<{ code: string; severity: "attention" | "info" }>;
  dropoff: { driverJourney: Journey; washoutJourney: Journey };
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function duration(value: number | null, t: Translate) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60_000);
  return minutes < 60
    ? t("owner.intelligence.durationMinutes", { minutes })
    : t("owner.intelligence.durationHoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function healthLabel(health: Intelligence["health"], t: Translate) {
  return t(`owner.intelligence.health.${health.state}`);
}

function stageLabel(stage: Journey["stages"][number], t: Translate) {
  const key = `owner.intelligence.stage.${stage.key}`;
  const translated = t(key);
  return translated === key ? stage.name : translated;
}

function dayLabel(label: string, t: Translate) {
  const normalized = label.trim().toLowerCase();
  const key = `owner.intelligence.weekday.${normalized}`;
  const translated = t(key);
  return translated === key ? label : translated;
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function JourneyCard({ title, description, journey, t }: { title: string; description: string; journey: Journey; t: Translate }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label={t("owner.intelligence.conversion")} value={percent(journey.conversionRate)} /><MetricCard label={t("owner.intelligence.abandonment")} value={percent(journey.abandonmentRate)} /><MetricCard label={t("owner.intelligence.averageDuration")} value={duration(journey.averageDurationMs, t)} /><MetricCard label={t("owner.intelligence.medianDuration")} value={duration(journey.medianDurationMs, t)} /></div>
    <div className="space-y-2" aria-label={t("owner.intelligence.journeyStagesAria", { journey: title })}>{journey.stages.map((stage) => <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm" key={stage.key}><span>{stageLabel(stage, t)}{stage.optional ? ` ${t("owner.intelligence.whenRequested")}` : ""}</span><span className="font-medium tabular-nums">{stage.reachedCount} · {percent(stage.conversionFromPrevious)}</span></div>)}</div>
  </CardContent></Card>;
}

export default function OwnerFacilityIntelligence() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [currentPath, setLocation] = useLocation();
  const [range, setRange] = useState<OwnerFacilityIntelligenceWindow>("30");
  const [trendPeriod, setTrendPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const locationsQuery = useQuery<FacilityLocation[]>({ queryKey: ["/api/owners/locations"], queryFn: async () => (await apiRequest("GET", "/api/owners/locations")).json() });
  const locations = locationsQuery.data || [];
  const locationsLoading = locationsQuery.isLoading;
  const storageKey = user?.id ? ownerFacilitySelectionStorageKey(user.id) : null;
  const [storedFacilityId, setStoredFacilityId] = useState<string | null>(() => {
    if (!user?.id || typeof window === "undefined") return null;
    return window.localStorage.getItem(ownerFacilitySelectionStorageKey(user.id));
  });
  const urlSelection = useMemo(() => parseOwnerFacilityUrlSelection(currentPath), [currentPath]);
  const selection = useMemo(() => resolveOwnerFacilitySelection({
    facilityIds: locations.map((location) => location.id),
    urlSelection,
    storedFacilityId,
  }), [locations, storedFacilityId, urlSelection]);
  const locationId = selection.state === "selected" ? selection.facilityId : null;

  useEffect(() => {
    if (!storageKey || locationsLoading || locationsQuery.isError || typeof window === "undefined") return;
    const storedIsOwned = Boolean(storedFacilityId && locations.some((location) => location.id === storedFacilityId));
    if (storedFacilityId && !storedIsOwned) {
      window.localStorage.removeItem(storageKey);
      setStoredFacilityId(null);
      return;
    }
    if (selection.state !== "selected") return;
    if (storedFacilityId !== selection.facilityId) {
      window.localStorage.setItem(storageKey, selection.facilityId);
      setStoredFacilityId(selection.facilityId);
    }
    if (selection.source !== "url") {
      setLocation(ownerFacilityIntelligencePath(selection.facilityId), { replace: true });
    }
  }, [locations, locationsLoading, locationsQuery.isError, selection, setLocation, storageKey, storedFacilityId]);

  const selectFacility = (facilityId: string) => {
    if (!locations.some((location) => location.id === facilityId)) return;
    if (storageKey && typeof window !== "undefined") window.localStorage.setItem(storageKey, facilityId);
    setStoredFacilityId(facilityId);
    setTrendPeriod("daily");
    setLocation(ownerFacilityIntelligencePath(facilityId));
  };

  const intelligence = useQuery<Intelligence>({
    queryKey: ownerFacilityIntelligenceQueryKey(locationId || "unselected", range),
    enabled: Boolean(locationId),
    queryFn: async () => (await apiRequest("GET", ownerFacilityIntelligenceRequest(locationId!, range))).json(),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const data = intelligence.data;
  const trendData = data ? trendPeriod === "daily" ? data.trends.dailyActivity : trendPeriod === "weekly" ? data.trends.weeklyActivity : data.trends.monthlyActivity : [];
  const indicatorCopy = (code: string) => {
    const key = `owner.intelligence.indicator.${code}`;
    const translated = t(key);
    return translated === key ? t("owner.intelligence.indicator.unknown") : translated;
  };

  return <div className="min-h-screen bg-background pb-24"><OwnerHeader /><main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <span className="sr-only" role="status" aria-live="polite">{intelligence.isFetching ? t("owner.intelligence.refreshing") : ""}</span>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-primary"><BarChart3 className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">{t("owner.intelligence.eyebrow")}</span></div><h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("owner.intelligence.title")}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("owner.intelligence.description")}</p></div><div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2"><div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">{t("owner.intelligence.facilitySelectorLabel")}</span><Select value={locationId || ""} onValueChange={selectFacility} disabled={locationsLoading || locationsQuery.isError || !locations.length}><SelectTrigger className="w-full sm:w-64" aria-label={t("owner.intelligence.facilityAria")} data-testid="facility-intelligence-selector"><SelectValue placeholder={t("owner.intelligence.selectFacility")} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">{t("owner.intelligence.dateRangeAria")}</span><Select value={range} onValueChange={(value) => setRange(value as OwnerFacilityIntelligenceWindow)} disabled={!locationId}><SelectTrigger aria-label={t("owner.intelligence.dateRangeAria")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">{t("owner.intelligence.last30")}</SelectItem><SelectItem value="90">{t("owner.intelligence.last90")}</SelectItem></SelectContent></Select></div><p className="text-xs text-muted-foreground sm:col-span-2">{t("owner.intelligence.selectionScope")}</p></div></div>
    {locationsQuery.isError && <Card data-testid="facility-intelligence-unavailable"><CardContent className="space-y-3 p-6 text-sm"><div><p className="font-semibold text-destructive" role="alert">{t("owner.intelligence.facilityUnavailable")}</p><p className="mt-1 text-muted-foreground">{t("owner.intelligence.facilityUnavailableDescription")}</p></div><Button type="button" variant="outline" onClick={() => void locationsQuery.refetch()} aria-label={t("owner.intelligence.retryFacilitiesAria")}>{t("common.retry")}</Button></CardContent></Card>}
    {!locationsLoading && !locationsQuery.isError && selection.state === "empty" && <Card data-testid="facility-intelligence-empty"><CardContent className="p-6 text-sm text-muted-foreground">{t("owner.intelligence.noFacility")}</CardContent></Card>}
    {!locationsLoading && !locationsQuery.isError && selection.state === "required" && <Card data-testid="facility-intelligence-selection-required"><CardContent className="space-y-1 p-6 text-sm"><p className="font-semibold">{t("owner.intelligence.noFacilitySelected")}</p><p className="text-muted-foreground">{t("owner.intelligence.selectFacilityDescription")}</p></CardContent></Card>}
    {!locationsLoading && !locationsQuery.isError && selection.state === "invalid" && <Card data-testid="facility-intelligence-invalid"><CardContent className="space-y-1 p-6 text-sm"><p className="font-semibold text-destructive" role="alert">{t("owner.intelligence.invalidFacility")}</p><p className="text-muted-foreground">{t("owner.intelligence.invalidFacilityDescription")}</p></CardContent></Card>}
    {(intelligence.isLoading || locationsLoading) && <div className="grid gap-4 sm:grid-cols-3" role="status" aria-label={t("owner.intelligence.loading")}><span className="sr-only">{t("owner.intelligence.loading")}</span>{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>}
    {locationId && intelligence.isError && <Card><CardContent className="space-y-3 p-6 text-sm"><p className="text-destructive" role="alert">{t("owner.intelligence.error")}</p><Button type="button" variant="outline" onClick={() => void intelligence.refetch()} aria-label={t("owner.intelligence.retryAria")}>{t("common.retry")}</Button></CardContent></Card>}
    {data && <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("owner.intelligence.overviewAria")}><MetricCard label={t("owner.intelligence.verifiedActivities")} value={data.overview.verifiedCount} /><MetricCard label={t("owner.intelligence.submittedActivities")} value={data.overview.submittedCount} /><MetricCard label={t("owner.intelligence.rejectedActivities")} value={data.overview.rejectedCount} /><MetricCard label={t("owner.intelligence.administrativeReviews")} value={data.overview.administrativeReviewCount} /><MetricCard label={t("owner.intelligence.activeDrivers")} value={data.overview.activeDriverCount} /><MetricCard label={t("owner.intelligence.repeatDrivers")} value={data.overview.repeatDriverCount} detail={percent(data.overview.repeatDriverPercentage)} /></section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]"><Card><CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>{t("owner.intelligence.operationalTrends")}</CardTitle><CardDescription>{t("owner.intelligence.operationalTrendsDescription")}</CardDescription></div><Select value={trendPeriod} onValueChange={(value) => setTrendPeriod(value as "daily" | "weekly" | "monthly")}><SelectTrigger className="w-32" aria-label={t("owner.intelligence.trendPeriodAria")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">{t("owner.intelligence.daily")}</SelectItem><SelectItem value="weekly">{t("owner.intelligence.weekly")}</SelectItem><SelectItem value="monthly">{t("owner.intelligence.monthly")}</SelectItem></SelectContent></Select></CardHeader><CardContent>{trendData.length ? <div className="h-72" role="img" aria-label={t("owner.intelligence.trendChartAria")}><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" hide /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="submittedCount" name={t("owner.intelligence.submitted")} stroke="#0ea5e9" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="verifiedCount" name={t("owner.intelligence.verified")} stroke="#22c55e" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="rejectedCount" name={t("owner.intelligence.rejected")} stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="py-12 text-center text-sm text-muted-foreground">{t("owner.intelligence.noTrendData")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{t("owner.intelligence.facilityHealth")}</CardTitle><CardDescription>{t("owner.intelligence.facilityHealthDescription")}</CardDescription></CardHeader><CardContent><div className="flex items-center gap-4"><div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary text-2xl font-semibold" aria-label={t("owner.intelligence.healthScoreAria", { score: data.health.score ?? t("owner.intelligence.unavailable") })}>{data.health.score ?? "—"}</div><div><Badge variant={data.health.state === "needs_attention" ? "destructive" : "secondary"}>{healthLabel(data.health, t)}</Badge><p className="mt-2 text-sm text-muted-foreground">{t("owner.intelligence.rates", { verification: percent(data.facility.verificationRate), rejection: percent(data.facility.rejectionRate) })}</p></div></div><div className="mt-5 space-y-2" aria-label={t("owner.intelligence.indicatorsAria")}>{data.indicators.map((indicator) => <div className="flex gap-2 rounded-md border p-3 text-sm" key={indicator.code}>{indicator.severity === "attention" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />}<span>{indicatorCopy(indicator.code)}</span></div>)}</div></CardContent></Card></section>
      <section className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{t("owner.intelligence.driverIntelligence")}</CardTitle><CardDescription>{t("owner.intelligence.driverIntelligenceDescription")}</CardDescription></CardHeader><CardContent>{data.drivers.length ? <div className="space-y-2">{data.drivers.map((driver) => <div key={driver.driverId} className="flex items-center justify-between rounded-md border px-3 py-2"><div><p className="font-medium">{driver.displayName}</p><p className="text-xs text-muted-foreground">{driver.classification === "new_to_facility" ? t("owner.intelligence.newDriver") : t("owner.intelligence.returningDriver")}</p></div><span className="text-sm font-semibold tabular-nums">{t("owner.intelligence.submittedCount", { count: driver.submittedCount })}</span></div>)}</div> : <p className="text-sm text-muted-foreground">{t("owner.intelligence.noDriverActivity")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{t("owner.intelligence.facilityOperations")}</CardTitle><CardDescription>{t("owner.intelligence.facilityOperationsDescription")}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><MetricCard label={t("owner.intelligence.averageDailyVolume")} value={data.facility.averageDailyVolume.toFixed(1)} /><MetricCard label={t("owner.intelligence.peakHours")} value={data.facility.peakOperatingHours.map((entry) => entry.label).join(", ") || "—"} /><MetricCard label={t("owner.intelligence.peakDays")} value={data.facility.peakOperatingDays.map((entry) => dayLabel(entry.label, t)).join(", ") || "—"} /></div>{data.facility.peakOperatingHours.length ? <div className="h-32" role="img" aria-label={t("owner.intelligence.volumeChartAria")}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.facility.peakOperatingHours}><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="volume" name={t("owner.intelligence.submittedActivity")} fill="#0ea5e9" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-6 text-center text-sm text-muted-foreground">{t("owner.intelligence.noVolumeData")}</p>}</CardContent></Card></section>
      <section className="space-y-4"><div><h3 className="text-xl font-semibold">{t("owner.intelligence.dropoff")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("owner.intelligence.dropoffDescription")}</p></div><div className="grid gap-4 xl:grid-cols-2"><JourneyCard title={t("owner.intelligence.driverJourney")} description={t("owner.intelligence.driverJourneyDescription")} journey={data.dropoff.driverJourney} t={t} /><JourneyCard title={t("owner.intelligence.recoveryJourney")} description={t("owner.intelligence.recoveryJourneyDescription")} journey={data.dropoff.washoutJourney} t={t} /></div></section>
    </>}
  </main><MobileNav role="owner" /></div>;
}
