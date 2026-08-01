import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, CalendarDays, CheckCircle2, MapPin, Route } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { localeForLanguage, useLanguage } from "@/lib/i18n";

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

type Translate = (key: string, values?: Record<string, string | number>) => string;

function achievementName(achievement: DriverAchievement, t: Translate) {
  if (achievement.category === "verified_washouts") return achievement.threshold === 1
    ? t("driver.intelligence.achievement.firstVerified")
    : t("driver.intelligence.achievement.verified", { count: achievement.threshold });
  if (achievement.category === "consistency") return t("driver.intelligence.achievement.streak", { count: achievement.threshold });
  if (achievement.category === "quality") return t("driver.intelligence.achievement.quality", { count: achievement.threshold });
  return achievement.threshold === 1
    ? t("driver.intelligence.achievement.firstFacility")
    : t("driver.intelligence.achievement.facilities", { count: achievement.threshold });
}

function achievementDescription(achievement: DriverAchievement, t: Translate) {
  if (achievement.category === "verified_washouts") return achievement.threshold === 1
    ? t("driver.intelligence.achievement.firstVerifiedDescription")
    : t("driver.intelligence.achievement.verifiedDescription", { count: achievement.threshold });
  if (achievement.category === "consistency") return t("driver.intelligence.achievement.streakDescription", { count: achievement.threshold });
  if (achievement.category === "quality") return t("driver.intelligence.achievement.qualityDescription", { count: achievement.threshold });
  return achievement.threshold === 1
    ? t("driver.intelligence.achievement.firstFacilityDescription")
    : t("driver.intelligence.achievement.facilitiesDescription", { count: achievement.threshold });
}

function achievementUnit(achievement: DriverAchievement, t: Translate) {
  if (achievement.category === "verified_washouts") return t("driver.intelligence.unit.verifiedActivities");
  if (achievement.category === "consistency") return t("driver.intelligence.unit.activeDays");
  if (achievement.category === "quality") return t("driver.intelligence.unit.verifiedWithoutRejection");
  return t("driver.intelligence.unit.facilities");
}

function localizedWeekday(value: string | null, t: Translate) {
  if (!value) return "—";
  const key = value.toLowerCase();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes(key)
    ? t(`driver.intelligence.weekday.${key}`)
    : value;
}

function percent(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function duration(value: number | null) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function date(value: string | null, language: "en" | "es") { return value ? new Date(value).toLocaleDateString(localeForLanguage(language)) : "—"; }

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card className="border-border/70 bg-card/95"><CardContent className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function DriverAchievements() {
  const { language, t } = useLanguage();
  const { data, isLoading, isError } = useQuery<DriverAchievementProjection>({
    queryKey: ["/api/drivers/achievements"],
    queryFn: async () => (await apiRequest("GET", "/api/drivers/achievements")).json(),
  });
  return <Card data-testid="driver-achievements">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-primary" />{t("driver.intelligence.achievements")}</CardTitle>
      <CardDescription>{t("driver.intelligence.achievementsDescription")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div>}
      {isError && <p className="text-sm text-destructive">{t("driver.intelligence.achievementsError")}</p>}
      {data && <>
        {data.nextAchievement ? <div className="rounded-xl border border-primary/25 bg-primary/5 p-4" data-testid="next-achievement">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{t("driver.intelligence.nextAchievement")}</p><p className="mt-1 font-semibold text-foreground">{achievementName(data.nextAchievement, t)}</p><p className="mt-1 text-xs text-muted-foreground">{achievementDescription(data.nextAchievement, t)}</p></div><span className="text-sm font-semibold tabular-nums text-primary">{data.nextAchievement.progressPercent}%</span></div>
          <Progress className="mt-3" value={data.nextAchievement.progressPercent} aria-label={t("driver.intelligence.achievementProgress", { name: achievementName(data.nextAchievement, t) })} />
          <p className="mt-2 text-xs text-muted-foreground">{t("driver.intelligence.progressCount", { current: data.nextAchievement.current, threshold: data.nextAchievement.threshold, unit: achievementUnit(data.nextAchievement, t) })}</p>
        </div> : <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="font-semibold text-foreground">{t("driver.intelligence.allAchievementsEarned")}</p><p className="mt-1 text-xs text-muted-foreground">{t("driver.intelligence.privateRecognition")}</p></div>}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("driver.intelligence.earnedAchievements")}</p>
          {data.earnedAchievements.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.earnedAchievements.map((achievement) => <div className="rounded-xl border border-border/70 bg-muted/20 p-3" key={achievement.id} data-testid={`earned-achievement-${achievement.id}`}>
            <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div><p className="text-sm font-medium text-foreground">{achievementName(achievement, t)}</p><p className="mt-1 text-xs text-muted-foreground">{t("driver.intelligence.earnedDate", { date: date(achievement.earnedAt, language) })}</p></div></div>
          </div>)}</div> : <p className="text-sm text-muted-foreground">{t("driver.intelligence.noAchievements")}</p>}
        </div>
      </>}
    </CardContent>
  </Card>;
}

/** Read-only, authenticated Driver projection; it intentionally has no financial fields. */
export function DriverIntelligenceSummary({ enabled }: { enabled: boolean }) {
  const { language, t } = useLanguage();
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

  return <section className="space-y-4" aria-label={t("driver.intelligence.ariaLabel")} data-testid="driver-intelligence-summary">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2 text-primary"><BarChart3 className="h-5 w-5" /><span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{t("driver.intelligence.title")}</span></div><h3 className="mt-2 text-xl font-semibold tracking-tight">{t("driver.intelligence.performanceTitle")}</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("driver.intelligence.description")}</p></div>
      <Select value={range} onValueChange={(value) => setRange(value as WindowOption)}><SelectTrigger className="w-36" aria-label={t("driver.intelligence.dateRangeAria")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">{t("driver.intelligence.last30")}</SelectItem><SelectItem value="90">{t("driver.intelligence.last90")}</SelectItem></SelectContent></Select>
    </div>
    {isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div>}
    {isError && <Card><CardContent className="p-5 text-sm text-destructive">{t("driver.intelligence.error")}</CardContent></Card>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label={t("driver.intelligence.lifetimeVerified")} value={data.activity.lifetimeVerifiedWashouts} /><Metric label={t("driver.intelligence.verifiedYear")} value={data.activity.verifiedThisYear} /><Metric label={t("driver.intelligence.verifiedMonth")} value={data.activity.verifiedThisMonth} /><Metric label={t("driver.intelligence.verifiedWeek")} value={data.activity.verifiedThisWeek} /><Metric label={t("driver.intelligence.verifiedToday")} value={data.activity.verifiedToday} /></div>
      <DriverAchievements />
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">{t("driver.intelligence.performance")}</CardTitle><CardDescription>{t("driver.intelligence.finalOutcomes")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label={t("driver.intelligence.verificationRate")} value={percent(data.performance.verificationRate)} /><Metric label={t("driver.intelligence.adminReviewRate")} value={percent(data.performance.administrativeReviewRate)} /><Metric label={t("driver.intelligence.rejectionRate")} value={percent(data.performance.rejectionRate)} /><Metric label={t("driver.intelligence.averagePerDay")} value={data.performance.averageWashoutsPerActiveDay?.toFixed(1) ?? "—"} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">{t("driver.intelligence.recoveryHistory")}</CardTitle><CardDescription>{t("driver.intelligence.historyDescription")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label={t("driver.intelligence.firstVerified")} value={date(data.history.firstVerifiedWashoutAt, language)} /><Metric label={t("driver.intelligence.mostRecentVerified")} value={date(data.history.mostRecentVerifiedWashoutAt, language)} /><Metric label={t("driver.intelligence.consecutiveDays")} value={data.history.consecutiveActiveDays} detail={t("driver.intelligence.endingRecentDay")} /><Metric label={t("driver.intelligence.longestStreak")} value={data.history.longestActivityStreak} /></CardContent></Card></div>
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" />{t("driver.intelligence.facilityInsights")}</CardTitle><CardDescription>{t("driver.intelligence.facilityDescription")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label={t("driver.intelligence.favoriteFacility")} value={data.facility.favoriteFacility?.name || "—"} detail={data.facility.favoriteFacility ? t("driver.intelligence.submittedCount", { count: data.facility.favoriteFacility.submittedCount }) : undefined} /><Metric label={t("driver.intelligence.facilitiesVisited")} value={data.facility.facilitiesVisited} /><Metric label={t("driver.intelligence.mostActiveDay")} value={localizedWeekday(data.facility.mostActiveDayOfWeek, t)} /><Metric label={t("driver.intelligence.mostActiveHour")} value={data.facility.mostActiveHour || "—"} /></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Route className="h-4 w-4 text-primary" />{t("driver.intelligence.journeyMetrics")}</CardTitle><CardDescription>{t("driver.intelligence.journeyDescription")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label={t("driver.intelligence.checkInUpload")} value={percent(data.journey.checkInToUploadRate)} /><Metric label={t("driver.intelligence.uploadVerification")} value={percent(data.journey.uploadToVerificationRate)} /><Metric label={t("driver.intelligence.overallCompletion")} value={percent(data.journey.overallCompletionRate)} /><Metric label={t("driver.intelligence.averageCompletion")} value={duration(data.journey.averageCompletionDurationMs)} detail={t("driver.intelligence.median", { duration: duration(data.journey.medianCompletionDurationMs) })} /></CardContent></Card></div>
      <Card><CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />{t("driver.intelligence.activityTrends")}</CardTitle><CardDescription>{t("driver.intelligence.trendsDescription")}</CardDescription></div><Select value={trendPeriod} onValueChange={(value) => setTrendPeriod(value as TrendPeriod)}><SelectTrigger className="w-32" aria-label={t("driver.intelligence.trendAria")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">{t("driver.intelligence.daily")}</SelectItem><SelectItem value="weekly">{t("driver.intelligence.weekly")}</SelectItem><SelectItem value="monthly">{t("driver.intelligence.monthly")}</SelectItem></SelectContent></Select></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" hide /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="submittedCount" name={t("driver.intelligence.submitted")} stroke="#0ea5e9" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="verifiedCount" name={t("driver.intelligence.verified")} stroke="#22c55e" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="rejectedCount" name={t("driver.intelligence.rejected")} stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
    </>}
  </section>;
}
