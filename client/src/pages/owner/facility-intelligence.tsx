import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { OwnerHeader } from "@/components/OwnerHeader";
import { MobileNav } from "@/components/MobileNav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

type WindowOption = "30" | "90";
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

const indicatorCopy: Record<string, string> = {
  profile_incomplete: "Complete the facility owner profile to strengthen operational readiness.",
  operating_hours_missing: "Add operating hours so drivers can plan reliable visits.",
  verification_rate_low: "Review submitted evidence promptly and consistently to improve verification quality.",
  administrative_review_rate_high: "Review rejection reasons for patterns that are creating additional support work.",
  operational_data_healthy: "Your selected-period operational indicators are healthy.",
};

function percent(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function duration(value: number | null) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function healthLabel(health: Intelligence["health"]) {
  if (health.state === "insufficient_data") return "Building baseline";
  return health.state === "strong" ? "Strong" : health.state === "stable" ? "Stable" : "Needs attention";
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function JourneyCard({ title, description, journey }: { title: string; description: string; journey: Journey }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Conversion" value={percent(journey.conversionRate)} /><MetricCard label="Abandonment" value={percent(journey.abandonmentRate)} /><MetricCard label="Average duration" value={duration(journey.averageDurationMs)} /><MetricCard label="Median duration" value={duration(journey.medianDurationMs)} /></div>
    <div className="space-y-2" aria-label={`${title} stages`}>{journey.stages.map((stage) => <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm" key={stage.key}><span>{stage.name}{stage.optional ? " (when requested)" : ""}</span><span className="font-medium tabular-nums">{stage.reachedCount} · {percent(stage.conversionFromPrevious)}</span></div>)}</div>
  </CardContent></Card>;
}

export default function OwnerFacilityIntelligence() {
  const [range, setRange] = useState<WindowOption>("30");
  const [trendPeriod, setTrendPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const { data: locations = [], isLoading: locationsLoading } = useQuery<FacilityLocation[]>({ queryKey: ["/api/owners/locations"], queryFn: async () => (await apiRequest("GET", "/api/owners/locations")).json() });
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>();
  const locationId = selectedLocation || locations[0]?.id;
  const query = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - Number(range) * 86_400_000);
    return locationId ? `/api/owners/facilities/${locationId}/intelligence/dashboard?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}` : null;
  }, [locationId, range]);
  const { data, isLoading, isError } = useQuery<Intelligence>({ queryKey: [query], enabled: Boolean(query), queryFn: async () => (await apiRequest("GET", query!)).json() });
  const trendData = data ? trendPeriod === "daily" ? data.trends.dailyActivity : trendPeriod === "weekly" ? data.trends.weeklyActivity : data.trends.monthlyActivity : [];

  return <div className="min-h-screen bg-background pb-24"><OwnerHeader /><main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-primary"><BarChart3 className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Facility Intelligence</span></div><h2 className="mt-2 text-3xl font-semibold tracking-tight">Operational insight for your facility</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use actual, facility-scoped events to understand activity, operational quality, and where drivers leave the journey.</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><Select value={locationId} onValueChange={setSelectedLocation} disabled={locationsLoading || !locations.length}><SelectTrigger aria-label="Facility"><SelectValue placeholder="Select facility" /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select><Select value={range} onValueChange={(value) => setRange(value as WindowOption)}><SelectTrigger aria-label="Date range"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select></div></div>
    {!locationId && !locationsLoading && <Card><CardContent className="p-6 text-sm text-muted-foreground">Add a facility before viewing facility intelligence.</CardContent></Card>}
    {(isLoading || locationsLoading) && <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>}
    {isError && <Card><CardContent className="p-6 text-sm text-destructive">Facility intelligence could not be loaded. Please try again.</CardContent></Card>}
    {data && <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Facility overview"><MetricCard label="Verified washouts" value={data.overview.verifiedCount} /><MetricCard label="Submitted washouts" value={data.overview.submittedCount} /><MetricCard label="Rejected washouts" value={data.overview.rejectedCount} /><MetricCard label="Administrative Reviews" value={data.overview.administrativeReviewCount} /><MetricCard label="Active drivers" value={data.overview.activeDriverCount} /><MetricCard label="Repeat drivers" value={data.overview.repeatDriverCount} detail={percent(data.overview.repeatDriverPercentage)} /></section>
      <section className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]"><Card><CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Operational trends</CardTitle><CardDescription>Submitted, verified, and rejected activity from the same event stream.</CardDescription></div><Select value={trendPeriod} onValueChange={(value) => setTrendPeriod(value as "daily" | "weekly" | "monthly")}><SelectTrigger className="w-32" aria-label="Trend period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" hide /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="submittedCount" name="Submitted" stroke="#0ea5e9" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="verifiedCount" name="Verified" stroke="#22c55e" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="rejectedCount" name="Rejected" stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card><Card><CardHeader><CardTitle>Facility health</CardTitle><CardDescription>Operational readiness is calculated from actual facility activity and profile data.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-4"><div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary text-2xl font-semibold">{data.health.score ?? "—"}</div><div><Badge variant={data.health.state === "needs_attention" ? "destructive" : "secondary"}>{healthLabel(data.health)}</Badge><p className="mt-2 text-sm text-muted-foreground">Verification {percent(data.facility.verificationRate)} · Rejection {percent(data.facility.rejectionRate)}</p></div></div><div className="mt-5 space-y-2">{data.indicators.map((indicator) => <div className="flex gap-2 rounded-md border p-3 text-sm" key={indicator.code}>{indicator.severity === "attention" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}<span>{indicatorCopy[indicator.code] || indicator.code}</span></div>)}</div></CardContent></Card></section>
      <section className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Driver intelligence</CardTitle><CardDescription>Top drivers are limited to this facility and show only an operational display name.</CardDescription></CardHeader><CardContent>{data.drivers.length ? <div className="space-y-2">{data.drivers.map((driver) => <div key={driver.driverId} className="flex items-center justify-between rounded-md border px-3 py-2"><div><p className="font-medium">{driver.displayName}</p><p className="text-xs text-muted-foreground">{driver.classification === "new_to_facility" ? "New to this facility" : "Returning driver"}</p></div><span className="text-sm font-semibold tabular-nums">{driver.submittedCount} submitted</span></div>)}</div> : <p className="text-sm text-muted-foreground">No submitted driver activity in this period.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Facility operations</CardTitle><CardDescription>Peak periods and average volume are based only on submitted activity.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-3 gap-3"><MetricCard label="Average daily volume" value={data.facility.averageDailyVolume.toFixed(1)} /><MetricCard label="Peak hours" value={data.facility.peakOperatingHours.map((entry) => entry.label).join(", ") || "—"} /><MetricCard label="Peak days" value={data.facility.peakOperatingDays.map((entry) => entry.label).join(", ") || "—"} /></div><div className="h-32"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.facility.peakOperatingHours}><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="volume" name="Submitted activity" fill="#0ea5e9" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card></section>
      <section className="space-y-4"><div><h3 className="text-xl font-semibold">Drop-off intelligence</h3><p className="mt-1 text-sm text-muted-foreground">Conversion, abandonment, and duration are calculated from recorded platform events only; no stage is estimated.</p></div><div className="grid gap-4 xl:grid-cols-2"><JourneyCard title="Driver journey at this facility" description="A cohort of drivers who submitted at this facility in the selected period. Activity stages are limited to this facility." journey={data.dropoff.driverJourney} /><JourneyCard title="Washout journey" description="From check-in through owner review and final verification, with Administrative Review shown only when requested." journey={data.dropoff.washoutJourney} /></div></section>
    </>}
  </main><MobileNav role="owner" /></div>;
}
