import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileImage,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { OwnerHeader } from "@/components/OwnerHeader";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { localizeCenterNotification } from "@/lib/notificationLocalization";
import {
  ownerFacilitySelectionStorageKey,
  parseOwnerFacilityUrlSelection,
} from "@/lib/ownerFacilityIntelligenceSelection";

type Facility = { id: string; name: string; isActive: boolean; isVisible: boolean };
type OperationalActivity = {
  id: string;
  driverDisplayName: string;
  material: string;
  facilityId: string;
  facilityName: string;
  submittedAt: string | null;
  status: "pending" | "verified" | "rejected";
  evidence: "missing" | "failed" | "available";
  photoCount: number;
  returnedFromAdministrativeReview: boolean;
  reviewLink: string;
};
type OperationalSummary = {
  selection: { state: "selected" | "required" | "empty"; selectedFacilityId: string | null; selectedFacilityName: string | null; source: "request" | "single" | null; facilities: Facility[] };
  today: null | { submitted: number; awaitingReview: number; verified: number; rejected: number; activeDrivers: number; latestActivityAt: string | null; timezone: "UTC" };
  attention: null | { pendingReviews: number; agedPendingReviews: number; missingEvidence: number; returnedFromAdministrativeReview: number; failedEvidence: number; unresolvedOperationalNotices: number; facilityConfigurationIssues: string[]; termsAcceptanceRequired: boolean; readinessActionRequired: boolean };
  pendingReviews: OperationalActivity[];
  recentActivity: OperationalActivity[];
  facilityStatus: null | { id: string; name: string; ownerApproved: boolean; active: boolean; visible: boolean; profileComplete: boolean; operatingHoursConfigured: boolean; acceptedMaterials: string[]; operational: boolean; issues: string[]; intelligenceLink: string; manageLink: string };
  notifications: { unreadCount: number; recent: Array<{ id: string; title: string; message: string; templateKey: string | null; category: string; priority: string; isRead: boolean; deepLink: string | null; metadata: Record<string, string>; createdAt: string | null }>; centerLink: "/notifications" };
  generatedAt: string;
  dataState: "facility_selection_required" | "no_facilities" | "ready";
};

const OPERATIONAL_DASHBOARD_TIMEOUT_MS = 15_000;

function requestOperationalSummary(url: string, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, OPERATIONAL_DASHBOARD_TIMEOUT_MS);
  return apiRequest(url, { method: "GET", signal: controller.signal })
    .then((response) => response.json() as Promise<OperationalSummary>)
    .finally(() => {
      window.clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abort);
    });
}

function MetricCard({ label, value, icon: Icon, testId }: { label: string; value: string | number; icon: typeof Activity; testId: string }) {
  return <Card data-testid={testId}><CardContent className="flex items-center gap-3 p-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
    <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>
  </CardContent></Card>;
}

function ActivityRow({ activity, onOpen, t, language, recent = false }: { activity: OperationalActivity; onOpen: (path: string) => void; t: (key: string, values?: Record<string, string | number>) => string; language: "en" | "es"; recent?: boolean }) {
  const statusLabel = t(`owner.operational.status.${activity.status}`);
  const evidenceLabel = t(`owner.operational.evidence.${activity.evidence}`);
  return <li id={`activity-${activity.id}`} className="rounded-xl border bg-card p-4" data-testid={`owner-operational-activity-${activity.id}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{activity.driverDisplayName}</p>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{statusLabel}</span>
          {activity.returnedFromAdministrativeReview && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t("owner.operational.returned")}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{activity.material} · {activity.facilityName}</p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={activity.submittedAt || undefined}>{activity.submittedAt ? new Date(activity.submittedAt).toLocaleString(language === "es" ? "es-US" : "en-US") : t("owner.operational.timeUnavailable")}</time>
          {` · ${evidenceLabel}`}
        </p>
      </div>
      <Button type="button" variant={recent ? "outline" : "default"} className="min-h-11 shrink-0" onClick={() => onOpen(activity.reviewLink)} aria-label={t("owner.operational.openActivityAria", { driver: activity.driverDisplayName })}>
        {recent ? t("owner.operational.viewSubmission") : t("owner.operational.reviewActivity")}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  </li>;
}

function LoadingShell({ t }: { t: (key: string) => string }) {
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" aria-busy="true" data-testid="owner-operational-loading">
    <div role="status" aria-live="polite" className="rounded-xl border bg-card p-4 text-sm font-medium"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t("owner.operational.loading")}</div>
    <Skeleton className="h-28 w-full rounded-2xl" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>
    <Skeleton className="h-64 w-full rounded-2xl" />
  </main>;
}

export default function OwnerOperationalDashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [currentPath, setLocation] = useLocation();
  const urlSelection = useMemo(() => parseOwnerFacilityUrlSelection(currentPath), [currentPath]);
  const facilityId = urlSelection.present ? urlSelection.facilityId : null;
  const endpoint = facilityId
    ? `/api/owners/dashboard/operational-summary?facilityId=${encodeURIComponent(facilityId)}`
    : "/api/owners/dashboard/operational-summary";
  const summary = useQuery<OperationalSummary>({
    queryKey: ["owner-operational-dashboard", facilityId || "unselected"],
    queryFn: ({ signal }) => requestOperationalSummary(endpoint, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const data = summary.data;
  const storageKey = user?.id ? ownerFacilitySelectionStorageKey(user.id) : null;

  useEffect(() => {
    if (!data || !storageKey || typeof window === "undefined") return;
    if (data.selection.state === "selected" && data.selection.selectedFacilityId) {
      window.localStorage.setItem(storageKey, data.selection.selectedFacilityId);
      if (!urlSelection.present) setLocation(`/dashboard?facilityId=${encodeURIComponent(data.selection.selectedFacilityId)}`, { replace: true });
      return;
    }
    if (data.selection.state === "required" && !urlSelection.present) {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && data.selection.facilities.some((facility) => facility.id === stored)) {
        setLocation(`/dashboard?facilityId=${encodeURIComponent(stored)}`, { replace: true });
      }
    }
  }, [data, setLocation, storageKey, urlSelection.present]);

  useEffect(() => {
    if (!data) return;
    queryClient.setQueryData(["/api/notifications/unread"], { count: data.notifications.unreadCount, notifications: [] });
  }, [data, queryClient]);

  const selectFacility = (nextFacilityId: string) => {
    if (!data?.selection.facilities.some((facility) => facility.id === nextFacilityId)) return;
    if (storageKey && typeof window !== "undefined") window.localStorage.setItem(storageKey, nextFacilityId);
    setLocation(`/dashboard?facilityId=${encodeURIComponent(nextFacilityId)}`);
  };

  const facilitySelector = <Select value={data?.selection.selectedFacilityId || ""} onValueChange={selectFacility}>
    <SelectTrigger className="min-h-11 w-full sm:w-80" aria-label={t("owner.operational.facilitySelectorAria")} data-testid="owner-operational-facility-selector"><SelectValue placeholder={t("owner.operational.selectFacility")} /></SelectTrigger>
    <SelectContent>{data?.selection.facilities.map((facility) => <SelectItem key={facility.id} value={facility.id}>{facility.name}</SelectItem>)}</SelectContent>
  </Select>;

  let content: React.ReactNode;
  if (summary.isLoading) {
    content = <LoadingShell t={t} />;
  } else if (summary.isError || !data) {
    content = <main className="mx-auto max-w-6xl px-4 py-6"><Card data-testid="owner-operational-error"><CardContent className="space-y-4 p-6"><div role="alert"><h2 className="text-lg font-semibold">{t("owner.operational.errorTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("owner.operational.errorDescription")}</p></div><Button type="button" variant="outline" className="min-h-11" onClick={() => void summary.refetch()} aria-label={t("owner.operational.retryAria")}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("common.retry")}</Button></CardContent></Card></main>;
  } else if (data.selection.state === "empty") {
    content = <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><header><h2 className="text-3xl font-semibold">{t("owner.operational.title")}</h2><p className="mt-2 text-muted-foreground">{t("owner.operational.subtitle")}</p></header><Card data-testid="owner-operational-no-facilities"><CardContent className="space-y-4 p-6"><Building2 className="h-8 w-8 text-primary" aria-hidden="true" /><div><h2 className="text-lg font-semibold">{t("owner.operational.noFacilitiesTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("owner.operational.noFacilitiesDescription")}</p></div><Button className="min-h-11" onClick={() => setLocation("/locations")}>{t("owner.operational.completeSetup")}</Button></CardContent></Card></main>;
  } else if (data.selection.state === "required") {
    content = <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><header><h2 className="text-3xl font-semibold">{t("owner.operational.title")}</h2><p className="mt-2 text-muted-foreground">{t("owner.operational.subtitle")}</p></header><Card className="border-2 border-primary/40" data-testid="owner-operational-selection-required"><CardHeader><CardTitle>{t("owner.operational.selectionRequiredTitle")}</CardTitle><CardDescription>{t("owner.operational.selectionRequiredDescription")}</CardDescription></CardHeader><CardContent className="space-y-3">{facilitySelector}<p className="text-sm font-medium text-primary">{t("owner.operational.noFalseZeroGuidance")}</p></CardContent></Card></main>;
  } else {
    const today = data.today!;
    const attention = data.attention!;
    const facility = data.facilityStatus!;
    const attentionTotal = attention.pendingReviews + attention.missingEvidence + attention.returnedFromAdministrativeReview + attention.failedEvidence + attention.unresolvedOperationalNotices + attention.facilityConfigurationIssues.length;
    const latest = data.recentActivity[0] || null;
    content = <main className="mx-auto max-w-6xl space-y-7 px-4 py-6">
      <span className="sr-only" role="status" aria-live="polite">{summary.isFetching ? t("owner.operational.refreshing") : t("owner.operational.loaded", { facility: facility.name })}</span>
      <header className="space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("owner.operational.eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{t("owner.operational.title")}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("owner.operational.subtitle")}</p></div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between" data-testid="owner-operational-current-context">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("owner.operational.currentlyViewing")}</p><p className="mt-1 text-lg font-semibold">{facility.name}</p></div>
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t("owner.operational.changeFacility")}</p>{facilitySelector}</div>
        </div>
      </header>

      <section aria-labelledby="attention-heading" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="attention-heading" className="text-xl font-semibold">{t("owner.operational.requiresAttention")}</h2><p className="mt-1 text-sm text-muted-foreground">{attentionTotal > 0 ? t("owner.operational.attentionDescription", { count: attentionTotal }) : t("owner.operational.noAttention")}</p></div><Button className="min-h-11" disabled={attention.pendingReviews === 0} onClick={() => setLocation(data.pendingReviews[0]?.reviewLink || "/dashboard/reviews")}><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />{t("owner.operational.reviewPending")}</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label={t("owner.operational.pendingReviews")} value={attention.pendingReviews} icon={Clock3} testId="owner-operational-pending-count" />
          <MetricCard label={t("owner.operational.missingEvidence")} value={attention.missingEvidence} icon={FileImage} testId="owner-operational-missing-evidence" />
          <MetricCard label={t("owner.operational.returnedReviews")} value={attention.returnedFromAdministrativeReview} icon={RefreshCw} testId="owner-operational-returned-reviews" />
          <MetricCard label={t("owner.operational.failedEvidence")} value={attention.failedEvidence} icon={AlertTriangle} testId="owner-operational-failed-evidence" />
          <MetricCard label={t("owner.operational.unresolvedNotices")} value={attention.unresolvedOperationalNotices} icon={Bell} testId="owner-operational-unresolved-notices" />
        </div>
        {(attention.agedPendingReviews > 0 || attention.facilityConfigurationIssues.length > 0 || attention.termsAcceptanceRequired) && <Card className="border-amber-300/70 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"><CardContent className="space-y-2 p-4"><h3 className="font-semibold">{t("owner.operational.otherActions")}</h3>{attention.agedPendingReviews > 0 && <p className="text-sm">{t("owner.operational.agedPending", { count: attention.agedPendingReviews })}</p>}{attention.facilityConfigurationIssues.map((issue) => <p key={issue} className="text-sm">{t(`owner.operational.issue.${issue}`)}</p>)}</CardContent></Card>}
      </section>

      <section aria-labelledby="today-heading" className="space-y-3"><div><h2 id="today-heading" className="text-xl font-semibold">{t("owner.operational.today")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("owner.operational.todayTimezone")}</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard label={t("owner.operational.submitted")} value={today.submitted} icon={Activity} testId="owner-operational-today-submitted" />
        <MetricCard label={t("owner.operational.awaitingReview")} value={today.awaitingReview} icon={Clock3} testId="owner-operational-today-pending" />
        <MetricCard label={t("owner.operational.verified")} value={today.verified} icon={CheckCircle2} testId="owner-operational-today-verified" />
        <MetricCard label={t("owner.operational.rejected")} value={today.rejected} icon={XCircle} testId="owner-operational-today-rejected" />
        <MetricCard label={t("owner.operational.activeDrivers")} value={today.activeDrivers} icon={UserRound} testId="owner-operational-today-drivers" />
        <MetricCard label={t("owner.operational.latestActivity")} value={today.latestActivityAt ? new Date(today.latestActivityAt).toLocaleTimeString(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" }) : "—"} icon={Clock3} testId="owner-operational-latest" />
      </div></section>

      <section aria-labelledby="pending-heading" className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 id="pending-heading" className="text-xl font-semibold">{t("owner.operational.pendingPreview")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("owner.operational.pendingPreviewDescription")}</p></div>{data.pendingReviews.length > 0 && <Button variant="ghost" onClick={() => setLocation("/dashboard/reviews")}>{t("common.viewAll")}</Button>}</div>{data.pendingReviews.length ? <ul className="space-y-3">{data.pendingReviews.map((activity) => <ActivityRow key={activity.id} activity={activity} onOpen={setLocation} t={t} language={language} />)}</ul> : <Card data-testid="owner-operational-pending-empty"><CardContent className="p-6 text-sm text-muted-foreground">{t("owner.operational.noPending")}</CardContent></Card>}</section>

      <section aria-labelledby="recent-heading" className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="recent-heading" className="text-xl font-semibold">{t("owner.operational.recentActivity")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("owner.operational.recentDescription")}</p></div><Button variant="outline" className="min-h-11" disabled={!latest} onClick={() => latest && setLocation(latest.reviewLink)}>{t("owner.operational.viewLatest")}</Button></div>{data.recentActivity.length ? <ul className="space-y-3">{data.recentActivity.map((activity) => <ActivityRow key={activity.id} activity={activity} onOpen={setLocation} t={t} language={language} recent />)}</ul> : <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("owner.operational.noRecent")}</CardContent></Card>}</section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="facility-heading"><Card className="h-full"><CardHeader><CardTitle id="facility-heading" className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" aria-hidden="true" />{t("owner.operational.facilityStatus")}</CardTitle><CardDescription>{facility.name}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 text-sm"><p><ShieldCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />{t("owner.operational.approved")}: <strong>{facility.ownerApproved ? t("common.yes") : t("common.no")}</strong></p><p><Activity className="mr-2 inline h-4 w-4" aria-hidden="true" />{t("common.active")}: <strong>{facility.active ? t("common.yes") : t("common.no")}</strong></p><p><Eye className="mr-2 inline h-4 w-4" aria-hidden="true" />{t("owner.operational.visible")}: <strong>{facility.visible ? t("common.yes") : t("common.no")}</strong></p><p><MapPin className="mr-2 inline h-4 w-4" aria-hidden="true" />{t("owner.operational.operational")}: <strong>{facility.operational ? t("common.ready") : t("owner.operational.actionRequired")}</strong></p></div><div><h3 className="text-sm font-semibold">{t("owner.operational.acceptedMaterials")}</h3><p className="mt-1 text-sm text-muted-foreground">{facility.acceptedMaterials.length ? facility.acceptedMaterials.join(", ") : t("owner.operational.noMaterials")}</p></div><div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" onClick={() => setLocation(facility.manageLink)}>{t("owner.operational.manageFacility")}</Button><Button className="min-h-11" onClick={() => setLocation(facility.intelligenceLink)}>{t("owner.operational.viewIntelligence")}</Button></div></CardContent></Card></section>
        <section aria-labelledby="notifications-heading"><Card className="h-full"><CardHeader><CardTitle id="notifications-heading" className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" aria-hidden="true" />{t("owner.operational.notifications")}</CardTitle><CardDescription>{t("owner.operational.unreadNotifications", { count: data.notifications.unreadCount })}</CardDescription></CardHeader><CardContent className="space-y-3">{data.notifications.recent.length ? <ul className="space-y-2">{data.notifications.recent.map((notification) => { const copy = localizeCenterNotification({ ...notification, type: notification.templateKey || "notification" }, language, t); return <li key={notification.id} className="rounded-lg border p-3"><p className="text-sm font-semibold">{copy.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{copy.message}</p>{notification.deepLink && <Button variant="link" className="mt-1 h-auto min-h-0 p-0" onClick={() => setLocation(notification.deepLink!)}>{t("notification.center.open")}</Button>}</li>; })}</ul> : <p className="text-sm text-muted-foreground">{t("owner.operational.noNotifications")}</p>}<Button className="min-h-11 w-full" variant="outline" onClick={() => setLocation(data.notifications.centerLink)}>{t("owner.operational.openNotifications")}</Button></CardContent></Card></section>
      </div>
    </main>;
  }

  return <div className="min-h-screen bg-background pb-24"><OwnerHeader />{content}<MobileNav role="owner" /></div>;
}
