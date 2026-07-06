import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DashboardMetricCard } from "@/components/DashboardMetricCard";
import { DashboardSectionCard } from "@/components/DashboardSectionCard";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { Users, Building, DollarSign, Download, MessageCircle, Clock, CheckCircle, Search, X, Flag, Gift, PackageCheck, CreditCard, Ticket } from "lucide-react";
import { formatCurrency, formatCentsToDollars } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { LogoutButton } from "@/components/LogoutButton";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";
import { ShieldAlert, UsersRound } from "lucide-react";

function AdminDashboardSkeleton({ role }: { role?: "driver" | "owner" | "admin" | "super_admin" }) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="gradient-bg text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-14 w-full max-w-lg bg-white/20" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </main>
      <MobileNav role={role} />
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState("30");
  const [messageSearchTerm, setMessageSearchTerm] = useState("");
  const [showResolvedMessages, setShowResolvedMessages] = useState(false);

  const { data: dashboardData, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/dashboard'],
    retry: false,
    refetchInterval: 30000,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<any>({
    queryKey: ['/api/admin/messages'],
    retry: false,
  });

  const updateMessageStatusMutation = useMutation({
    mutationFn: async ({ messageId, status }: { messageId: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/admin/messages/${messageId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/messages'] });
      toast({ title: "Message status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update message status", variant: "destructive" });
    },
  });

  const { data: pendingDrawings } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/drawings/pending'],
    refetchInterval: 60000,
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ drawingId, place }: { drawingId: string; place: string }) => {
      const response = await apiRequest("PUT", `/api/admin/lottery/drawings/${drawingId}/mark-delivered`, { place });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/drawings/pending'] });
      toast({ title: "Prize marked as delivered!" });
    },
    onError: () => {
      toast({ title: "Failed to update delivery status", variant: "destructive" });
    },
  });

  // Handle unauthorized error
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  const handleExport = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`/api/export/admin-all?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export system report",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <AdminDashboardSkeleton role={user?.role} />;
  }

  const { weekStats, monthStats } = dashboardData || {};
  const dashboardErrors = dashboardData?.dashboardErrors || {};
  const hasCoreWidgetWarnings = Boolean(dashboardErrors.weekStats || dashboardErrors.billingReceivables);
  const hasOptionalWidgetWarnings = Boolean(dashboardErrors.monthStats || dashboardErrors.awaitingDriverStripePayments);
  const awaitingDriverStripePayments = Array.isArray(dashboardData?.awaitingDriverStripePayments)
    ? dashboardData.awaitingDriverStripePayments
    : [];
  const awaitingDriverStripeCount = Number(dashboardData?.awaitingDriverStripeCount || 0);
  const billingReceivablesSummary = dashboardData?.billingReceivablesSummary;
  const billingReceivablesError = dashboardErrors.billingReceivables;
  const washoutRevenueError = weekStats?.washoutRevenueError;
  const lotteryMetricsError = weekStats?.lotteryMetricsError;
  const platformRevenuePaidCents = Number(billingReceivablesSummary?.platformFeesPaidCents ?? 0);
  const platformRevenueTotalCents = Number(billingReceivablesSummary?.platformFeesTotalCents ?? 0);
  const driverIncentiveTotalCents = Number(billingReceivablesSummary?.driverTipTotalCents ?? weekStats?.driverTipTotalCents ?? 0);
  const ownerChargeTotalCents = Number(billingReceivablesSummary?.ownerChargeTotalCents ?? (platformRevenueTotalCents + driverIncentiveTotalCents));
  const totalOwnerReceivablesCents = Number(billingReceivablesSummary?.platformFeesOwedCents ?? 0) + driverIncentiveTotalCents;
  const totalOwnerReceivablesValue = billingReceivablesError ? "—" : formatCentsToDollars(totalOwnerReceivablesCents);
  const paidPlatformFeesValue = billingReceivablesError ? "—" : formatCentsToDollars(platformRevenuePaidCents);
  const totalPlatformFeesValue = billingReceivablesError ? "—" : formatCentsToDollars(platformRevenueTotalCents);
  const platformWashoutRevenueValue = washoutRevenueError ? "—" : formatCentsToDollars(weekStats?.platformWashoutRevenueCents ?? 0);
  const driverTipValue = washoutRevenueError ? "—" : formatCentsToDollars(driverIncentiveTotalCents);
  const approvedWashoutsValue = washoutRevenueError ? "—" : (weekStats?.approvedWashouts ?? 0);
  const pendingWashoutsValue = washoutRevenueError ? "—" : (weekStats?.pendingWashouts ?? 0);
  const platformFeeRecordCountValue = washoutRevenueError ? "—" : (weekStats?.platformFeeRecordCount ?? 0);
  const platformWashoutRevenueCentsValue = washoutRevenueError ? "—" : (weekStats?.platformWashoutRevenueCents ?? 0);
  const monthPlatformRevenueValue = formatCentsToDollars(monthStats?.platformWashoutRevenueCents ?? 0);
  const lotteryTicketValue = lotteryMetricsError ? "—" : (weekStats?.lotteryTicketCount ?? 0);
  const lotteryDriverValue = lotteryMetricsError ? "—" : (weekStats?.lotteryDriverCount ?? 0);
  const allMessages = Array.isArray(messages) ? messages : [];
  const unreadMessages = allMessages.filter((message: any) => message.status === "unread").length;
  const activeMessages = allMessages.filter((message: any) => message.status !== "resolved").length;
  const resolvedMessages = allMessages.filter((message: any) => message.status === "resolved").length;
  const messageChartData = [
    { label: "Unread", count: unreadMessages },
    { label: "Active", count: activeMessages },
    { label: "Resolved", count: resolvedMessages },
  ];
  const supportSeverity = unreadMessages > 0 ? "Attention required" : activeMessages > 0 ? "Monitoring" : "Clear";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 gradient-bg text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="brand-frame flex h-12 w-12 items-center justify-center rounded-2xl flex-shrink-0 sm:h-14 sm:w-14">
              <img src={logoImage} alt="CreteXchange" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  Admin console
                </p>
                <span className="dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  Marketplace oversight
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight">System Overview</h1>
              <p className="mt-1 text-sm text-white/80">Platform administration and support signals.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report"
              className="hidden h-10 bg-white text-primary hover:bg-white/90 sm:flex"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report-mobile"
              className="h-10 bg-white text-primary hover:bg-white/90 sm:hidden p-2"
            >
              <Download className="w-4 h-4" />
            </Button>
            <LogoutButton onClick={logout} dataTestId="button-logout" tone="glass" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        <section className="grid gap-4 rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm md:grid-cols-[1.35fr_0.65fr] md:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Executive summary
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                unreadMessages > 0
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
              }`}>
                Support: {supportSeverity}
              </span>
              <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {weekStats?.activeLicenses || 0} active licenses
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Operations center
              </p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Admin Dashboard</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Monitor platform health, revenue, support workload, and prize fulfillment from a single control surface.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="outline"
                className="h-auto min-h-20 flex-col items-start justify-start gap-1 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => window.location.href = '/users'}
                data-testid="button-manage-users-hero"
              >
                <Users className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold">Users</span>
                <span className="text-xs text-muted-foreground">Review approvals and roles</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 flex-col items-start justify-start gap-1 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                onClick={() => window.location.href = '/locations'}
                data-testid="button-manage-locations-hero"
              >
                <Building className="h-5 w-5 text-secondary" />
                <span className="text-sm font-semibold">Locations</span>
                <span className="text-xs text-muted-foreground">Monitor site network</span>
              </Button>
              {user?.role === 'super_admin' && (
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-start gap-1 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                  onClick={() => window.location.href = '/feature-flags'}
                  data-testid="button-feature-flags-hero"
                >
                  <Flag className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-semibold">Feature Flags</span>
                  <span className="text-xs text-muted-foreground">Control rollout settings</span>
                </Button>
              )}
              {user?.role === 'super_admin' && (
                <Button
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start justify-start gap-1 rounded-2xl border-border/70 bg-background/80 p-4 text-left shadow-sm hover:bg-muted/60"
                  onClick={() => window.location.href = '/billing-audit-report'}
                  data-testid="button-billing-audit-report-hero"
                >
                  <Search className="h-5 w-5 text-amber-600" />
                  <span className="text-sm font-semibold">Billing Audit</span>
                  <span className="text-xs text-muted-foreground">Reconcile Stripe and washouts</span>
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current Platform Receivables</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-current-platform-receivables">
                {totalOwnerReceivablesValue}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingReceivablesError || "Approved/completed billable washouts minus billed washouts"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {billingReceivablesSummary ? (
                  <>
                    {billingReceivablesSummary.approvedWashoutCount} approved washouts • {billingReceivablesSummary.unbilledApprovedWashoutCount} unbilled • {billingReceivablesSummary.platformFeesOwedCents} cents
                  </>
                ) : (
                  "Loading current receivables"
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Paid Platform Fees</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-paid-platform-fees">
                {paidPlatformFeesValue}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingReceivablesError || "Approved washouts already collected through billing"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total Platform Fees</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-total-platform-fees">
                {totalPlatformFeesValue}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingReceivablesError || "Collected plus current receivables"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Driver incentives</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-driver-tip-total">
                {driverTipValue}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {washoutRevenueError || "Owner-funded tips in the selected period"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Approved washouts</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{approvedWashoutsValue}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {washoutRevenueError || "eligible for platform fee and reward entry"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pending / unbilled</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{pendingWashoutsValue}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {washoutRevenueError || "awaiting approval or billing"}
              </p>
            </div>
          </div>
        </section>

        {error && !isUnauthorizedError(error as Error) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/40 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0">
                <p className="font-semibold text-red-800 dark:text-red-200">Dashboard data unavailable</p>
                <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/80">
                  The control center could not load all admin data. Refresh the page or try again in a moment.
                </p>
              </div>
            </div>
          </div>
        )}

        {hasCoreWidgetWarnings && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="font-semibold text-amber-900 dark:text-amber-100">Core dashboard metrics loaded with fallback data</p>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                  One or more core admin summary queries returned partial data. The dashboard stayed online and filled missing core values with zeroes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Operations Snapshot */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardMetricCard
              title="Total Owner Charge / Receivables"
              value={totalOwnerReceivablesValue}
              helper={billingReceivablesError || "Platform fee + driver incentive across billable washouts"}
              icon={DollarSign}
              toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-washout-revenue-summary"
            />
            <DashboardMetricCard
              title="Platform Revenue Paid"
              value={paidPlatformFeesValue}
              helper={billingReceivablesError || "Approved washouts already collected"}
              icon={CheckCircle}
              toneClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-paid-platform-fees-summary"
            />
            <DashboardMetricCard
              title="Platform Revenue Total"
              value={totalPlatformFeesValue}
              helper={billingReceivablesError || "Collected plus current receivables"}
              icon={DollarSign}
              toneClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-total-platform-fees-summary"
            />
            <DashboardMetricCard
              title="Driver Incentives"
              value={driverTipValue}
              helper={washoutRevenueError || "Owner-funded tip total"}
              icon={Building}
              toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
              dataTestId="text-driver-tip-total-summary"
            />
            <DashboardMetricCard
              title="Reward Entries"
              value={lotteryTicketValue}
              helper={lotteryMetricsError || `${lotteryDriverValue} drivers entered`}
              icon={Ticket}
              toneClassName="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
              dataTestId="text-lottery-ticket-count-summary"
            />
            <DashboardMetricCard
              title="Approved Washouts"
              value={approvedWashoutsValue}
              helper={washoutRevenueError || "Approved and eligible for billing"}
              icon={CheckCircle}
              toneClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300"
              dataTestId="text-approved-washouts-summary"
            />
            <DashboardMetricCard
              title="Pending / Unbilled"
              value={pendingWashoutsValue}
              helper={washoutRevenueError || "Awaiting approval or billing"}
              icon={Clock}
              toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
              dataTestId="text-pending-washouts-summary"
            />
            <DashboardMetricCard
              title="Support Queue"
              value={activeMessages}
              helper={`${unreadMessages} unread messages`}
              icon={MessageCircle}
              toneClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
              dataTestId="text-active-messages-summary"
            />
            <DashboardMetricCard
              title="Prize Follow-Up"
              value={pendingDrawings?.length || 0}
              helper="Pending drawing deliveries"
              icon={Gift}
              toneClassName="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
              dataTestId="text-pending-drawings-summary"
            />
            <DashboardMetricCard
              title="Driver Stripe Deferred"
              value={awaitingDriverStripeCount}
              helper="Approved washouts waiting on driver setup"
              icon={CreditCard}
              toneClassName="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              dataTestId="text-awaiting-driver-stripe-summary"
            />
          </div>
        </section>

        {awaitingDriverStripeCount > 0 && (
          <DashboardSectionCard
            title="Approved Washouts Waiting on Driver Tip Payout Setup"
            description="These washouts are approved, but owner-funded tips will not be processed until the driver finishes optional tip payout onboarding."
            icon={<CreditCard className="h-4 w-4 text-primary" />}
          >
            <div className="space-y-2">
              {awaitingDriverStripePayments.slice(0, 5).map((payment: any) => (
                <div
                  key={payment.id}
                  className="rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm"
                  data-testid={`deferred-payment-${payment.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {payment.driverUser?.username || payment.driver?.user?.username || payment.driver?.user?.firstName || "Driver"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {payment.location?.name || payment.activity?.location?.name || "Washout"} • {payment.activity?.location?.street || payment.location?.street || ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {formatCurrency(
                          Number(payment.amount || 0) +
                          Number(payment.processingFee || 0) +
                          Number((payment.tipAmountCents || 0) / 100)
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardSectionCard>
        )}

        {/* Revenue and Support Overview */}
        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <DashboardSectionCard
            title="7-Day Platform Revenue"
            description="Platform fee revenue and driver incentive totals for the selected 7-day window."
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            badge={<Badge variant="outline" data-testid="badge-stripe-status" className="rounded-full px-3 py-1 text-xs font-medium">{import.meta.env.VITE_STRIPE_PUBLIC_KEY ? "Connected" : "Development Mode"}</Badge>}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">7-day platform revenue</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground" data-testid="text-weekly-platform-revenue">
                  {platformWashoutRevenueValue}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Completed and approved washouts only</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
                  onClick={() => window.location.href = '/subscriptions?filter=active'}
                  data-testid="button-active-licenses"
                  title="Click to view active subscribers"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active licenses</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{weekStats?.activeLicenses || 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">View active subscribers</p>
                </button>
                <button
                  className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
                  onClick={() => window.location.href = '/subscriptions?filter=renewal'}
                  data-testid="button-license-renewals"
                  title="Click to view upcoming renewals"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Renewals</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{weekStats?.licenseRenewals || 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Due this month</p>
                </button>
                <button
                  className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
                  onClick={() => window.location.href = '/payments'}
                  data-testid="button-driver-tips"
                  title="Click to view driver incentive totals"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Driver incentives</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{driverTipValue}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Owner-funded tips in period</p>
                </button>
              </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                30-day platform fee revenue:
                <span className="ml-2 font-semibold text-foreground">
                  {monthPlatformRevenueValue}
                </span>
                {dashboardErrors.monthStats && (
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                    Loaded with fallback data
                  </span>
                )}
              </div>
              {hasOptionalWidgetWarnings && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                  Optional widgets are using fallback data.
                  {dashboardErrors.monthStats && (
                    <span className="ml-1">Monthly payment volume is temporarily unavailable.</span>
                  )}
                  {dashboardErrors.awaitingDriverStripePayments && (
                    <span className="ml-1">Driver tip payout queue is temporarily unavailable.</span>
                  )}
                </div>
              )}
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard
            title="Support Workload"
            description="Current message status distribution."
            icon={<UsersRound className="h-4 w-4 text-orange-600" />}
            badge={<Badge variant={activeMessages > 0 ? "secondary" : "outline"} className="rounded-full px-3 py-1 text-xs font-medium">{activeMessages} active</Badge>}
          >
            <div>
              <ChartContainer
                config={{
                  count: { label: "Messages", color: "var(--color-count)" },
                }}
                className="h-[220px] w-full"
              >
                <BarChart data={messageChartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </DashboardSectionCard>
        </div>

        {/* Messages Section */}
        <StatCard
          title="Support Messages"
          subtitle={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {unreadMessages} unread
                </span>
                <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {activeMessages} active
                </span>
                <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {resolvedMessages} resolved
                </span>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Search and Filter Controls */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search messages (includes resolved)..."
                  value={messageSearchTerm}
                  onChange={(e) => setMessageSearchTerm(e.target.value)}
                  className="h-10 pl-10 pr-10"
                  data-testid="input-search-messages"
                />
                {messageSearchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                    onClick={() => setMessageSearchTerm("")}
                    data-testid="button-clear-search"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResolvedMessages(!showResolvedMessages)}
                data-testid="button-toggle-resolved"
                className="h-10"
              >
                {showResolvedMessages ? "Hide Resolved" : "Show Resolved"}
              </Button>
            </div>

            {messagesLoading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-3 h-3 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : (() => {
              // Filter messages based on search term and resolved toggle
              let filteredMessages = messages || [];
              
              if (messageSearchTerm) {
                // When searching, include all messages (including resolved)
                filteredMessages = filteredMessages.filter((message: any) =>
                  message.subject?.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  message.message?.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  `${message.user?.firstName} ${message.user?.lastName}`.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  message.userRole?.toLowerCase().includes(messageSearchTerm.toLowerCase())
                );
              } else {
                // When not searching, filter based on resolved toggle
                if (!showResolvedMessages) {
                  filteredMessages = filteredMessages.filter((message: any) => message.status !== 'resolved');
                }
              }

              return !filteredMessages || filteredMessages.length === 0 ? (
                <DashboardEmptyState
                  title={
                    messageSearchTerm
                      ? "No messages found"
                      : showResolvedMessages
                        ? "No support messages yet"
                        : "No active support messages"
                  }
                  description={
                    messageSearchTerm
                      ? "Try adjusting your search terms."
                      : showResolvedMessages
                        ? "Messages from drivers and owners will appear here."
                        : "Resolved messages are hidden. Use search or toggle to view them."
                  }
                  icon={MessageCircle}
                  toneClassName={unreadMessages > 0 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"}
                  badge={<span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{activeMessages} active</span>}
                />
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {filteredMessages.slice(0, 5).map((message: any) => (
                  <div 
                    key={message.id} 
                    className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm transition-colors hover:bg-muted/50"
                    data-testid={`message-card-${message.id}`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge 
                          variant={message.userRole === 'driver' ? 'default' : 'secondary'}
                          data-testid={`badge-user-role-${message.id}`}
                        >
                          {message.userRole === 'driver' ? 'Driver' : 'Owner'}
                        </Badge>
                        <Badge 
                          variant={
                            message.status === 'resolved' ? 'default' : 
                            message.status === 'read' ? 'secondary' : 'destructive'
                          }
                          data-testid={`badge-status-${message.id}`}
                        >
                          {message.status === 'unread' ? 'Unread' : 
                           message.status === 'read' ? 'Read' : 'Resolved'}
                        </Badge>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="mr-1 h-3 w-3" />
                        {new Date(message.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <h4 className="mb-1 text-sm font-semibold" data-testid={`text-subject-${message.id}`}>
                      {message.subject}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2" data-testid={`text-user-name-${message.id}`}>
                      From: {message.user.firstName} {message.user.lastName}
                      {message.userPhone && ` • ${message.userPhone}`}
                    </p>
                    <p className="mb-3 line-clamp-2 text-sm" data-testid={`text-message-${message.id}`}>
                      {message.message}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {message.status === 'unread' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMessageStatusMutation.mutate({ messageId: message.id, status: 'read' })}
                          data-testid={`button-mark-read-${message.id}`}
                          className="h-9"
                        >
                          Mark as Read
                        </Button>
                      )}
                      {message.status !== 'resolved' && (
                        <Button
                          size="sm"
                          onClick={() => updateMessageStatusMutation.mutate({ messageId: message.id, status: 'resolved' })}
                          data-testid={`button-resolve-${message.id}`}
                          className="h-9"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                  ))}
                  {filteredMessages.length > 5 && (
                    <div className="pt-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        Showing 5 of {filteredMessages.length} messages
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </StatCard>

        {/* Platform Health */}
        <DashboardSectionCard
          title="Platform Health"
          description="Core system indicators and service availability."
          icon={<ShieldAlert className="h-4 w-4 text-emerald-600" />}
          badge={<Badge variant="default" data-testid="badge-system-status" className="rounded-full px-3 py-1 text-xs font-medium">Operational</Badge>}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium">Payment Processing</span>
                  </div>
                  <Badge variant="default" data-testid="badge-payment-status">Active</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Stripe and payout flows remain live.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium">Object Storage</span>
                  </div>
                  <Badge variant="secondary" data-testid="badge-storage-status">Connected</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Media uploads and documents are available.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium">GPS Services</span>
                  </div>
                  <Badge variant="default" data-testid="badge-gps-status">Available</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Field tracking and geolocation calls are healthy.</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${unreadMessages > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="text-sm font-medium">Support Risk</span>
                  </div>
                  <Badge variant={unreadMessages > 0 ? "destructive" : "default"} data-testid="badge-support-risk">
                    {unreadMessages > 0 ? "Attention" : "Clear"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {unreadMessages > 0 ? `${unreadMessages} unread messages require review.` : 'No outstanding support risks.'}
                </p>
              </div>
            </div>
          </div>
        </DashboardSectionCard>

        {/* Pending Prize Deliveries */}
        {pendingDrawings && pendingDrawings.length > 0 && (
          <DashboardSectionCard
            title="Pending Prize Deliveries"
            description="Follow up on winners who have not yet been marked delivered."
            icon={<Gift className="h-4 w-4 text-amber-600" />}
            badge={<Badge className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">Reminder</Badge>}
          >
            <div className="space-y-4">
              {pendingDrawings.map((drawing: any) => {
                const monthName = new Date(drawing.lotteryYear, drawing.lotteryMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                const winners = [
                  { place: '🥇 1st', key: 'first', name: drawing.firstPlaceDriverName, ticket: drawing.firstPlaceTicketNumber, pref: drawing.firstPlacePayoutPreference, prize: drawing.firstPrize, delivered: drawing.firstPlaceDelivered },
                  { place: '🥈 2nd', key: 'second', name: drawing.secondPlaceDriverName, ticket: drawing.secondPlaceTicketNumber, pref: drawing.secondPlacePayoutPreference, prize: drawing.secondPrize, delivered: drawing.secondPlaceDelivered },
                  { place: '🥉 3rd', key: 'third', name: drawing.thirdPlaceDriverName, ticket: drawing.thirdPlaceTicketNumber, pref: drawing.thirdPlacePayoutPreference, prize: drawing.thirdPrize, delivered: drawing.thirdPlaceDelivered },
                ].filter(w => w.name && !w.delivered);

                return (
                  <div key={drawing.id} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{monthName} prize drawing</p>
                      <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {winners.length} pending
                      </span>
                    </div>
                    <div className="space-y-2">
                      {winners.map((winner) => (
                        <div key={winner.key} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{winner.place} — {winner.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{winner.ticket}</p>
                            {winner.prize && <p className="text-xs text-muted-foreground">Prize: {winner.prize}</p>}
                            <p className="text-xs text-muted-foreground">
                              {winner.pref === 'gift_card' ? '🎁 Gift Card' : winner.pref === 'other_prize' ? '🎉 Surprise Prize' : '🏦 Bank Transfer'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                            onClick={() => markDeliveredMutation.mutate({ drawingId: drawing.id, place: winner.key })}
                            disabled={markDeliveredMutation.isPending}
                          >
                            <PackageCheck className="mr-1 h-4 w-4" />
                            Delivered
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </DashboardSectionCard>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => window.location.href = '/users'}
            data-testid="button-manage-users"
          >
            <Users className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">Users</div>
              <div className="text-xs text-muted-foreground">Manage & approve</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
            onClick={() => window.location.href = '/locations'}
            data-testid="button-manage-locations"
          >
            <Building className="h-5 w-5 text-secondary" />
            <div>
              <div className="text-sm font-semibold">Locations</div>
              <div className="text-xs text-muted-foreground">Monitor sites</div>
            </div>
          </Button>

          {user?.role === 'super_admin' && (
            <Button 
              variant="outline" 
              className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm hover:bg-muted/50"
              onClick={() => window.location.href = '/feature-flags'}
              data-testid="button-feature-flags"
            >
              <Flag className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold">Feature Flags</div>
                <div className="text-xs text-muted-foreground">Control rollout</div>
              </div>
            </Button>
          )}
        </div>

      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
