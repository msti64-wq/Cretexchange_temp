import { Component, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, History, User, TrendingUp, Clock, MessageCircle, Phone, DollarSign, Wallet, ImageIcon, Ticket, ChevronDown, ChevronUp, Building2, RefreshCw, Navigation, CreditCard, Truck, Route, Loader2, ShieldAlert, ArrowRight, Activity, MapPinned } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatAddress } from "@shared/addressUtils";
import { getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";

type DriverDashboardStatsRange = "today" | "week" | "month";

const DRIVER_STATS_RANGE_OPTIONS: Array<{ value: DriverDashboardStatsRange; labelKey: string }> = [
  { value: "today", labelKey: "driver.dashboard.rangeToday" },
  { value: "week", labelKey: "driver.dashboard.rangeWeek" },
  { value: "month", labelKey: "driver.dashboard.rangeMonth" },
];

function formatStatsRange(startDate?: string | Date, endDate?: string | Date) {
  if (!startDate || !endDate) return "";

  const start = new Date(startDate);
  const end = new Date(endDate);
  const startText = formatDate(start);
  const endText = formatDate(end);

  return startText === endText ? startText : `${startText} - ${endText}`;
}

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
        <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background">
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
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20">
      <div className="gradient-bg text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-14 w-full max-w-md bg-white/20" />
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

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: [`/api/drivers/dashboard?statsRange=${statsRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: paymentHistory } = useQuery({
    queryKey: ['/api/payments/driver-history'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: lotteryEntries, isLoading: lotteryEntriesLoading } = useQuery<any[]>({
    queryKey: ['/api/drivers/lottery-entries', currentMonth, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/drivers/lottery-entries?month=${currentMonth}&year=${currentYear}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch entries');
      return res.json();
    },
    enabled: showLotteryEntries,
  });

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
  const selectedStats = (dashboardData as any)?.selectedStats || null;
  const recentActivities = (dashboardData as any)?.recentActivities || null;
  const lotteryStatus = (dashboardData as any)?.lotteryStatus || null;
  const lotteryEntryCount = lotteryStatus?.driverEntryCount ?? ((dashboardData as any)?.lotteryEntryCount || 0);
  const lotteryActive = lotteryStatus?.enabled ?? ((dashboardData as any)?.lotteryActive ?? true);
  const currentLotteryDrawing = lotteryStatus?.currentDrawing || null;
  const currentLotteryStatusMessage = lotteryStatus?.currentDrawingMessage || (
    lotteryActive
      ? t("driver.dashboard.lotteryActive", {
          month: new Date().toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "long" }),
          year: new Date().getFullYear(),
        })
      : t("driver.dashboard.lotteryDisabled")
  );
  const awaitingDriverStripePayments = Array.isArray((dashboardData as any)?.awaitingDriverStripePayments)
    ? (dashboardData as any).awaitingDriverStripePayments
    : [];
  const awaitingDriverStripeCount = Number((dashboardData as any)?.awaitingDriverStripeCount || 0);

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
  const selectedStatsLabel = getDriverStatsRangeLabel(statsRange, t, selectedStats?.label);
  const selectedStatsDateRange = formatStatsRange(selectedStats?.startDate, selectedStats?.endDate);
  const selectedStatsWashouts = Number(selectedStats?.totalWashouts ?? selectedStats?.visits ?? dailyStats?.visits ?? 0);
  const selectedStatsEarnings = Number(selectedStats?.totalEarnings ?? selectedStats?.earnings ?? dailyStats?.earnings ?? 0);
  const selectedStatsAverage = Number(selectedStats?.avgPerWashout ?? (selectedStatsWashouts > 0 ? selectedStatsEarnings / selectedStatsWashouts : 0));
  const driverChartData = [
    { label: selectedStatsLabel, earnings: Math.max(selectedStatsEarnings, 0), washouts: selectedStatsWashouts },
    { label: t("driver.dashboard.avgEach"), earnings: Math.max(selectedStatsAverage, 0), washouts: 0 },
    { label: t("driver.dashboard.paid"), earnings: Math.max(totalPaid, 0), washouts: 0 },
  ];

  return (
    <DriverDashboardErrorBoundary>
      <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20">
        <DriverHeader />

        {/* GPS Status Bar */}
        <DSCard className="w-full max-w-full rounded-none border-x-0 border-t-0 px-3 py-3 sm:px-4" padding="sm" elevated>
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse" />
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight" data-testid="text-gps-status">{t("driver.dashboard.gpsActive")}</span>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" data-testid="text-current-location">{t("driver.dashboard.locationEnabled")}</span>
            </div>
          </div>
        </DSCard>
 
        <main className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
          <DSCard className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[1.15fr_0.85fr]" padding="lg" elevated>
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full break-words rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.fieldOps")}
              </span>
              <span className="max-w-full break-words rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300 sm:tracking-[0.16em]">
                {t("driver.dashboard.gpsReady")}
              </span>
              <span className="max-w-full break-words rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
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
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 active:translate-y-0 focus-visible:ring-primary/50"
                onClick={() => setLocation('/locations')}
                data-testid="button-find-location-hero"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                <span className="break-words text-sm font-semibold tracking-tight">{t("driver.dashboard.findLocation")}</span>
                <span className="break-words text-xs text-primary-foreground/85">{t("driver.dashboard.findLocationHelp")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => setLocation('/wallet')}
                data-testid="button-access-wallet-hero"
              >
                <Wallet className="h-5 w-5 text-secondary" />
                <span className="break-words text-sm font-semibold">{t("driver.dashboard.myWallet")}</span>
                <span className="break-words text-xs text-muted-foreground">{t("driver.dashboard.walletHelp")}</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1 !whitespace-normal rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => setLocation('/activity')}
                data-testid="button-view-all-hero"
              >
                <Activity className="h-5 w-5 text-accent" />
                <span className="break-words text-sm font-semibold">{t("nav.activity")}</span>
                <span className="break-words text-xs text-muted-foreground">{t("driver.dashboard.recentWashoutsDescription")}</span>
              </Button>
            </div>
          </div>

          <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/30 p-4 shadow-sm">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">{t("driver.dashboard.latestStop")}</p>
                <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-sky-300 dark:text-sky-300">{latestLocationName}</h3>
              </div>
              <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
                <Truck className="h-5 w-5" />
              </div>
            </div>

            {latestActivity ? (
              <div className="mt-4 space-y-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-sky-300 dark:text-sky-300">
                      <Route className="h-4 w-4 shrink-0 text-secondary" />
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
                    <p className="break-words text-2xl font-semibold tracking-tight text-sky-300 dark:text-sky-300">
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

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.14em]">{t("driver.dashboard.weeklyNet")}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-sky-300 dark:text-sky-300">{formatCurrency(weeklyNetEarnings)}</p>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.14em]">{t("driver.dashboard.totalPaid")}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-sky-300 dark:text-sky-300">{formatCurrency(totalPaid)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <DashboardEmptyState
                  title={t("driver.dashboard.noRecentWashouts")}
                  description={t("driver.dashboard.noRecentWashoutsDescription")}
                  icon={Truck}
                  toneClassName="bg-slate-50 text-foreground dark:bg-slate-950/30 dark:text-foreground"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-9 w-full !whitespace-normal sm:w-auto"
                      onClick={() => setLocation('/locations')}
                    >
                      {t("driver.dashboard.findLocation")}
                    </Button>
                  }
                />
              </div>
            )}
          </div>
          </DSCard>

        {/* Profile Completion Notice */}
        {(dashboardData as any)?.user && (
          !(dashboardData as any).user.phone || 
          !(dashboardData as any).user.street || 
          !(dashboardData as any).user.city || 
          !(dashboardData as any).user.state || 
          !(dashboardData as any).user.zip || 
          !(dashboardData as any).user.roleData?.employerName ||
          !(dashboardData as any).user.roleData?.truckNumber ||
          !(dashboardData as any).user.roleData?.hasAgreedToTerms
        ) && (
          <div className="w-full max-w-full overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 break-words font-semibold text-amber-900 dark:text-amber-100">
                  {t("driver.dashboard.completeProfileTitle")}
                </h3>
                <p className="mb-3 break-words text-sm text-amber-800 dark:text-amber-200">
                  {t("driver.dashboard.completeProfileDescription")}
                </p>
                <Button
                  size="sm"
                  onClick={() => setLocation('/profile')}
                  className="h-auto min-h-10 w-full !whitespace-normal bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                  data-testid="button-complete-profile"
                >
                  {t("driver.dashboard.completeProfile")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {awaitingDriverStripeCount > 0 && (
          <div className="w-full max-w-full overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 break-words font-semibold text-amber-900 dark:text-amber-100">
                  {t("driver.dashboard.tipPayoutSetupNeeded")}
                </h3>
                <p className="mb-3 break-words text-sm text-amber-800 dark:text-amber-200">
                  {t("driver.payout.notStartedMessage")}
                </p>
                <Button
                  size="sm"
                  onClick={() => setLocation('/profile')}
                  className="h-auto min-h-10 w-full !whitespace-normal bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
                  data-testid="button-complete-stripe-setup"
                >
                  {t("driver.dashboard.setUpTipPayouts")}
                </Button>
                <div className="mt-3 space-y-2">
                  {awaitingDriverStripePayments.slice(0, 3).map((payment: any) => (
                    <div key={payment.id} className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
                      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="min-w-0 break-words font-medium">
                          {payment.location?.name || payment.activity?.location?.name || t("common.washouts")}
                        </span>
                        <span className="min-w-0 break-words font-semibold text-sky-300 dark:text-sky-300 sm:shrink-0">{formatCurrency(Number(payment.amount || 0) + Number((payment.tipAmountCents || 0) / 100))}</span>
                      </div>
                      <p className="mt-1 break-words text-xs text-amber-700 dark:text-amber-300">
                        {t("driver.dashboard.awaitingTipPayoutSetup")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Snapshot */}
        <section className="space-y-3">
          <DSSectionHeader
            eyebrow={t("driver.dashboard.dailyOperations")}
            title={t("driver.dashboard.title")}
            description={t("driver.dashboard.dailySubtitle", {
              date: new Date().toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }),
            })}
            actions={
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
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        {/* Lottery Entries Card - always visible */}
        <DSCard className="w-full max-w-full overflow-hidden" padding="none" elevated>
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-600" />
          <CardContent className="min-w-0 space-y-4 p-4 min-[430px]:p-5">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 ${lotteryActive ? 'bg-amber-500 text-white dark:border-amber-900/40' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                  <Ticket className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">{t("driver.dashboard.monthlyLottery")}</p>
                  <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                    {lotteryActive ? t("driver.dashboard.lotteryActiveTitle") : t("driver.dashboard.lotteryDisabledTitle")}
                  </h3>
                  <p className="break-words text-sm text-sky-500 dark:text-sky-300">
                    {currentLotteryStatusMessage}
                  </p>
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-left sm:text-right">
                <div className="break-words text-3xl font-semibold tracking-tight text-sky-500 dark:text-sky-300" data-testid="text-lottery-entries">
                  {lotteryActive ? lotteryEntryCount : '—'}
                </div>
                <div className="break-words text-xs uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.14em]">
                  {lotteryActive ? t("driver.dashboard.entriesThisMonth") : t("driver.dashboard.notAvailable")}
                </div>
                {lotteryActive && currentLotteryDrawing && (
                  <p className="mt-2 break-words text-[11px] text-muted-foreground">
                    {t("driver.dashboard.currentDrawing", { month: currentLotteryDrawing.lotteryMonth, year: currentLotteryDrawing.lotteryYear })}
                    {currentLotteryDrawing.drawingDate
                      ? ` · ${new Date(currentLotteryDrawing.drawingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : ''}
                  </p>
                )}
              </div>
            </div>

            {lotteryActive && lotteryEntryCount > 0 && (
              <>
                <button
                  onClick={() => setShowLotteryEntries(!showLotteryEntries)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-sky-700/60 bg-slate-800/80 px-3 py-2 text-left text-xs font-semibold text-sky-400 transition-colors hover:bg-sky-600 hover:text-white dark:bg-slate-900/80 dark:text-sky-300 dark:hover:bg-sky-600 dark:hover:text-white"
                >
                  {showLotteryEntries ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 break-words">{showLotteryEntries ? t("driver.dashboard.hideEntries") : t("driver.dashboard.viewEntries")}</span>
                </button>

                {showLotteryEntries && (
                  <div className="space-y-2 border-t border-border/70 pt-3">
                    {lotteryEntriesLoading ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("driver.dashboard.loadingEntries")}
                        </div>
                        {[1, 2].map(i => (
                          <div key={i} className="h-12 rounded-2xl bg-muted/50" />
                        ))}
                      </div>
                    ) : lotteryEntries && lotteryEntries.length > 0 ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {lotteryEntries.map((entry: any) => (
                          <div
                            key={entry.id}
                            className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/30 px-3 py-3"
                          >
                            <div className="flex min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between min-[430px]:gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <Building2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                <p className="truncate text-xs font-semibold text-foreground">
                                  {entry.locationName || entry.ownerCompany || t("common.locations")}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Ticket className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                  +{entry.entriesEarned}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 flex min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between min-[430px]:gap-3">
                              <p className="break-words text-xs text-muted-foreground">
                                {entry.activityDate
                                  ? new Date(entry.activityDate).toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" })
                                  : new Date(entry.createdAt).toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                              {entry.ticketNumber && (
                                <span className="max-w-full break-words rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] font-mono font-semibold text-foreground">
                                  #{entry.ticketNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <DashboardEmptyState
                        title={t("driver.dashboard.noEntriesFound")}
                        description={t("driver.dashboard.noEntriesDescription")}
                        icon={Ticket}
                        toneClassName="bg-amber-50 text-foreground dark:bg-amber-950/30 dark:text-foreground"
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {lotteryActive && lotteryEntryCount === 0 && (
              <p className="py-1 text-center text-xs text-muted-foreground">
                {t("driver.dashboard.earnEntries")}
              </p>
            )}
          </CardContent>
        </DSCard>

        {/* Quick Actions */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-2 !whitespace-normal rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/10"
            onClick={() => setLocation('/locations')}
            data-testid="button-find-location"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-sm shadow-primary/20">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold text-foreground">{t("driver.dashboard.findLocation")}</div>
              <div className="break-words text-xs text-muted-foreground">{t("driver.dashboard.openWashoutSiteList")}</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-2 !whitespace-normal rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/wallet')}
            data-testid="button-access-wallet"
          >
            <Wallet className="h-5 w-5 text-secondary" />
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold">{t("driver.dashboard.myWallet")}</div>
              <div className="break-words text-xs text-muted-foreground">{t("driver.dashboard.checkPayoutHistory")}</div>
            </div>
          </Button>
        </section>

        {/* Earnings Summary */}
        <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <DSCard padding="lg" elevated>
            <DSSectionHeader
              eyebrow={t("driver.dashboard.washoutStatsMix")}
              title={t("driver.dashboard.washoutStatsMix")}
              description={`${t("driver.dashboard.periodDisplayed", { period: selectedStatsLabel })}${selectedStatsDateRange ? ` - ${selectedStatsDateRange}` : ""}`}
              actions={
                <ToggleGroup
                  type="single"
                  value={statsRange}
                  onValueChange={(value) => {
                    if (value) setStatsRange(value as DriverDashboardStatsRange);
                  }}
                  className="flex w-full max-w-full min-w-0 flex-wrap rounded-lg border border-border/70 bg-muted/40 p-1 sm:w-auto"
                  data-testid="toggle-washout-stats-range"
                >
                  {DRIVER_STATS_RANGE_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      size="sm"
                      className="h-auto min-h-8 min-w-0 flex-1 basis-0 whitespace-normal rounded-md border border-border/70 bg-slate-900/80 px-2 text-xs text-slate-100 transition-colors hover:bg-slate-700 hover:text-white data-[state=on]:border-orange-700 data-[state=on]:bg-orange-600 data-[state=on]:text-white data-[state=on]:shadow-sm sm:flex-none sm:basis-auto sm:px-3 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-700 dark:hover:text-white"
                      data-testid={`button-washout-stats-${option.value}`}
                    >
                      <span className="truncate">{t(option.labelKey)}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              }
            />
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <DSKpiCard label={t("driver.dashboard.period")} value={selectedStatsLabel} detail={selectedStatsDateRange || undefined} accentTone="info" />
                <DSKpiCard label={t("common.washouts")} value={selectedStatsWashouts} detail={t("driver.dashboard.entriesThisMonth")} accentTone="accent" />
                <DSKpiCard label={t("driver.dashboard.earned")} value={formatCurrency(selectedStatsEarnings)} detail={`${t("driver.dashboard.average")} ${formatCurrency(selectedStatsAverage)}`} accentTone="success" />
              </div>
              <ChartContainer
                config={{
                  earnings: { label: t("driver.dashboard.earnings"), color: "#3B82F6" },
                }}
                className="h-[190px] w-full max-w-full min-w-0 overflow-hidden min-[430px]:h-[210px]"
              >
                <BarChart data={driverChartData} margin={{ left: -28, right: 4, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
                  <YAxis hide />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="earnings" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </DSCard>

          <DSCard padding="lg" elevated>
            <DSSectionHeader title={t("driver.dashboard.sevenDayDetails")} />
            <div className="space-y-3">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="break-words text-sm text-muted-foreground">{t("driver.dashboard.totalEarned")}</span>
                <span className="break-words text-xl font-semibold text-foreground sm:text-right" data-testid="text-weekly-earnings">
                  {formatCurrency(weeklyEarnings)}
                </span>
              </div>
              {rejectedTotal > 0 && (
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-words text-sm text-muted-foreground">{t("driver.dashboard.rejectedAmount")}</span>
                  <span className="break-words text-base font-semibold text-red-600 dark:text-red-400 sm:text-right" data-testid="text-weekly-rejected">
                    -{formatCurrency(rejectedTotal)}
                  </span>
                </div>
              )}
              <DSStatusChip tone="success" className="flex w-full justify-between rounded-2xl px-3 py-2 text-sm font-medium">
                <span>{t("driver.dashboard.netEarnings")}</span>
                <span className="font-bold">{formatCurrency(weeklyNetEarnings)}</span>
              </DSStatusChip>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <DSCard padding="sm">
                  <p className="break-words text-xs text-muted-foreground">{t("common.washouts")}</p>
                  <p className="break-words text-lg font-semibold" data-testid="text-weekly-washouts">{weeklyStats?.totalWashouts || 0}</p>
                </DSCard>
                <DSCard padding="sm">
                  <p className="break-words text-xs text-muted-foreground">{t("driver.dashboard.avgEach")}</p>
                  <p className="break-words text-lg font-semibold" data-testid="text-avg-washout">{formatCurrency(weeklyStats?.avgPerWashout || 0)}</p>
                </DSCard>
              </div>
              {rejectedWashouts.length > 0 && (
                <p className="break-words text-xs text-red-600 dark:text-red-400" data-testid="text-rejected-washouts">
                  {t("driver.dashboard.rejectedTotal", { count: rejectedWashouts.length, amount: formatCurrency(rejectedTotal) })}
                </p>
              )}
            </div>
          </DSCard>
        </div>

        {/* Payment Status */}
        <DSCard padding="lg" elevated>
          <DSSectionHeader
            title={t("driver.dashboard.paymentStatus")}
            description={t("driver.dashboard.paymentStatusDescription")}
            eyebrow={<DollarSign className="inline-block h-4 w-4 align-[-2px] text-green-600" />}
          />
          <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300 sm:tracking-[0.14em]">{t("driver.dashboard.pendingToday")}</div>
                  <div className="mt-2 break-words text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300" data-testid="text-pending-earnings">
                    {formatCurrency(adjustedDailyEarnings)}
                  </div>
                  <div className="mt-1 break-words text-xs text-emerald-700/80 dark:text-emerald-300/80">{t("driver.dashboard.awaitingSettlement")}</div>
                </div>
                <div className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                  <div className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300 sm:tracking-[0.14em]">{t("driver.dashboard.totalPaid")}</div>
                  <div className="mt-2 break-words text-2xl font-semibold tracking-tight text-sky-700 dark:text-sky-300">
                    {formatCurrency(totalPaid)}
                  </div>
                  <div className="mt-1 break-words text-xs text-sky-700/80 dark:text-sky-300/80">{t("driver.dashboard.recordedPaymentHistory")}</div>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="break-words text-sky-500 dark:text-sky-300">{t("driver.dashboard.paymentsProcessedWeekly")}</span>
                <span className="break-words font-medium text-foreground sm:text-right">{t("driver.dashboard.fullAmounts")}</span>
              </div>
          </div>
        </DSCard>

        {/* Recent Activity */}
        <DSCard padding="lg" elevated>
          <DSSectionHeader
            title={t("driver.dashboard.recentWashouts")}
            actions={
              <Button
                variant="default"
                size="sm"
                className="h-auto min-h-9 w-full !whitespace-normal bg-sky-600 px-3 text-white hover:bg-sky-700 sm:w-auto"
                onClick={() => setLocation('/activity')}
                data-testid="button-view-all"
              >
                {t("common.viewAll")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            }
          />
          <div className="space-y-3">
            {!recentActivities?.length ? (
              <DashboardEmptyState
                title={t("driver.dashboard.noRecentWashouts")}
                description={t("driver.dashboard.noRecentWashoutsDescription")}
                icon={Clock}
                toneClassName="bg-slate-50 text-foreground dark:bg-slate-950/30 dark:text-foreground"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 w-full !whitespace-normal sm:w-auto"
                    onClick={() => setLocation('/locations')}
                  >
                    {t("driver.dashboard.findLocation")}
                  </Button>
                }
              />
            ) : (
              recentActivities.map((activity: any, index: number) => (
                <DSCard key={activity.washout_activities?.id || activity.id || index} padding="md" className="min-w-0 space-y-3" data-testid={`card-activity-${index}`}>
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Route className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" data-testid={`text-activity-date-${index}`}>
                          {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground" data-testid={`text-activity-time-${index}`}>
                          {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="min-w-0 text-left sm:text-right">
                      <div className="break-words text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.washout_activities?.amount || activity.amount || 0))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <DSCard padding="sm" elevated={false} className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                        <MapPinned className="h-4 w-4 shrink-0 text-secondary" />
                        <span className="truncate">{activity.washout_locations?.name || activity.location?.name || t("driver.activity.unknownLocation")}</span>
                      </div>
                      <div className="mt-1 break-words text-xs text-muted-foreground">
                        {activity.washout_locations?.address || activity.location?.address || formatAddress(activity.washout_locations || activity.location || {}) || t("driver.dashboard.addressUnavailable")}
                      </div>
                    </DSCard>
                    <DSCard padding="sm" elevated={false} className="min-w-0">
                      <div className="mt-2">
                        <DSStatusChip
                          tone={(activity.washout_activities?.status || activity.status) === 'verified'
                            ? 'success'
                            : isPendingWashoutApproval(activity.washout_activities?.status || activity.status)
                              ? 'warning'
                              : 'danger'}
                          className="max-w-full whitespace-normal"
                          data-testid={`text-activity-status-${index}`}
                        >
                          {translateWashoutApprovalStatus(activity.washout_activities?.status || activity.status, t)}
                        </DSStatusChip>
                      </div>
                      {(activity.location?.owner?.user?.firstName || activity.washout_locations?.owner?.user?.firstName) && (
                        <p className="mt-2 break-words text-xs text-muted-foreground">
                          {t("driver.activity.ownerName", { name: `${activity.location?.owner?.user?.firstName || activity.washout_locations?.owner?.user?.firstName} ${activity.location?.owner?.user?.lastName || activity.washout_locations?.owner?.user?.lastName || ''}`.trim() })}
                        </p>
                      )}
                    </DSCard>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    {(activity.washout_locations?.address || activity.location?.address) && (
                      <div className="min-w-0 break-words text-xs text-muted-foreground">
                        {activity.washout_locations?.address || activity.location?.address}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-auto min-h-9 w-full !whitespace-normal px-3 text-xs sm:w-auto ${
                        isPhotoModalOpen && selectedActivity?.id === activity.id
                          ? "border-orange-700 bg-orange-600 text-white hover:bg-orange-700 hover:text-white"
                          : "border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-700 hover:text-white"
                      }`}
                      onClick={() => {
                        console.log("Driver Photo Button Clicked:", activity);
                        setSelectedActivity(activity);
                        setIsPhotoModalOpen(true);
                      }}
                      data-testid={`button-view-photos-${index}`}
                    >
                      <ImageIcon className="mr-1 h-4 w-4" />
                      {t("common.photos")}
                    </Button>
                  </div>
                </DSCard>
              ))
            )}
          </div>
        </DSCard>

        {/* Support Section */}
        <DSCard padding="lg" elevated className="border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:border-sky-900/40 dark:from-sky-950/20 dark:to-slate-900">
          <DSSectionHeader title={t("driver.dashboard.needHelp")} />
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="break-words text-sm text-muted-foreground">{t("driver.dashboard.supportDescription")}</p>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Phone className="h-4 w-4 shrink-0 text-sky-600" />
                <span className="break-words font-medium text-sky-700 dark:text-sky-300" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="h-auto min-h-10 w-full !whitespace-normal bg-sky-600 text-white hover:bg-sky-700 sm:w-auto"
              onClick={() => setIsSupportDialogOpen(true)}
              data-testid="button-contact-support"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("driver.dashboard.messageSupport")}
            </Button>
          </div>
        </DSCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Button 
            variant="outline" 
            className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-2 !whitespace-normal rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/activity')}
            data-testid="button-view-history"
          >
            <History className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold">{t("driver.dashboard.viewHistory")}</div>
              <div className="break-words text-xs text-muted-foreground">{t("driver.dashboard.downloadCsv")}</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-2 !whitespace-normal rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
          >
            <User className="h-5 w-5 text-secondary" />
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold">{t("common.profile")}</div>
              <div className="break-words text-xs text-muted-foreground">{t("driver.dashboard.updateDetails")}</div>
            </div>
          </Button>
        </div>
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
