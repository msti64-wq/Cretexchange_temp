import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DashboardMetricCard } from "@/components/DashboardMetricCard";
import { DashboardSectionCard } from "@/components/DashboardSectionCard";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, History, User, TrendingUp, Clock, MessageCircle, Phone, DollarSign, Wallet, ImageIcon, Ticket, ChevronDown, ChevronUp, Building2, RefreshCw, Navigation, CreditCard, Truck, Route, Loader2, ShieldAlert, ArrowRight, Activity, MapPinned } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";
import { getDriverStripeSetupMessage } from "@shared/driverPaymentStatus";

type DriverDashboardStatsRange = "today" | "week" | "month";

const DRIVER_STATS_RANGE_OPTIONS: Array<{ value: DriverDashboardStatsRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function formatStatsRange(startDate?: string | Date, endDate?: string | Date) {
  if (!startDate || !endDate) return "";

  const start = new Date(startDate);
  const end = new Date(endDate);
  const startText = formatDate(start);
  const endText = formatDate(end);

  return startText === endText ? startText : `${startText} - ${endText}`;
}

function DriverDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="gradient-bg text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-14 w-full max-w-md bg-white/20" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
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
      ? `Lottery is active for ${new Date().toLocaleDateString('en-US', { month: 'long' })} ${new Date().getFullYear()}.`
      : 'Lottery is currently disabled by an administrator.'
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
  const latestLocationName = latestActivity?.washout_locations?.name || latestActivity?.location?.name || "Latest stop";
  const latestLocationAddress = latestActivity?.washout_locations?.address || latestActivity?.location?.address || "";
  const latestActivityAmount = Number(latestActivity?.washout_activities?.amount || latestActivity?.amount || 0);
  const latestActivityStatus = latestActivity ? (latestActivity.washout_activities?.status || latestActivity.status) : null;
  const selectedStatsLabel = selectedStats?.label || DRIVER_STATS_RANGE_OPTIONS.find((option) => option.value === statsRange)?.label || "Today";
  const selectedStatsDateRange = formatStatsRange(selectedStats?.startDate, selectedStats?.endDate);
  const selectedStatsWashouts = Number(selectedStats?.totalWashouts ?? selectedStats?.visits ?? dailyStats?.visits ?? 0);
  const selectedStatsEarnings = Number(selectedStats?.totalEarnings ?? selectedStats?.earnings ?? dailyStats?.earnings ?? 0);
  const selectedStatsAverage = Number(selectedStats?.avgPerWashout ?? (selectedStatsWashouts > 0 ? selectedStatsEarnings / selectedStatsWashouts : 0));
  const driverChartData = [
    { label: selectedStatsLabel, earnings: Math.max(selectedStatsEarnings, 0), washouts: selectedStatsWashouts },
    { label: "Avg each", earnings: Math.max(selectedStatsAverage, 0), washouts: 0 },
    { label: "Paid", earnings: Math.max(totalPaid, 0), washouts: 0 },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />

      {/* GPS Status Bar */}
      <div className="border-b border-border/70 bg-card/95 px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse" />
            <span className="text-sm font-semibold tracking-tight" data-testid="text-gps-status">GPS Active</span>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            <MapPin className="h-4 w-4" />
            <span data-testid="text-current-location">Location Enabled</span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        <section className="grid gap-4 rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm md:grid-cols-[1.15fr_0.85fr] md:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Field ops
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300">
                GPS ready
              </span>
              <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {dailyStats?.visits || 0} site stops today
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Driver operations
              </p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Driver Dashboard</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Keep the truck moving, check earnings, and jump to the next washout location without losing time on site.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="default"
                className="h-auto min-h-24 flex-col items-start justify-start gap-1.5 rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 active:translate-y-0 focus-visible:ring-primary/50"
                onClick={() => setLocation('/locations')}
                data-testid="button-find-location-hero"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-semibold tracking-tight">Find Location</span>
                <span className="text-xs text-primary-foreground/85">Search nearby washout sites</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 flex-col items-start justify-start gap-1.5 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => setLocation('/wallet')}
                data-testid="button-access-wallet-hero"
              >
                <Wallet className="h-5 w-5 text-secondary" />
                <span className="text-sm font-semibold">My Wallet</span>
                <span className="text-xs text-muted-foreground">Review payout history</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 flex-col items-start justify-start gap-1 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => setLocation('/activity')}
                data-testid="button-view-all-hero"
              >
                <Activity className="h-5 w-5 text-accent" />
                <span className="text-sm font-semibold">Recent Activity</span>
                <span className="text-xs text-muted-foreground">Open washout history</span>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latest stop</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight">{latestLocationName}</h3>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Truck className="h-5 w-5" />
              </div>
            </div>

            {latestActivity ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Route className="h-4 w-4 text-secondary" />
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
                  <div className="text-right">
                    <p className="text-2xl font-semibold tracking-tight text-foreground">
                      {formatCurrency(latestActivityAmount)}
                    </p>
                    <div className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      latestActivityStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : isPendingWashoutApproval(latestActivityStatus)
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                    }`}>
                      {getWashoutApprovalDisplayStatus(latestActivityStatus)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weekly net</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(weeklyNetEarnings)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Wallet total</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(totalPaid)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <DashboardEmptyState
                  title="No recent washouts yet"
                  description="Your next location stop will appear here with payout details."
                  icon={Truck}
                  toneClassName="bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-300"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setLocation('/locations')}
                    >
                      Find a location
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </section>

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
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-semibold text-amber-900 dark:text-amber-100">
                  Complete Your Profile
                </h3>
                <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
                  Please complete your profile and set up Stripe payouts to receive optional owner-funded tips.
                </p>
                <Button
                  size="sm"
                  onClick={() => setLocation('/profile')}
                  className="h-10 bg-amber-600 text-white hover:bg-amber-700"
                  data-testid="button-complete-profile"
                >
                  Complete Profile
                </Button>
              </div>
            </div>
          </div>
        )}

        {awaitingDriverStripeCount > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-semibold text-amber-900 dark:text-amber-100">
                  Tip payout setup needed
                </h3>
                <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
                  {getDriverStripeSetupMessage()}
                </p>
                <Button
                  size="sm"
                  onClick={() => setLocation('/profile')}
                  className="h-10 bg-amber-600 text-white hover:bg-amber-700"
                  data-testid="button-complete-stripe-setup"
                >
                  Set Up Tip Payouts
                </Button>
                <div className="mt-3 space-y-2">
                  {awaitingDriverStripePayments.slice(0, 3).map((payment: any) => (
                    <div key={payment.id} className="rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {payment.location?.name || payment.activity?.location?.name || "Washout"}
                        </span>
                        <span>{formatCurrency(Number(payment.amount || 0) + Number((payment.tipAmountCents || 0) / 100))}</span>
                      </div>
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Awaiting your tip payout setup before owner-funded tips can be processed.
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Daily operations
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Driver Dashboard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} performance and payout status.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => refetch()}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              title="Site Visits"
              value={dailyStats?.visits || 0}
              helper="Completed today"
              icon={Navigation}
              toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
              dataTestId="text-daily-visits"
            />
            <DashboardMetricCard
              title="Today's Earnings"
              value={formatCurrency(adjustedDailyEarnings)}
              helper={rejectedTotal > 0 ? `${formatCurrency(rejectedTotal)} rejected` : "Net of rejected washouts"}
              icon={DollarSign}
              toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-daily-earnings"
            />
            <DashboardMetricCard
              title="7-Day Net"
              value={formatCurrency(weeklyNetEarnings)}
              helper={`${weeklyStats?.totalWashouts || 0} washouts this week`}
              icon={TrendingUp}
              toneClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
              dataTestId="text-net-earnings"
            />
            <DashboardMetricCard
              title="Total Paid"
              value={formatCurrency(totalPaid)}
              helper="Recorded payment history"
              icon={CreditCard}
              toneClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300"
              dataTestId="text-total-paid"
            />
          </div>
        </section>

        {/* Lottery Entries Card - always visible */}
        <Card className="overflow-hidden rounded-3xl border-border/70 bg-card/95 shadow-sm">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-600" />
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 ${lotteryActive ? 'bg-amber-500 text-white dark:border-amber-900/40' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                  <Ticket className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Monthly lottery</p>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {lotteryActive ? 'Lottery active' : 'Lottery disabled'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {currentLotteryStatusMessage}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-left sm:text-right">
                <div className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-lottery-entries">
                  {lotteryActive ? lotteryEntryCount : '—'}
                </div>
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {lotteryActive ? 'entries this month' : 'not available'}
                </div>
                {lotteryActive && currentLotteryDrawing && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Current drawing: {currentLotteryDrawing.lotteryMonth}/{currentLotteryDrawing.lotteryYear}
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
                  className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60"
                >
                  {showLotteryEntries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showLotteryEntries ? "Hide" : "View"} my entries
                </button>

                {showLotteryEntries && (
                  <div className="space-y-2 border-t border-border/70 pt-3">
                    {lotteryEntriesLoading ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading entries...
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
                            className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <Building2 className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                <p className="truncate text-xs font-semibold text-foreground">
                                  {entry.locationName || entry.ownerCompany || "Location"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Ticket className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                  +{entry.entriesEarned}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground">
                                {entry.activityDate
                                  ? new Date(entry.activityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              {entry.ticketNumber && (
                                <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] font-mono font-semibold text-foreground">
                                  #{entry.ticketNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <DashboardEmptyState
                        title="No entries found"
                        description="You don’t have any lottery entries for this month yet."
                        icon={Ticket}
                        toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {lotteryActive && lotteryEntryCount === 0 && (
              <p className="py-1 text-center text-xs text-muted-foreground">
                Complete washouts at participating locations to earn entries.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/10"
            onClick={() => setLocation('/locations')}
            data-testid="button-find-location"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-sm shadow-primary/20">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Find Location</div>
              <div className="text-xs text-muted-foreground">Open washout site list</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/wallet')}
            data-testid="button-access-wallet"
          >
            <Wallet className="h-5 w-5 text-secondary" />
            <div>
              <div className="text-sm font-semibold">My Wallet</div>
              <div className="text-xs text-muted-foreground">Check payout history</div>
            </div>
          </Button>
        </section>

        {/* Earnings Summary */}
        <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <DashboardSectionCard
            title="Washout Stats Mix"
            description={`${selectedStatsLabel} washout stats${selectedStatsDateRange ? ` · ${selectedStatsDateRange}` : ""}`}
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            action={
              <ToggleGroup
                type="single"
                value={statsRange}
                onValueChange={(value) => {
                  if (value) setStatsRange(value as DriverDashboardStatsRange);
                }}
                className="rounded-lg border border-border/70 bg-muted/40 p-1"
                data-testid="toggle-washout-stats-range"
              >
                {DRIVER_STATS_RANGE_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    size="sm"
                    className="h-8 rounded-md px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
                    data-testid={`button-washout-stats-${option.value}`}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Period</p>
                  <p className="mt-1 text-sm font-semibold text-foreground" data-testid="text-washout-stats-period">
                    {selectedStatsLabel}
                  </p>
                  {selectedStatsDateRange && (
                    <p className="mt-1 text-xs text-muted-foreground" data-testid="text-washout-stats-range-label">
                      {selectedStatsDateRange}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Washouts</p>
                  <p className="mt-1 text-lg font-semibold text-foreground" data-testid="text-washout-stats-total">
                    {selectedStatsWashouts}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Earned</p>
                  <p className="mt-1 text-lg font-semibold text-foreground" data-testid="text-washout-stats-earnings">
                    {formatCurrency(selectedStatsEarnings)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground" data-testid="text-washout-stats-average">
                    Avg {formatCurrency(selectedStatsAverage)}
                  </p>
                </div>
              </div>
              <ChartContainer
                config={{
                  earnings: { label: "Earnings", color: "var(--chart-1)" },
                }}
                className="h-[210px] w-full"
              >
                <BarChart data={driverChartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="earnings" fill="var(--color-earnings)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard title="7-Day Details">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Earned</span>
                <span className="text-xl font-semibold text-foreground" data-testid="text-weekly-earnings">
                  {formatCurrency(weeklyEarnings)}
                </span>
              </div>
              {rejectedTotal > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Rejected Amount</span>
                  <span className="text-base font-semibold text-red-600 dark:text-red-400" data-testid="text-weekly-rejected">
                    -{formatCurrency(rejectedTotal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Net Earnings</span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(weeklyNetEarnings)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Washouts</p>
                  <p className="text-lg font-semibold" data-testid="text-weekly-washouts">{weeklyStats?.totalWashouts || 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Avg Each</p>
                  <p className="text-lg font-semibold" data-testid="text-avg-washout">{formatCurrency(weeklyStats?.avgPerWashout || 0)}</p>
                </div>
              </div>
              {rejectedWashouts.length > 0 && (
                <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-rejected-washouts">
                  {rejectedWashouts.length} rejected washouts totaling {formatCurrency(rejectedTotal)}
                </p>
              )}
            </div>
          </DashboardSectionCard>
        </div>

        {/* Payment Status */}
        <DashboardSectionCard
          title="Payment Status"
          description="Payout snapshot and settlement details."
          icon={<DollarSign className="w-5 h-5 text-green-600" />}
        >
          <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Pending today</div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300" data-testid="text-pending-earnings">
                    {formatCurrency(adjustedDailyEarnings)}
                  </div>
                  <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">Awaiting settlement</div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">Total paid</div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-sky-700 dark:text-sky-300">
                    {formatCurrency(totalPaid)}
                  </div>
                  <div className="mt-1 text-xs text-sky-700/80 dark:text-sky-300/80">Recorded payment history</div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <span>Payments processed weekly</span>
                <span className="font-medium text-foreground">You receive full amounts</span>
              </div>
          </div>
        </DashboardSectionCard>

        {/* Recent Activity */}
        <StatCard
          title="Recent Washouts"
          subtitle={
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-2 text-primary hover:text-primary/80"
              onClick={() => setLocation('/activity')}
              data-testid="button-view-all"
            >
              View All
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          }
        >
          <div className="space-y-3">
            {!recentActivities?.length ? (
              <DashboardEmptyState
                title="No recent washouts"
                description="New site activity will appear here once a washout is submitted."
                icon={Clock}
                toneClassName="bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-300"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setLocation('/locations')}
                  >
                    Find a location
                  </Button>
                }
              />
            ) : (
              recentActivities.map((activity: any, index: number) => (
                <div key={activity.washout_activities?.id || activity.id || index} className="space-y-3 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm" data-testid={`card-activity-${index}`}>
                  <div className="flex items-start justify-between gap-3">
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
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.washout_activities?.amount || activity.amount || 0))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                        <MapPinned className="h-4 w-4 text-secondary" />
                        <span className="truncate">{activity.washout_locations?.name || activity.location?.name || 'Unknown Location'}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {activity.washout_locations?.address || activity.location?.address || 'Address unavailable'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        (activity.washout_activities?.status || activity.status) === 'verified'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : isPendingWashoutApproval(activity.washout_activities?.status || activity.status)
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                      }`} data-testid={`text-activity-status-${index}`}>
                        {getWashoutApprovalDisplayStatus(activity.washout_activities?.status || activity.status)}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {activity.location?.owner?.user?.firstName || activity.washout_locations?.owner?.user?.firstName
                          ? `Owner: ${activity.location?.owner?.user?.firstName || activity.washout_locations?.owner?.user?.firstName} ${activity.location?.owner?.user?.lastName || activity.washout_locations?.owner?.user?.lastName || ''}`
                          : 'Owner contact not available'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    {(activity.washout_locations?.address || activity.location?.address) && (
                      <div className="text-xs text-muted-foreground">
                        {activity.washout_locations?.address || activity.location?.address}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() => {
                        console.log("Driver Photo Button Clicked:", activity);
                        setSelectedActivity(activity);
                        setIsPhotoModalOpen(true);
                      }}
                      data-testid={`button-view-photos-${index}`}
                    >
                      <ImageIcon className="mr-1 h-4 w-4" />
                      Photos
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </StatCard>

        {/* Support Section */}
        <StatCard title="Need Help?" className="border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:border-sky-900/40 dark:from-sky-950/20 dark:to-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">Contact the operations team for help with washouts, payouts, or site access.</p>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-sky-600" />
                <span className="font-medium text-sky-700 dark:text-sky-300" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="h-10 w-full bg-sky-600 text-white hover:bg-sky-700 sm:w-auto"
              onClick={() => setIsSupportDialogOpen(true)}
              data-testid="button-contact-support"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Message Support
            </Button>
          </div>
        </StatCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/activity')}
            data-testid="button-view-history"
          >
            <History className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">View History</div>
              <div className="text-xs text-muted-foreground">Download CSV</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
          >
            <User className="h-5 w-5 text-secondary" />
            <div>
              <div className="text-sm font-semibold">Profile</div>
              <div className="text-xs text-muted-foreground">Update Details</div>
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
  );
}
