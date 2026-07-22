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
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { ShieldAlert, UsersRound } from "lucide-react";
import { buildAdminPlatformGrowth, type PlatformGrowthRange } from "@/lib/adminPlatformGrowth";
import { buildAdminTrustVerification } from "@/lib/adminTrustVerification";
import {
  buildAdminPlatformActivity,
  filterAdminPlatformActivityRange,
  type PlatformActivityRange,
} from "@/lib/adminPlatformActivity";
import { buildAdminMarketplaceHealth } from "@/lib/adminMarketplaceHealth";

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

function PlatformGrowthSkeleton() {
  return (
    <DashboardSectionCard
      title="Platform Growth"
      description="Loading account and location growth signals."
      icon={<UsersRound className="h-4 w-4 text-sky-600" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border-border/70 bg-muted/30">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardSectionCard>
  );
}

function TrustVerificationSkeleton() {
  return (
    <DashboardSectionCard
      title="Trust & Verification"
      description="Loading operational verification signals."
      icon={<ShieldAlert className="h-4 w-4 text-indigo-600" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border-border/70 bg-muted/30">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardSectionCard>
  );
}

function PlatformActivitySkeleton() {
  return (
    <DashboardSectionCard
      title="Platform Activity"
      description="Loading operational network activity."
      icon={<UsersRound className="h-4 w-4 text-cyan-600" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 10 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border-border/70 bg-muted/30">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardSectionCard>
  );
}

function MarketplaceHealthSkeleton() {
  return (
    <DashboardSectionCard
      title="Marketplace Health & Readiness"
      description="Loading facility configuration and activity participation."
      icon={<Building className="h-4 w-4 text-teal-600" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="rounded-2xl border-border/70 bg-muted/30">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardSectionCard>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState("30");
  const [growthRange, setGrowthRange] = useState<PlatformGrowthRange>("last_30_days");
  const [activityRange, setActivityRange] = useState<PlatformActivityRange>("last_30_days");
  const [messageSearchTerm, setMessageSearchTerm] = useState("");
  const [showResolvedMessages, setShowResolvedMessages] = useState(false);

  const { data: dashboardData, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/dashboard'],
    retry: false,
    refetchInterval: 30000,
  });

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery<any>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const {
    data: locationsData,
    isLoading: locationsLoading,
    error: locationsError,
    refetch: refetchLocations,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/locations"],
    retry: false,
  });

  const {
    data: trustReportData,
    isLoading: trustReportLoading,
    error: trustReportError,
    refetch: refetchTrustReport,
  } = useQuery<any>({
    queryKey: ["/api/reports/owner", "trust-verification", "all"],
    queryFn: async () => {
      const response = await apiRequest("/api/reports/owner?dateRange=all", { method: "GET" });
      return response.json();
    },
    retry: false,
  });

  const {
    data: autoApprovalStats,
    isLoading: autoApprovalStatsLoading,
    error: autoApprovalStatsError,
    refetch: refetchAutoApprovalStats,
  } = useQuery<any>({
    queryKey: ["/api/admin/auto-approval/stats"],
    retry: false,
  });

  const {
    data: activityTodayData,
    isLoading: activityTodayLoading,
    error: activityTodayError,
    refetch: refetchActivityToday,
  } = useQuery<any>({
    queryKey: ["/api/reports/owner", "platform-activity", "today"],
    queryFn: async () => {
      const response = await apiRequest("/api/reports/owner?dateRange=today", { method: "GET" });
      return response.json();
    },
    retry: false,
  });

  const {
    data: activityWeekData,
    isLoading: activityWeekLoading,
    error: activityWeekError,
    refetch: refetchActivityWeek,
  } = useQuery<any>({
    queryKey: ["/api/reports/owner", "platform-activity", "weekly"],
    queryFn: async () => {
      const response = await apiRequest("/api/reports/owner?dateRange=weekly", { method: "GET" });
      return response.json();
    },
    retry: false,
  });

  const {
    data: activityMonthData,
    isLoading: activityMonthLoading,
    error: activityMonthError,
    refetch: refetchActivityMonth,
  } = useQuery<any>({
    queryKey: ["/api/reports/owner", "platform-activity", "monthly"],
    queryFn: async () => {
      const response = await apiRequest("/api/reports/owner?dateRange=monthly", { method: "GET" });
      return response.json();
    },
    retry: false,
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
  const totalOwnerReceivablesCents = Number(
    billingReceivablesSummary?.ownerChargeTotalCents ?? (platformRevenueTotalCents + driverIncentiveTotalCents)
  );
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
  const adminGrowthUsers = [
    ...(usersData?.drivers || []).map((entry: any) => ({
      id: entry.users?.id,
      role: "driver",
      createdAt: entry.users?.createdAt,
      isActive: entry.users?.isActive,
    })),
    ...(usersData?.owners || []).map((entry: any) => ({
      id: entry.users?.id,
      role: "owner",
      createdAt: entry.users?.createdAt,
      isActive: entry.users?.isActive,
      ownerApproved: entry.owners?.isApproved,
    })),
    ...(usersData?.admins || []).map((entry: any) => ({
      id: entry.id,
      role: entry.role,
      createdAt: entry.createdAt,
      isActive: entry.isActive,
    })),
  ].filter((entry) => entry.id);
  const usersGrowthAvailable = Array.isArray(usersData?.drivers) && Array.isArray(usersData?.owners) && Array.isArray(usersData?.admins);
  const locationsGrowthAvailable = Array.isArray(locationsData);
  const growth = buildAdminPlatformGrowth(
    adminGrowthUsers,
    locationsGrowthAvailable ? locationsData : [],
    growthRange,
  );
  const registrationCount = growth.registrationBuckets.reduce(
    (total, bucket) => total + bucket.drivers + bucket.owners,
    0,
  );
  const trustActivitiesAvailable = Array.isArray(trustReportData?.rows);
  const trustVerification = buildAdminTrustVerification(
    trustActivitiesAvailable ? trustReportData.rows : undefined,
    autoApprovalStats,
  );
  const trustDistributionCount = trustVerification.distribution.reduce((total, item) => total + item.count, 0);
  const activityTodayRows = Array.isArray(activityTodayData?.rows) ? activityTodayData.rows : undefined;
  const activityWeekRows = Array.isArray(activityWeekData?.rows) ? activityWeekData.rows : undefined;
  const activityMonthRows = Array.isArray(activityMonthData?.rows) ? activityMonthData.rows : undefined;
  const totalOwnerCount = Array.isArray(usersData?.owners) ? usersData.owners.length : undefined;
  const todayActivityRows = filterAdminPlatformActivityRange(activityTodayRows, "today");
  const weekActivityRows = filterAdminPlatformActivityRange(activityWeekRows, "last_7_days");
  const monthActivityRows = filterAdminPlatformActivityRange(activityMonthRows, "last_30_days");
  const todayPlatformActivity = buildAdminPlatformActivity(todayActivityRows, locationsGrowthAvailable ? locationsData : undefined, totalOwnerCount);
  const weekPlatformActivity = buildAdminPlatformActivity(weekActivityRows, locationsGrowthAvailable ? locationsData : undefined, totalOwnerCount);
  const monthPlatformActivity = buildAdminPlatformActivity(monthActivityRows, locationsGrowthAvailable ? locationsData : undefined, totalOwnerCount);
  const selectedActivityRows = activityRange === "today"
    ? todayActivityRows
    : activityRange === "last_7_days"
      ? weekActivityRows
      : monthActivityRows;
  const selectedPlatformActivity = buildAdminPlatformActivity(
    selectedActivityRows,
    locationsGrowthAvailable ? locationsData : undefined,
    totalOwnerCount,
  );
  const selectedActivityAvailable = Boolean(selectedActivityRows);
  const activityErrors = [activityTodayError, activityWeekError, activityMonthError].filter(Boolean);
  const marketplaceHealth = buildAdminMarketplaceHealth(
    locationsGrowthAvailable ? locationsData : undefined,
    selectedActivityRows,
  );
  const selectedActivityError = activityRange === "today"
    ? activityTodayError
    : activityRange === "last_7_days"
      ? activityWeekError
      : activityMonthError;
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
            <BrandHeaderLogo />
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total Owner Charge / Receivables</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-current-platform-receivables">
                {totalOwnerReceivablesValue}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingReceivablesError || "Platform fee + driver incentive across billable washouts"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {billingReceivablesSummary ? (
                  <>
                    {billingReceivablesSummary.approvedWashoutCount} approved washouts • {billingReceivablesSummary.unbilledApprovedWashoutCount} unbilled • {formatCentsToDollars(Number(billingReceivablesSummary.platformFeesOwedCents || 0))} platform fees • {formatCentsToDollars(Number(billingReceivablesSummary.driverTipTotalCents || 0))} driver tips
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

        {usersLoading || locationsLoading ? (
          <PlatformGrowthSkeleton />
        ) : (
          <DashboardSectionCard
            title="Platform Growth"
            description="Account and location growth. Registration counts are not activity, participation, revenue, or settlement metrics."
            icon={<UsersRound className="h-4 w-4 text-sky-600" />}
            badge={<Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">Operational</Badge>}
            action={
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {([
                  ["today", "Today"],
                  ["last_7_days", "7 days"],
                  ["last_30_days", "30 days"],
                  ["current_month", "This month"],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={growthRange === value ? "default" : "outline"}
                    onClick={() => setGrowthRange(value)}
                    data-testid={`button-platform-growth-range-${value}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
            dataTestId="section-platform-growth"
          >
            {(usersError || locationsError) && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {usersError && locationsError
                    ? "Account and location growth data could not be loaded."
                    : usersError
                      ? "Account growth data could not be loaded. Location counts remain available."
                      : "Location growth data could not be loaded. Account counts remain available."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (usersError) void refetchUsers();
                    if (locationsError) void refetchLocations();
                  }}
                  data-testid="button-retry-platform-growth"
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DashboardMetricCard
                title="Total Users"
                value={usersGrowthAvailable ? growth.totalUsers : "—"}
                helper="Registered accounts across platform roles"
                icon={Users}
                toneClassName="bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300"
                dataTestId="metric-platform-growth-total-users"
              />
              <DashboardMetricCard
                title="Total Drivers"
                value={usersGrowthAvailable ? growth.totalDrivers : "—"}
                helper="Registered driver accounts"
                icon={UsersRound}
                toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                dataTestId="metric-platform-growth-total-drivers"
              />
              <DashboardMetricCard
                title="Total Owners"
                value={usersGrowthAvailable ? growth.totalOwners : "—"}
                helper="Registered owner accounts"
                icon={Building}
                toneClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"
                dataTestId="metric-platform-growth-total-owners"
              />
              <DashboardMetricCard
                title="Active Driver Accounts"
                value={usersGrowthAvailable ? growth.activeDrivers : "—"}
                helper="Account status only; not an activity metric"
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-platform-growth-active-driver-accounts"
              />
              <DashboardMetricCard
                title="Active Owner Accounts"
                value={usersGrowthAvailable ? growth.activeOwners : "—"}
                helper="Account status only; not an activity metric"
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-platform-growth-active-owner-accounts"
              />
              <DashboardMetricCard
                title="Inactive Accounts"
                value={usersGrowthAvailable ? growth.inactiveDriverAccounts + growth.inactiveOwnerAccounts : "—"}
                helper="Inactive driver and owner account status"
                icon={Clock}
                toneClassName="bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                dataTestId="metric-platform-growth-inactive-accounts"
              />
              <DashboardMetricCard
                title="Total Locations"
                value={locationsGrowthAvailable ? growth.totalLocations : "—"}
                helper="Configured platform locations"
                icon={Building}
                toneClassName="bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-300"
                dataTestId="metric-platform-growth-total-locations"
              />
              <DashboardMetricCard
                title="Active Locations"
                value={locationsGrowthAvailable ? growth.activeLocations : "—"}
                helper="Locations with active configuration enabled"
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-platform-growth-active-locations"
              />
              <DashboardMetricCard
                title="Visible Locations"
                value={locationsGrowthAvailable ? growth.visibleLocations : "—"}
                helper="Locations currently visible to users"
                icon={Building}
                toneClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300"
                dataTestId="metric-platform-growth-visible-locations"
              />
              <DashboardMetricCard
                title="Pending Owner Approvals"
                value={usersGrowthAvailable ? growth.pendingOwnerApprovals : "—"}
                helper="Owner accounts where isApproved is not true"
                icon={Clock}
                toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                dataTestId="metric-platform-growth-pending-owner-approvals"
              />
              <DashboardMetricCard
                title="New Drivers"
                value={usersGrowthAvailable ? growth.newDrivers : "—"}
                helper="Driver accounts registered in the selected range"
                icon={UsersRound}
                trend={growthRange === "today" ? "Today" : "Registration cohort"}
                toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                dataTestId="metric-platform-growth-new-drivers"
              />
              <DashboardMetricCard
                title="New Owners"
                value={usersGrowthAvailable ? growth.newOwners : "—"}
                helper="Owner accounts registered in the selected range"
                icon={Users}
                trend={growthRange === "today" ? "Today" : "Registration cohort"}
                toneClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"
                dataTestId="metric-platform-growth-new-owners"
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              {usersGrowthAvailable && registrationCount > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Account registrations</p>
                    <p className="mt-1 text-xs text-muted-foreground">New driver and owner accounts by registration date in the selected range.</p>
                  </div>
                  <ChartContainer
                    config={{
                      drivers: { label: "Drivers", color: "hsl(var(--chart-1))" },
                      owners: { label: "Owners", color: "hsl(var(--chart-2))" },
                    }}
                    className="h-[240px] w-full"
                  >
                    <BarChart data={growth.registrationBuckets} margin={{ left: -18, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis hide allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="drivers" fill="var(--color-drivers)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="owners" fill="var(--color-owners)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : usersGrowthAvailable ? (
                <DashboardEmptyState
                  title="No account registrations in this range"
                  description="Try a longer range to view new driver and owner account registrations."
                  icon={UsersRound}
                  toneClassName="bg-sky-950/30 text-sky-300"
                  dataTestId="empty-platform-growth-registrations"
                />
              ) : (
                <DashboardEmptyState
                  title="Account registrations unavailable"
                  description="Retry account growth data to view registration cohorts."
                  icon={ShieldAlert}
                  toneClassName="bg-amber-950/30 text-amber-300"
                />
              )}
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <p className="text-sm font-semibold text-foreground">Growth drill-downs</p>
                <p className="mt-1 text-sm text-muted-foreground">Open existing management views for account and location detail.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/users"; }} data-testid="button-platform-growth-users">
                    Manage users and approvals
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/locations"; }} data-testid="button-platform-growth-locations">
                    Review locations
                  </Button>
                </div>
              </div>
            </div>
          </DashboardSectionCard>
        )}

        {trustReportLoading && autoApprovalStatsLoading ? (
          <TrustVerificationSkeleton />
        ) : (
          <DashboardSectionCard
            title="Trust & Verification"
            description="Operational verification pipeline status. Verified is an accepted activity status, not a payment or settlement result."
            icon={<ShieldAlert className="h-4 w-4 text-indigo-600" />}
            badge={<Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">Operational only</Badge>}
            dataTestId="section-trust-verification"
          >
            {(trustReportError || autoApprovalStatsError) && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {trustReportError && autoApprovalStatsError
                    ? "Verification activity and review-aging data could not be loaded."
                    : trustReportError
                      ? "Verification activity data could not be loaded. Review-aging data remains available."
                      : "Review-aging data could not be loaded. Verification activity data remains available."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (trustReportError) void refetchTrustReport();
                    if (autoApprovalStatsError) void refetchAutoApprovalStats();
                  }}
                  data-testid="button-retry-trust-verification"
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardMetricCard
                title="Verified Activities"
                value={trustVerification.verified ?? "—"}
                helper="Persisted verified activity status"
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-trust-verified"
              />
              <DashboardMetricCard
                title="Pending Review"
                value={trustVerification.pending ?? "—"}
                helper="Persisted activities awaiting review"
                icon={Clock}
                toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                dataTestId="metric-trust-pending"
              />
              <DashboardMetricCard
                title="Rejected Activities"
                value={trustVerification.rejected ?? "—"}
                helper="Persisted explicitly rejected status"
                icon={ShieldAlert}
                toneClassName="bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300"
                dataTestId="metric-trust-rejected"
              />
              <DashboardMetricCard
                title="Review Backlog"
                value={trustVerification.reviewBacklog ?? "—"}
                helper="Current pending operational workload"
                icon={Clock}
                toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                dataTestId="metric-trust-review-backlog"
              />
              <DashboardMetricCard
                title="Over 24 Hours"
                value={trustVerification.olderThan24h ?? "—"}
                helper="Pending activities past 24-hour threshold"
                icon={Clock}
                toneClassName="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
                dataTestId="metric-trust-over-24-hours"
              />
              <DashboardMetricCard
                title="Over 48 Hours"
                value={trustVerification.olderThan48h ?? "—"}
                helper="Pending activities past 48-hour threshold"
                icon={Clock}
                toneClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
                dataTestId="metric-trust-over-48-hours"
              />
              <DashboardMetricCard
                title="Over 72 Hours"
                value={trustVerification.olderThan72h ?? "—"}
                helper="Pending activities past 72-hour threshold"
                icon={ShieldAlert}
                toneClassName="bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300"
                dataTestId="metric-trust-over-72-hours"
              />
            </div>

            <div className="mt-5">
              {trustActivitiesAvailable && trustDistributionCount > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Current verification distribution</p>
                    <p className="mt-1 text-xs text-muted-foreground">Current persisted activity-status mix; this is not a historical trend.</p>
                  </div>
                  <ChartContainer
                    config={{
                      count: { label: "Activities", color: "var(--color-count)" },
                    }}
                    className="h-[220px] w-full"
                  >
                    <BarChart data={trustVerification.distribution} margin={{ left: -18, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis hide allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : trustActivitiesAvailable ? (
                <DashboardEmptyState
                  title="No verification activity to summarize"
                  description="Verified, pending, and rejected activities will appear here when report data is available."
                  icon={ShieldAlert}
                  toneClassName="bg-indigo-950/30 text-indigo-300"
                  dataTestId="empty-trust-verification"
                />
              ) : (
                <DashboardEmptyState
                  title="Verification activity unavailable"
                  description="Retry verification activity data to view the current operational distribution."
                  icon={ShieldAlert}
                  toneClassName="bg-amber-950/30 text-amber-300"
                />
              )}
            </div>
          </DashboardSectionCard>
        )}

        {activityTodayLoading && activityWeekLoading && activityMonthLoading ? (
          <PlatformActivitySkeleton />
        ) : (
          <DashboardSectionCard
            title="Platform Activity"
            description="Operational throughput and participation across the network. Activity is not payment, revenue, or settlement status."
            icon={<UsersRound className="h-4 w-4 text-cyan-600" />}
            badge={<Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">Operational only</Badge>}
            action={
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {([
                  ["today", "Today"],
                  ["last_7_days", "Last 7 Days"],
                  ["last_30_days", "Last 30 Days"],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={activityRange === value ? "default" : "outline"}
                    onClick={() => setActivityRange(value)}
                    data-testid={`button-platform-activity-range-${value}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
            dataTestId="section-platform-activity"
          >
            {activityErrors.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <p>Some activity data is unavailable. Confirmed operational metrics remain visible.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (activityTodayError) void refetchActivityToday();
                    if (activityWeekError) void refetchActivityWeek();
                    if (activityMonthError) void refetchActivityMonth();
                  }}
                  data-testid="button-retry-platform-activity"
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardMetricCard
                title="Verified Activities"
                value={selectedPlatformActivity.verifiedActivities ?? "—"}
                helper="Verified activity status in selected period"
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-platform-activity-verified"
              />
              <DashboardMetricCard
                title="Activities Today"
                value={todayPlatformActivity.totalActivities ?? "—"}
                helper="All persisted activity statuses today"
                icon={Clock}
                toneClassName="bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300"
                dataTestId="metric-platform-activity-today"
              />
              <DashboardMetricCard
                title="Activities Last 7 Days"
                value={weekPlatformActivity.totalActivities ?? "—"}
                helper="All persisted activity statuses in the last 7 days"
                icon={Clock}
                toneClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300"
                dataTestId="metric-platform-activity-week"
              />
              <DashboardMetricCard
                title="Activities Last 30 Days"
                value={monthPlatformActivity.totalActivities ?? "—"}
                helper="All persisted activity statuses in the last 30 days"
                icon={Clock}
                toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                dataTestId="metric-platform-activity-month"
              />
              <DashboardMetricCard
                title="Active Drivers"
                value={selectedPlatformActivity.activeDrivers ?? "—"}
                helper="Unique drivers with activity in selected period"
                icon={UsersRound}
                toneClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300"
                dataTestId="metric-platform-activity-active-drivers"
              />
              <DashboardMetricCard
                title="Active Owners"
                value={selectedPlatformActivity.activeOwners ?? "—"}
                helper="Owners with activity in selected period"
                icon={Building}
                toneClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"
                dataTestId="metric-platform-activity-active-owners"
              />
              <DashboardMetricCard
                title="Owners Without Activity"
                value={selectedPlatformActivity.ownersWithoutActivity ?? "—"}
                helper="Registered owners without selected-period activity"
                icon={Clock}
                toneClassName="bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                dataTestId="metric-platform-activity-inactive-owners"
              />
              <DashboardMetricCard
                title="Participating Locations"
                value={selectedPlatformActivity.participatingLocations ?? "—"}
                helper={selectedPlatformActivity.participatingLocationPercentage === null
                  ? "Locations receiving verified activity"
                  : `${selectedPlatformActivity.participatingLocationPercentage}% of configured locations`}
                icon={Building}
                toneClassName="bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-300"
                dataTestId="metric-platform-activity-locations"
              />
              <DashboardMetricCard
                title="Reward Entries"
                value={selectedPlatformActivity.rewardEntries ?? "—"}
                helper="Existing reward-entry indicator in selected period"
                icon={Ticket}
                toneClassName="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
                dataTestId="metric-platform-activity-reward-entries"
              />
              <DashboardMetricCard
                title="Reward Participants"
                value={selectedPlatformActivity.rewardDrivers ?? "—"}
                helper="Drivers with a reward entry in selected period"
                icon={Gift}
                toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                dataTestId="metric-platform-activity-reward-drivers"
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              {selectedActivityAvailable && selectedPlatformActivity.verifiedTrend.length > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Daily verified activity</p>
                    <p className="mt-1 text-xs text-muted-foreground">Verified activity in the selected period; no missing-day values are fabricated.</p>
                  </div>
                  <ChartContainer
                    config={{ count: { label: "Verified activities", color: "var(--color-count)" } }}
                    className="h-[240px] w-full"
                  >
                    <BarChart data={selectedPlatformActivity.verifiedTrend} margin={{ left: -18, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis hide allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : selectedActivityAvailable && selectedPlatformActivity.totalActivities === 0 ? (
                <DashboardEmptyState
                  title="No platform activity yet"
                  description="Operational activity and participation summaries will appear when the network records activity."
                  icon={UsersRound}
                  toneClassName="bg-cyan-950/30 text-cyan-300"
                  dataTestId="empty-platform-activity"
                />
              ) : (
                <DashboardEmptyState
                  title={selectedActivityAvailable ? "No verified activity trend" : "Activity trend unavailable"}
                  description={selectedActivityAvailable
                    ? "Verified activity will appear here when reported activity reaches the verified status."
                    : "Retry report data to view recent verified activity."}
                  icon={ShieldAlert}
                  toneClassName="bg-amber-950/30 text-amber-300"
                />
              )}

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <p className="text-sm font-semibold text-foreground">Geographic activity</p>
                <p className="mt-1 text-sm text-muted-foreground">Verified activity by configured city and state in the selected period.</p>
                {selectedActivityAvailable && (selectedPlatformActivity.activityByCity.length > 0 || selectedPlatformActivity.activityByState.length > 0) ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top cities</p>
                      <div className="mt-2 space-y-2">
                        {selectedPlatformActivity.activityByCity.slice(0, 3).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{entry.label}</span><span className="font-semibold text-muted-foreground">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top states</p>
                      <div className="mt-2 space-y-2">
                        {selectedPlatformActivity.activityByState.slice(0, 3).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{entry.label}</span><span className="font-semibold text-muted-foreground">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">No verified location geography is available for this period.</p>
                )}
                <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/reports"; }} data-testid="button-platform-activity-reports">View reports</Button>
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/locations"; }} data-testid="button-platform-activity-locations">Review locations</Button>
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/users"; }} data-testid="button-platform-activity-users">Review users</Button>
                </div>
              </div>
            </div>
          </DashboardSectionCard>
        )}

        {locationsLoading || (activityRange === "today" ? activityTodayLoading : activityRange === "last_7_days" ? activityWeekLoading : activityMonthLoading) ? (
          <MarketplaceHealthSkeleton />
        ) : (
          <DashboardSectionCard
            title="Marketplace Health & Readiness"
            description="Facility configuration, geographic coverage, and verified operational participation. Readiness means active and visible configuration only."
            icon={<Building className="h-4 w-4 text-teal-600" />}
            badge={<Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">Operational only</Badge>}
            dataTestId="section-marketplace-health"
          >
            {(locationsError || selectedActivityError) && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {locationsError && selectedActivityError
                    ? "Facility configuration and activity participation data are unavailable."
                    : locationsError
                      ? "Facility configuration data is unavailable. Verified participation remains available where reported."
                      : "Verified participation data is unavailable. Facility configuration remains available."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (locationsError) void refetchLocations();
                    if (activityRange === "today" && activityTodayError) void refetchActivityToday();
                    if (activityRange === "last_7_days" && activityWeekError) void refetchActivityWeek();
                    if (activityRange === "last_30_days" && activityMonthError) void refetchActivityMonth();
                  }}
                  data-testid="button-retry-marketplace-health"
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="mb-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Activity-derived participation and utilization use the Platform Activity range: <span className="font-medium text-foreground">{activityRange === "today" ? "Today" : activityRange === "last_7_days" ? "Last 7 Days" : "Last 30 Days"}</span>.
            </div>

            {marketplaceHealth.totalLocations !== null && marketplaceHealth.totalLocations > 0 && marketplaceHealth.driverAccessibleLocations === 0 && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                No driver-accessible facilities are configured. Utilization is unavailable until at least one facility is both active and visible.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DashboardMetricCard
                title="Driver-Accessible Facilities"
                value={marketplaceHealth.driverAccessibleLocations ?? "—"}
                helper={marketplaceHealth.marketplaceReadinessPercentage === null
                  ? "Active and visible configuration"
                  : `${marketplaceHealth.marketplaceReadinessPercentage}% of configured facilities`}
                icon={CheckCircle}
                toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
                dataTestId="metric-marketplace-ready-facilities"
              />
              <DashboardMetricCard
                title="Active Facilities"
                value={marketplaceHealth.activeLocations ?? "—"}
                helper="Active configuration state only"
                icon={Building}
                toneClassName="bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-300"
                dataTestId="metric-marketplace-active-facilities"
              />
              <DashboardMetricCard
                title="Visible Facilities"
                value={marketplaceHealth.visibleLocations ?? "—"}
                helper="Visible configuration state only"
                icon={Building}
                toneClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300"
                dataTestId="metric-marketplace-visible-facilities"
              />
              <DashboardMetricCard
                title="Configuration Follow-up"
                value={marketplaceHealth.locationsNeedingConfiguration ?? "—"}
                helper="Facilities not both active and visible"
                icon={Clock}
                toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                dataTestId="metric-marketplace-configuration-follow-up"
              />
              <DashboardMetricCard
                title="Verified Facility Participation"
                value={marketplaceHealth.verifiedParticipatingLocations ?? "—"}
                helper="Facilities represented by verified activity in selected range"
                icon={PackageCheck}
                toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                dataTestId="metric-marketplace-verified-participation"
              />
              <DashboardMetricCard
                title="Utilized Ready Facilities"
                value={marketplaceHealth.utilizedReadyLocations ?? "—"}
                helper={marketplaceHealth.readyLocationUtilizationPercentage === null
                  ? marketplaceHealth.driverAccessibleLocations === 0
                    ? "Unavailable: no driver-accessible facilities"
                    : "Ready facilities with verified activity"
                  : `${marketplaceHealth.readyLocationUtilizationPercentage}% of ready facilities`}
                icon={PackageCheck}
                toneClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300"
                dataTestId="metric-marketplace-utilized-ready-facilities"
              />
              <DashboardMetricCard
                title="Ready Without Verified Activity"
                value={marketplaceHealth.readyLocationsWithoutVerifiedActivity ?? "—"}
                helper="Activity-derived follow-up in selected range"
                icon={Clock}
                toneClassName="bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                dataTestId="metric-marketplace-ready-without-activity"
              />
              <DashboardMetricCard
                title="Configured Facilities"
                value={marketplaceHealth.totalLocations ?? "—"}
                helper="Existing facility configuration records"
                icon={Building}
                toneClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"
                dataTestId="metric-marketplace-configured-facilities"
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              {marketplaceHealth.totalLocations === 0 ? (
                <DashboardEmptyState
                  title="No facilities configured"
                  description="Marketplace readiness and coverage will appear when facilities are configured."
                  icon={Building}
                  toneClassName="bg-teal-950/30 text-teal-300"
                  dataTestId="empty-marketplace-health"
                />
              ) : marketplaceHealth.cityRegions.length > 0 || marketplaceHealth.stateRegions.length > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-foreground">Ready facility coverage</p>
                  <p className="mt-1 text-xs text-muted-foreground">{marketplaceHealth.cityCoverage ?? 0} unique cities and {marketplaceHealth.stateCoverage ?? 0} unique states across active and visible facilities.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cities</p>
                      <div className="mt-2 space-y-2">
                        {marketplaceHealth.cityRegions.slice(0, 5).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{entry.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">States</p>
                      <div className="mt-2 space-y-2">
                        {marketplaceHealth.stateRegions.slice(0, 5).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{entry.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <DashboardEmptyState
                  title={locationsGrowthAvailable ? "Ready facility geography unavailable" : "Facility coverage unavailable"}
                  description={locationsGrowthAvailable
                    ? "Active and visible facility records do not currently include usable city or state coverage."
                    : "Retry facility configuration data to view marketplace coverage."}
                  icon={ShieldAlert}
                  toneClassName="bg-amber-950/30 text-amber-300"
                />
              )}
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <p className="text-sm font-semibold text-foreground">Marketplace readiness guidance</p>
                <p className="mt-1 text-sm text-muted-foreground">Use existing operations views to review facility configuration and verified activity. These are operational signals, not capacity, compliance, payment, or settlement determinations.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/locations"; }} data-testid="button-marketplace-health-locations">Review facilities</Button>
                  <Button type="button" variant="outline" onClick={() => { window.location.href = "/reports"; }} data-testid="button-marketplace-health-reports">Review verified activity</Button>
                </div>
              </div>
            </div>
          </DashboardSectionCard>
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
