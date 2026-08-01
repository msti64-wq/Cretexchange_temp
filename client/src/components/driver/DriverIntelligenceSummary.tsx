import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, CalendarDays, CheckCircle2, MapPin, Route } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";

type WindowOption = "30" | "90";
type TrendPeriod = "daily" | "weekly" | "monthly";
type Trend = Array<{ bucket: string; submittedCount: number; verifiedCount: number; rejectedCount: number }>;
type DriverIntelligence = {
  activity: { lifetimeVerifiedWashouts: number; verifiedThisYear: number; verifiedThisMonth: number; verifiedThisWeek: number; verifiedToday: number };
  performance: { verificationRate: number | null; administrativeReviewRate: number | null; rejectionRate: number | null; averageWashoutsPerActiveDay: number | null };
  history: { firstVerifiedWashoutAt: string | null; mostRecentVerifiedWashoutAt: string | null; consecutiveActiveDays: number; longestActivityStreak: number };
  facility: { favoriteFacility: { id: string; name: string; submittedCount: number } | null; facilitiesVisited: number; mostActiveDayOfWeek: string | null; mostActiveHour: string | null };
  trends: { dailyActivity: Trend; weeklyActivity: Trend; monthlyActivity: Trend };
  journey: { checkInToUploadRate: number | null; uploadToVerificationRate: number | null; overallCompletionRate: number | null; averageCompletionDurationMs: number | null; medianCompletionDurationMs: number | null };
};
type DriverAchievement = {
  id: string;
  category: "verified_washouts" | "consistency" | "quality" | "participation";
  name: string;
  description: string;
  threshold: number;
  unit: string;
  current: number;
  remaining: number;
  progressPercent: number;
  earned: boolean;
  earnedAt: string | null;
};
type DriverAchievementProjection = {
  visibility: "private_driver";
  earnedAchievements: DriverAchievement[];
  progress: DriverAchievement[];
  nextAchievement: DriverAchievement | null;
  nextMilestones: DriverAchievement[];
};

function percent(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function duration(value: number | null) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function date(value: string | null) { return value ? new Date(value).toLocaleDateString() : "—"; }

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card className="border-border/70 bg-card/95"><CardContent className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function DriverAchievements() {
  const { data, isLoading, isError } = useQuery<DriverAchievementProjection>({
    queryKey: ["/api/drivers/achievements"],
    queryFn: async () => (await apiRequest("GET", "/api/drivers/achievements")).json(),
  });
  return <Card data-testid="driver-achievements">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-primary" />Achievements</CardTitle>
      <CardDescription>Private recognition based only on your recorded Platform Intelligence activity.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div>}
      {isError && <p className="text-sm text-destructive">Achievements could not be loaded. Please try again.</p>}
      {data && <>
        {data.nextAchievement ? <div className="rounded-xl border border-primary/25 bg-primary/5 p-4" data-testid="next-achievement">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Next achievement</p><p className="mt-1 font-semibold text-foreground">{data.nextAchievement.name}</p><p className="mt-1 text-xs text-muted-foreground">{data.nextAchievement.description}</p></div><span className="text-sm font-semibold tabular-nums text-primary">{data.nextAchievement.progressPercent}%</span></div>
          <Progress className="mt-3" value={data.nextAchievement.progressPercent} aria-label={`${data.nextAchievement.name} progress`} />
          <p className="mt-2 text-xs text-muted-foreground">{data.nextAchievement.current} of {data.nextAchievement.threshold} {data.nextAchievement.unit}</p>
        </div> : <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="font-semibold text-foreground">All current achievements earned</p><p className="mt-1 text-xs text-muted-foreground">Your existing recognition remains private to your account.</p></div>}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Earned achievements</p>
          {data.earnedAchievements.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.earnedAchievements.map((achievement) => <div className="rounded-xl border border-border/70 bg-muted/20 p-3" key={achievement.id} data-testid={`earned-achievement-${achievement.id}`}>
            <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div><p className="text-sm font-medium text-foreground">{achievement.name}</p><p className="mt-1 text-xs text-muted-foreground">Earned {date(achievement.earnedAt)}</p></div></div>
          </div>)}</div> : <p className="text-sm text-muted-foreground">Your first achievement will appear after qualifying activity is recorded.</p>}
        </div>
      </>}
    </CardContent>
  </Card>;
}

/** Read-only, authenticated Driver projection; it intentionally has no financial fields. */
export function DriverIntelligenceSummary({ enabled }: { enabled: boolean }) {
  const [range, setRange] = useState<WindowOption>("30");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("daily");
  const endpoint = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - Number(range) * 86_400_000);
    return `/api/drivers/intelligence/dashboard?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  }, [range]);
  const { data, isLoading, isError } = useQuery<DriverIntelligence>({
    queryKey: [endpoint],
    enabled,
    queryFn: async () => (await apiRequest("GET", endpoint)).json(),
  });
  const trends = data ? trendPeriod === "daily" ? data.trends.dailyActivity : trendPeriod === "weekly" ? data.trends.weeklyActivity : data.trends.monthlyActivity : [];

  return <section className="space-y-4" aria-label="Driver intelligence" data-testid="driver-intelligence-summary">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2 text-primary"><BarChart3 className="h-5 w-5" /><span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Driver Intelligence</span></div><h3 className="mt-2 text-xl font-semibold tracking-tight">Your operational performance</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review your own verified work, activity patterns, and progress through the material recovery journey. Financial information is shown separately.</p></div>
      <Select value={range} onValueChange={(value) => setRange(value as WindowOption)}><SelectTrigger className="w-36" aria-label="Driver intelligence date range"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select>
    </div>
    {isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div>}
    {isError && <Card><CardContent className="p-5 text-sm text-destructive">Driver Intelligence could not be loaded. Please try again.</CardContent></Card>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Lifetime verified" value={data.activity.lifetimeVerifiedWashouts} /><Metric label="Verified this year" value={data.activity.verifiedThisYear} /><Metric label="Verified this month" value={data.activity.verifiedThisMonth} /><Metric label="Verified this week" value={data.activity.verifiedThisWeek} /><Metric label="Verified today" value={data.activity.verifiedToday} /></div>
      <DriverAchievements />
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Performance</CardTitle><CardDescription>Final operational outcomes only.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="Verification rate" value={percent(data.performance.verificationRate)} /><Metric label="Administrative Review rate" value={percent(data.performance.administrativeReviewRate)} /><Metric label="Rejection rate" value={percent(data.performance.rejectionRate)} /><Metric label="Average verified activities per active day" value={data.performance.averageWashoutsPerActiveDay?.toFixed(1) ?? "—"} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Recovery history</CardTitle><CardDescription>Based on recorded submitted and verified activity.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="First verified activity" value={date(data.history.firstVerifiedWashoutAt)} /><Metric label="Most recent verified activity" value={date(data.history.mostRecentVerifiedWashoutAt)} /><Metric label="Consecutive active days" value={data.history.consecutiveActiveDays} detail="Ending on your most recent active day" /><Metric label="Longest activity streak" value={data.history.longestActivityStreak} /></CardContent></Card></div>
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" />Facility insights</CardTitle><CardDescription>Your own submitted activity by facility.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="Favorite facility" value={data.facility.favoriteFacility?.name || "—"} detail={data.facility.favoriteFacility ? `${data.facility.favoriteFacility.submittedCount} submitted` : undefined} /><Metric label="Facilities visited" value={data.facility.facilitiesVisited} /><Metric label="Most active day" value={data.facility.mostActiveDayOfWeek || "—"} /><Metric label="Most active hour" value={data.facility.mostActiveHour || "—"} /></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Route className="h-4 w-4 text-primary" />Journey metrics</CardTitle><CardDescription>Calculated from your recorded recovery events; no stage is estimated.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="Check-In → Upload" value={percent(data.journey.checkInToUploadRate)} /><Metric label="Upload → Verification" value={percent(data.journey.uploadToVerificationRate)} /><Metric label="Overall completion" value={percent(data.journey.overallCompletionRate)} /><Metric label="Average completion" value={duration(data.journey.averageCompletionDurationMs)} detail={`Median ${duration(data.journey.medianCompletionDurationMs)}`} /></CardContent></Card></div>
      <Card><CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />Activity trends</CardTitle><CardDescription>Daily, weekly, and monthly operational activity from the same event stream.</CardDescription></div><Select value={trendPeriod} onValueChange={(value) => setTrendPeriod(value as TrendPeriod)}><SelectTrigger className="w-32" aria-label="Driver intelligence trend period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" hide /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="submittedCount" name="Submitted" stroke="#0ea5e9" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="verifiedCount" name="Verified" stroke="#22c55e" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="rejectedCount" name="Rejected" stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
    </>}
  </section>;
}
