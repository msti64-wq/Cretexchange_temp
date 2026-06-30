import { Component, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, MessageCircle, Phone, Wallet, Ticket, RefreshCw, Truck, Route, ArrowRight, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatAddress } from "@shared/addressUtils";
import { getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { apiRequest } from "@/lib/queryClient";

type DriverDashboardStatsRange = "today" | "week" | "month";

const DRIVER_STATS_RANGE_OPTIONS: Array<{ value: DriverDashboardStatsRange; labelKey: string }> = [
  { value: "today", labelKey: "driver.dashboard.rangeToday" },
  { value: "week", labelKey: "driver.dashboard.rangeWeek" },
  { value: "month", labelKey: "driver.dashboard.rangeMonth" },
];

function getDriverStatsRangeLabel(
  range: DriverDashboardStatsRange,
  t: (key: string) => string,
  fallback?: string,
) {
  const option = DRIVER_STATS_RANGE_OPTIONS.find((item) => item.value === range);
  return option ? t(option.labelKey) : fallback || t("driver.dashboard.rangeToday");
}

function translateWashoutApprovalStatus(status: string | null | undefined, t: (key: string) => string) {
  switch (status) {
    case "verified":
      return t("common.approved");
    case "rejected":
      return t("common.rejected");
    case "pending":
    case "submitted":
    case "photo_pending":
      return t("common.pending");
    default:
      return getWashoutApprovalDisplayStatus(status || undefined);
  }
}

class DriverDashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[DRIVER_DASHBOARD_ERROR_BOUNDARY]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground">
          <div className="w-full border-b border-border/70 bg-card/95 px-3 py-3 shadow-sm sm:px-4">
            <div className="mx-auto w-full max-w-6xl min-w-0 text-sm text-muted-foreground">
              Driver dashboard
            </div>
          </div>
          <div className="mx-auto w-full max-w-6xl px-3 py-4 text-sm text-muted-foreground sm:px-4">
            The dashboard hit a render error and was recovered with a safe fallback.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function DriverDashboardSkeleton() {
  return (
    <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
      <div className="w-full border-b border-border/70 bg-card/95">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-14 w-full max-w-md bg-muted" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="w-full max-w-full overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid w-full max-w-full grid-cols-1 gap-4 md:grid-cols-[1.3fr_0.7fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </main>
    </div>
  );
}

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false);
  const [showLotteryEntries, setShowLotteryEntries] = useState(false);
  const [statsRange, setStatsRange] = useState<DriverDashboardStatsRange>("today");

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: [`/api/drivers/dashboard?statsRange=${statsRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: paymentHistory } = useQuery({
    queryKey: ['/api/payments/driver-history'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: lotteryEntries, isLoading: lotteryEntriesLoading, error: lotteryEntriesError } = useQuery<any[]>({
    queryKey: ['/api/drivers/lottery-entries'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/drivers/lottery-entries");
      return response.json();
    },
    enabled: showLotteryEntries,
  });

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const scanOverflow = () => {
      const viewportWidth = window.innerWidth;
      const offenders = Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid], header, main, section, article, .mobile-nav, .stat-card")
      ).flatMap((el) => {
        const rect = el.getBoundingClientRect();
        const clientWidth = el.clientWidth;
        const scrollWidth = el.scrollWidth;
        const overflowRight = Math.ceil(rect.right) > viewportWidth + 1;
        const overflowScroll = scrollWidth > clientWidth + 1;

        if (!overflowRight && !overflowScroll) return [];

        return [{
          selector: el.getAttribute("data-testid") || el.tagName.toLowerCase(),
          className: el.className,
          scrollWidth,
          clientWidth,
          right: Math.round(rect.right),
          viewportWidth,
        }];
      });

      if (offenders.length > 0) {
        console.warn("[DRIVER_DASHBOARD_OVERFLOW]", offenders);
      }
    };

    const raf = window.requestAnimationFrame(scanOverflow);
    window.addEventListener("resize", scanOverflow);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", scanOverflow);
    };
  }, []);

  if (isLoading) {
    return <DriverDashboardSkeleton />;
  }

  // Extract data with proper null checks and type annotation
  const dailyStats = (dashboardData as any)?.dailyStats || null;
  const weeklyStats = (dashboardData as any)?.weeklyStats || null;
  const recentActivities = (dashboardData as any)?.recentActivities || null;
  const lotteryStatus = (dashboardData as any)?.lotteryStatus || null;
  const lotteryEntryCount = lotteryStatus?.driverEntryCount ?? ((dashboardData as any)?.lotteryEntryCount || 0);
  const lotteryActive = lotteryStatus?.enabled ?? ((dashboardData as any)?.lotteryActive ?? true);

  // Calculate rejected washouts and their total amount
  const rejectedWashouts = recentActivities?.filter((activity: any) => 
    (activity.washout_activities?.status || activity.status) === 'rejected'
  ) || [];
  
  const rejectedTotal = rejectedWashouts.reduce((total: number, activity: any) => {
    return total + Number(activity.washout_activities?.amount || activity.amount || 0);
  }, 0);

  // Calculate adjusted earnings (total minus rejected)
  const adjustedDailyEarnings = (dailyStats?.earnings || 0) - rejectedTotal;
  const weeklyEarnings = weeklyStats?.totalEarnings || 0;
  const weeklyNetEarnings = weeklyEarnings - rejectedTotal;
  const totalPaid = Array.isArray(paymentHistory) ? paymentHistory.reduce((sum: number, payment: any) => 
    sum + Number(payment.amount || 0) + Number((payment.tipAmountCents || 0) / 100), 0
  ) : 0;
  const latestActivity = Array.isArray(recentActivities) && recentActivities.length > 0 ? recentActivities[0] : null;
  const latestLocationName = latestActivity?.washout_locations?.name || latestActivity?.location?.name || t("driver.dashboard.latestStop");
  const latestLocationAddress = latestActivity
    ? (latestActivity.washout_locations?.address
      || latestActivity.location?.address
      || formatAddress(latestActivity.washout_locations || latestActivity.location || {}))
    : "";
  const latestActivityAmount = Number(latestActivity?.washout_activities?.amount || latestActivity?.amount || 0);
  const latestActivityStatus = latestActivity ? (latestActivity.washout_activities?.status || latestActivity.status) : null;

  return (
    <DriverDashboardErrorBoundary>
      <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
        <DriverHeader />

        {/* GPS Status Bar */}
        <DSCard className="w-full max-w-full rounded-none border-x-0 border-t-0 px-3 py-3 sm:px-4" padding="sm" elevated>
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse" />
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight" data-testid="text-gps-status">{t("driver.dashboard.gpsActive")}</span>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-card px-3 py-1 text-sm font-medium text-emerald-400">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" data-testid="text-current-location">{t("driver.dashboard.locationEnabled")}</span>
            </div>
          </div>
        </DSCard>
 
        <main className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
          <DSCard className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[1.15fr_0.85fr]" padding="lg" elevated>
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full break-words rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.fieldOps")}
              </span>
              <span className="max-w-full break-words rounded-full border border-emerald-500/30 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-400 sm:tracking-[0.16em]">
                {t("driver.dashboard.gpsReady")}
              </span>
              <span className="max-w-full break-words rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.siteStopsToday", { count: dailyStats?.visits || 0 })}
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("driver.dashboard.operations")}
              </p>
              <h2 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{t("driver.dashboard.title")}</h2>
              <p className="max-w-2xl break-words text-sm text-muted-foreground">
                {t("driver.dashboard.description")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant="default"
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 focus-visible:ring-primary/50"
                onClick={() => setLocation('/locations')}
                data-testid="button-find-location-hero"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="break-words text-sm font-semibold tracking-tight">{t("driver.dashboard.findLocation")}</span>
                <span className="break-words text-xs text-primary-foreground/85">{t("driver.dashboard.findLocationHelp")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border-border/70 bg-card p-4 text-left shadow-sm hover:bg-muted/50"
                onClick={() => setLocation('/wallet')}
                data-testid="button-access-wallet-hero"
              >
                <Wallet className="h-5 w-5 text-primary" />
                <span className="break-words text-sm font-semibold">{t("driver.dashboard.myWallet")}</span>
                <span className="break-words text-xs text-muted-foreground">{t("driver.dashboard.walletHelp")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1 !whitespace-normal rounded-2xl border-border/70 bg-card p-4 text-left shadow-sm hover:bg-muted/50"
                onClick={() => setLocation('/activity')}
                data-testid="button-view-all-hero"
              >
                <Activity className="h-5 w-5 text-primary" />
                <span className="break-words text-sm font-semibold">{t("nav.activity")}</span>
                <span className="break-words text-xs text-muted-foreground">{t("driver.dashboard.recentWashoutsDescription")}</span>
              </Button>
            </div>
          </div>

          <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">{t("driver.dashboard.latestStop")}</p>
                <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">{latestLocationName}</h3>
              </div>
              <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
                <Truck className="h-5 w-5" />
              </div>
            </div>

            {latestActivity ? (
              <div className="mt-4 space-y-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Route className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{latestLocationName}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(latestActivity.washout_activities?.checkInTime || latestActivity.checkInTime).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    {latestLocationAddress && (
                      <p className="mt-1 break-words text-xs text-muted-foreground">{latestLocationAddress}</p>
                    )}
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <p className="break-words text-2xl font-semibold tracking-tight text-primary">
                      {formatCurrency(latestActivityAmount)}
                    </p>
                    <div className={`mt-1 inline-flex max-w-full whitespace-normal break-words rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.14em] ${
                      latestActivityStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : isPendingWashoutApproval(latestActivityStatus)
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                    }`}>
                      {translateWashoutApprovalStatus(latestActivityStatus, t)}
                    </div>
                  </div>
                </div>

              {lotteryActive && (
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
                      {t("driver.dashboard.monthlyLottery")}
                    </p>
                    <p className="break-words text-sm font-semibold text-foreground">
                      {lotteryActive ? t("driver.dashboard.lotteryActiveTitle") : t("driver.dashboard.lotteryDisabledTitle")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-amber-400">
                    <Ticket className="h-4 w-4" />
                    <span className="text-lg font-semibold tracking-tight">{lotteryEntryCount}</span>
                  </div>
                </div>
              )}
              </div>
            ) : (
              <div className="mt-4">
                <DashboardEmptyState
                  title={t("driver.dashboard.noRecentWashouts")}
                  description={t("driver.dashboard.noRecentWashoutsDescription")}
                  icon={Truck}
                  toneClassName="bg-card text-foreground"
                />
              </div>
            )}
          </div>
          </DSCard>

        {/* Dashboard Snapshot */}
        <section className="space-y-2">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.dailyOperations")}
              </p>
              <h3 className="break-words text-sm font-semibold tracking-tight text-foreground">
                {t("driver.dashboard.title")}
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-9 w-full !whitespace-normal sm:w-auto"
              onClick={() => refetch()}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("driver.dashboard.refresh")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <DSKpiCard
              label={t("driver.dashboard.siteVisits")}
              value={dailyStats?.visits || 0}
              detail={t("driver.dashboard.completedToday")}
              accentTone="info"
              data-testid="text-daily-visits"
            />
            <DSKpiCard
              label={t("driver.dashboard.todayEarnings")}
              value={formatCurrency(adjustedDailyEarnings)}
              detail={rejectedTotal > 0 ? t("driver.dashboard.rejectedAmountShort", { amount: formatCurrency(rejectedTotal) }) : t("driver.dashboard.netOfRejected")}
              accentTone="success"
              data-testid="text-daily-earnings"
            />
            <DSKpiCard
              label={t("driver.dashboard.sevenDayNet")}
              value={formatCurrency(weeklyNetEarnings)}
              detail={t("driver.dashboard.weeklyWashoutsHelper", { count: weeklyStats?.totalWashouts || 0 })}
              accentTone="warning"
              data-testid="text-net-earnings"
            />
            <DSKpiCard
              label={t("driver.dashboard.totalPaid")}
              value={formatCurrency(totalPaid)}
              detail={t("driver.dashboard.recordedPaymentHistory")}
              accentTone="accent"
              data-testid="text-total-paid"
            />
          </div>
        </section>

        {/* Today's Activity */}
        <DSCard padding="sm" elevated>
          <DSSectionHeader
            title="Today's Activity"
            description="Today's washouts and earnings at a glance."
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-auto min-h-9 w-full !whitespace-normal border-border/70 bg-card px-3 text-foreground hover:bg-muted/50 sm:w-auto"
                onClick={() => setLocation('/activity')}
                data-testid="button-view-activity"
              >
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              }
            />
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="min-w-0 rounded-2xl border border-border/70 bg-card px-3 py-2">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("driver.dashboard.siteVisits")}</p>
                <p className="break-words text-xl font-semibold text-foreground" data-testid="text-today-visits">{dailyStats?.visits || 0}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border/70 bg-card px-3 py-2">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("driver.dashboard.todayEarnings")}</p>
                <p className="break-words text-xl font-semibold text-primary" data-testid="text-today-earnings">{formatCurrency(adjustedDailyEarnings)}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border/70 bg-card px-3 py-2">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("driver.dashboard.latestStop")}</p>
                <p className="truncate text-sm font-semibold text-foreground">{latestLocationName}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-9 w-full !whitespace-normal border-border/70 bg-card px-3 text-foreground hover:bg-muted/50 sm:w-auto"
              onClick={() => setLocation('/activity')}
              data-testid="button-view-activity"
            >
              {t("common.viewAll")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </DSCard>

        {/* Support Section */}
        <DSCard padding="lg" elevated className="border-border">
          <DSSectionHeader title={t("driver.dashboard.needHelp")} />
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-words text-sm text-muted-foreground">{t("driver.dashboard.supportDescription")}</p>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span className="break-words font-medium text-primary" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="h-auto min-h-10 w-full !whitespace-normal border border-primary/30 bg-card text-foreground hover:bg-primary/10 sm:w-auto"
              onClick={() => setIsSupportDialogOpen(true)}
              data-testid="button-contact-support"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("driver.dashboard.messageSupport")}
            </Button>
          </div>
        </DSCard>

      </main>

        <MobileNav role="driver" />
        
        {/* Photo Modal */}
        <PhotoModal
          isOpen={isPhotoModalOpen}
          onClose={() => setIsPhotoModalOpen(false)}
          activity={selectedActivity}
          canApprove={false}
        />

        <SupportMessageDialog
          isOpen={isSupportDialogOpen}
          onClose={() => setIsSupportDialogOpen(false)}
        />
      </div>
    </DriverDashboardErrorBoundary>
  );
}
