import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Medal, ShieldCheck, Target, Trophy, Users } from "lucide-react";

import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "year" | "all_time";
type LeaderboardRow = {
  rank: number;
  position: number;
  displayName: string;
  verifiedCount: number;
  milestone: { id: string; threshold: number } | null;
  isCurrentDriver: boolean;
};
type CurrentPosition = Omit<LeaderboardRow, "rank" | "position"> & {
  rank: number | null;
  position: number | null;
  countToNextRank: number | null;
  nextMilestone: { id: string; threshold: number; current: number; remaining: number } | null;
};
type CompetitionResponse = {
  period: Period;
  window: { start: string | null; end: string; timezone: "UTC" };
  state: "empty" | "insufficient_data" | "available";
  rows: LeaderboardRow[];
  current: CurrentPosition;
  nearbyRows: LeaderboardRow[];
  totalRankedDrivers: number;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  availableFilters: {
    states: string[];
    facilities: Array<{ id: string; name: string; state: string }>;
    facilitiesTruncated: boolean;
  };
};

function RankMark({ rank, ariaLabel }: { rank: number; ariaLabel: string }) {
  if (rank <= 3) return <span className="inline-flex items-center gap-1 font-semibold" aria-label={ariaLabel}><Medal className={cn("h-4 w-4", rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-orange-600")} />{rank}</span>;
  return <span className="font-semibold tabular-nums">{rank}</span>;
}

function Milestone({ threshold, label }: { threshold: number; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" />{label.replace("{{count}}", threshold.toLocaleString())}</span>;
}

export default function DriverCompetition() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("week");
  const [state, setState] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [page, setPage] = useState(1);
  const query = useMemo(() => {
    const params = new URLSearchParams({ period, page: String(page), pageSize: "10" });
    if (state) params.set("state", state);
    if (facilityId) params.set("facilityId", facilityId);
    return params.toString();
  }, [facilityId, page, period, state]);
  const competition = useQuery<CompetitionResponse>({
    queryKey: ["/api/drivers/competition/leaderboard", query],
    queryFn: async () => (await apiRequest("GET", `/api/drivers/competition/leaderboard?${query}`)).json(),
    retry: false,
  });
  const data = competition.data;
  const visibleFacilities = (data?.availableFilters.facilities || []).filter((facility) => !state || facility.state === state);

  const resetContext = () => setPage(1);
  return <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-24 text-foreground">
    <DriverHeader />
    <main className="mx-auto w-full max-w-6xl space-y-5 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary"><Trophy className="h-5 w-5" /><p className="text-xs font-semibold uppercase tracking-[0.16em]">{t("competition.eyebrow")}</p></div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("competition.title")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("competition.description")}</p>
      </header>

      <Card data-testid="competition-filters"><CardHeader><CardTitle className="text-base">{t("competition.filters")}</CardTitle><CardDescription>{t("competition.filtersHelp")}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm"><span>{t("competition.period")}</span><select className="h-10 min-w-0 rounded-md border bg-background px-3" aria-label={t("competition.periodAria")} value={period} onChange={(event) => { setPeriod(event.target.value as Period); resetContext(); }}><option value="week">{t("competition.period.week")}</option><option value="month">{t("competition.period.month")}</option><option value="year">{t("competition.period.year")}</option><option value="all_time">{t("competition.period.allTime")}</option></select></label>
        <label className="grid gap-1.5 text-sm"><span>{t("competition.state")}</span><select className="h-10 min-w-0 rounded-md border bg-background px-3" aria-label={t("competition.stateAria")} value={state} onChange={(event) => { setState(event.target.value); setFacilityId(""); resetContext(); }}><option value="">{t("competition.networkWide")}</option>{(data?.availableFilters.states || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm"><span>{t("competition.facility")}</span><select className="h-10 min-w-0 rounded-md border bg-background px-3" aria-label={t("competition.facilityAria")} value={facilityId} onChange={(event) => { setFacilityId(event.target.value); resetContext(); }}><option value="">{t("competition.allFacilities")}</option>{visibleFacilities.map((facility) => <option value={facility.id} key={facility.id}>{facility.name} ({facility.state})</option>)}</select></label>
      </CardContent></Card>

      {competition.isLoading && <section aria-label={t("competition.loading")} role="status" className="space-y-3" data-testid="competition-loading"><Skeleton className="h-32 w-full" /><Skeleton className="h-72 w-full" /></section>}
      {competition.isError && <Card className="border-destructive/40" data-testid="competition-error"><CardContent className="space-y-3 p-6" role="alert"><p className="font-medium text-destructive">{t("competition.error")}</p><Button variant="outline" onClick={() => void competition.refetch()}>{t("common.retry")}</Button></CardContent></Card>}

      {data && <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label={t("competition.yourPosition")} data-testid="competition-current-position">
          <Card className="border-primary/30 bg-primary/5"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{t("competition.yourRank")}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{data.current.rank ? `#${data.current.rank}` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{t("competition.totalRanked", { count: data.totalRankedDrivers })}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{t("competition.yourVerified")}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{data.current.verifiedCount}</p>{data.current.milestone && <div className="mt-2"><Milestone threshold={data.current.milestone.threshold} label={t("competition.milestone")} /></div>}</CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{t("competition.nextPosition")}</p><p className="mt-2 text-lg font-semibold">{data.current.countToNextRank == null ? t("competition.leading") : t("competition.distance", { count: data.current.countToNextRank })}</p><p className="mt-1 text-xs text-muted-foreground">{t("competition.keepBuilding")}</p></CardContent></Card>
        </section>

        {data.state === "empty" && <Card data-testid="competition-empty"><CardContent className="flex flex-col items-start gap-3 p-6"><Target className="h-8 w-8 text-primary" /><div><p className="font-semibold">{t("competition.emptyTitle")}</p><p className="mt-1 text-sm text-muted-foreground">{t("competition.emptyDescription")}</p></div><Button onClick={() => setLocation("/locations")}>{t("competition.findFacility")}</Button></CardContent></Card>}
        {data.state === "insufficient_data" && <Card className="border-amber-500/30" data-testid="competition-insufficient"><CardContent className="p-4 text-sm text-muted-foreground">{t("competition.insufficient")}</CardContent></Card>}

        {data.rows.length > 0 && <Card data-testid="competition-leaderboard"><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />{t("competition.leaderboard")}</CardTitle><CardDescription>{t("competition.verifiedOnly")}</CardDescription></CardHeader><CardContent className="max-w-full overflow-x-auto">
          <Table aria-label={t("competition.tableAria")}><TableHeader><TableRow><TableHead>{t("competition.rank")}</TableHead><TableHead>{t("competition.driver")}</TableHead><TableHead className="text-right">{t("competition.verified")}</TableHead><TableHead>{t("competition.recognition")}</TableHead></TableRow></TableHeader><TableBody>{data.rows.map((row) => <TableRow key={`${row.position}-${row.displayName}`} className={cn(row.isCurrentDriver && "bg-primary/10", row.rank <= 3 && "font-medium")} data-testid={row.isCurrentDriver ? "competition-own-row" : undefined}><TableCell><RankMark rank={row.rank} ariaLabel={t("competition.rankAria", { count: row.rank })} /></TableCell><TableCell><span>{row.displayName}</span>{row.isCurrentDriver && <span className="ml-2 text-xs text-primary">{t("competition.you")}</span>}</TableCell><TableCell className="text-right tabular-nums">{row.verifiedCount}</TableCell><TableCell>{row.milestone ? <Milestone threshold={row.milestone.threshold} label={t("competition.milestone")} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell></TableRow>)}</TableBody></Table>
          <div className="mt-4 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t("competition.page", { current: data.pagination.page, total: data.pagination.totalPages })}</p><div className="flex gap-2"><Button size="sm" variant="outline" aria-label={t("competition.previousAria")} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" />{t("competition.previous")}</Button><Button size="sm" variant="outline" aria-label={t("competition.nextAria")} disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>{t("competition.next")}<ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent></Card>}

        {data.nearbyRows.length > 0 && <Card data-testid="competition-nearby"><CardHeader><CardTitle className="text-base">{t("competition.nearby")}</CardTitle><CardDescription>{t("competition.nearbyHelp")}</CardDescription></CardHeader><CardContent className="space-y-2">{data.nearbyRows.map((row) => <div key={`${row.position}-${row.displayName}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"><div className="flex min-w-0 items-center gap-3"><RankMark rank={row.rank} ariaLabel={t("competition.rankAria", { count: row.rank })} /><span className="truncate text-sm font-medium">{row.displayName}</span></div><span className="shrink-0 text-sm tabular-nums">{t("competition.verifiedCount", { count: row.verifiedCount })}</span></div>)}</CardContent></Card>}

        <Card className="border-sky-500/20"><CardContent className="flex gap-3 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" /><p>{t("competition.privacy")}</p></CardContent></Card>
      </>}
    </main>
    <MobileNav role="driver" />
  </div>;
}
