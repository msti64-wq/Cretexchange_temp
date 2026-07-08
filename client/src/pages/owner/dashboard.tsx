import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { Users, DollarSign, MapPin, Clock, ImageIcon, Check, X, MessageCircle, Phone, Building2, ChevronRight, Gauge, MapPinned, Loader2, ShieldAlert, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { OwnerHeader } from "@/components/OwnerHeader";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@shared/addressUtils";
import { LogoutButton } from "@/components/LogoutButton";
import { resolveOwnerMembershipState } from "@shared/ownerMembership";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { filterPendingWashoutApprovals, getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";
import { useLanguage } from "@/lib/i18n";
import { formatCentsToDollars } from "@/lib/utils";
import { normalizeDollarInputToCents } from "@shared/money";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";

const AUTO_APPROVAL_HOURS = 72;

function OwnerDashboardSkeleton() {
  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20">
      <div className="border-b border-border bg-card text-foreground shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Skeleton className="h-14 w-full max-w-md bg-muted/40" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <DSCard key={item} className="space-y-3" padding="md">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-32" />
            </DSCard>
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </main>
      <MobileNav role="owner" />
    </div>
  );
}

function getTimeUntilAutoApproval(createdAt: string | Date): { hours: number; minutes: number; isExpired: boolean; isUrgent: boolean } {
  const created = new Date(createdAt);
  const deadline = new Date(created.getTime() + AUTO_APPROVAL_HOURS * 60 * 60 * 1000);
  const now = new Date();
  const remaining = deadline.getTime() - now.getTime();
  
  if (remaining <= 0) {
    return { hours: 0, minutes: 0, isExpired: true, isUrgent: true };
  }
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hours < 24;
  
  return { hours, minutes, isExpired: false, isUrgent };
}

function translateOwnerWashoutStatus(status: string | null | undefined, t: (key: string) => string) {
  switch (status) {
    case "verified":
    case "approved":
    case "completed":
    case "paid":
    case "settled":
      return t("common.approved");
    case "rejected":
    case "declined":
    case "cancelled":
    case "canceled":
      return t("common.rejected");
    case "pending":
    case "submitted":
    case "photo_pending":
    case "pending_owner_approval":
    case "pending_photo_approval":
    case "awaiting_approval":
    case "awaiting_owner_approval":
    case "awaiting_photo_approval":
      return t("common.pending");
    default:
      return getWashoutApprovalDisplayStatus(status);
  }
}

function bucketOwnerWashoutStatus(status: string | null | undefined): "pending" | "approved" | "rejected" {
  switch (status) {
    case "verified":
    case "approved":
    case "completed":
    case "paid":
    case "settled":
      return "approved";
    case "rejected":
    case "declined":
    case "cancelled":
    case "canceled":
      return "rejected";
    default:
      return "pending";
  }
}

function statusTone(status: string | null | undefined) {
  switch (bucketOwnerWashoutStatus(status)) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "warning";
  }
}

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false);
  const [approvalDriverTipDrafts, setApprovalDriverTipDrafts] = useState<Record<string, string>>({});
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days' | 'all'>('today');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ownerRecord = (user as any)?.roleData || {};
  const membershipState = resolveOwnerMembershipState(ownerRecord);
  const approvalDebugMode =
    import.meta.env.DEV ||
    (typeof window !== "undefined" && window.location.search.includes("debugApproval=1"));

  const parseApiError = (error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const payloadMatch = rawMessage.match(/^\d+:\s*([\s\S]*)$/);
    const payload = payloadMatch?.[1] ?? rawMessage;

    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed.message === "string") {
        if (approvalDebugMode && parsed.details) {
          const detailText =
            typeof parsed.details === "string"
              ? parsed.details
              : JSON.stringify(parsed.details, null, 2);
          return `${parsed.message}\n\n${detailText}`;
        }
        return parsed.message;
      }
      if (parsed && typeof parsed.error === "string") {
        if (approvalDebugMode && parsed.details) {
          const detailText =
            typeof parsed.details === "string"
              ? parsed.details
              : JSON.stringify(parsed.details, null, 2);
          return `${parsed.error}\n\n${detailText}`;
        }
        return parsed.error;
      }
    } catch {
      // Fall through to the raw payload.
    }

    return payload;
  };

  // EMERGENCY: Clear phantom activities on component mount
  useEffect(() => {
    let hasCleared = false;
    const clearKey = 'phantom-activities-cleared';
    
    // Only clear once per session to avoid infinite clearing
    if (!sessionStorage.getItem(clearKey)) {
      console.log("🚨 PROACTIVE: Clearing phantom activities from cache on mount");
      
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey[0]?.toString() || '';
          return key.includes('/api/owners/activities') || key.includes('activities');
        }
      });
      
      sessionStorage.setItem(clearKey, 'true');
      hasCleared = true;
      console.log("✅ Phantom activities proactively cleared");
    }
  }, [queryClient]);

  // Separate query for dashboard stats (stable, independent of dateRange)
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery<any>({
    queryKey: ['/api/owners/dashboard'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: allActivitiesData, isLoading: isAllActivitiesLoading, isFetching: isAllActivitiesFetching } = useQuery<any>({
    queryKey: ['/api/owners/activities?dateRange=all'],
    refetchInterval: 30000,
    staleTime: 0,
    gcTime: 0,
    enabled: membershipState.dashboardAccessAllowed,
  });

  // Separate query for activities with date range filtering
  const { data: activitiesData, error: activitiesError } = useQuery<any>({
    queryKey: [`/api/owners/activities?dateRange=${dateRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache at all (renamed from cacheTime in v5)
  });

  // Check for authentication errors
  const isAuthError = activitiesError && activitiesError.toString().includes('401');
  const isDashboardAuthError = activitiesError && activitiesError.toString().includes('Invalid token');


  const approveMutation = useMutation({
    mutationFn: async ({ activityId, driverTipDisplay, driverTipCents }: { activityId: string; driverTipDisplay: string; driverTipCents: number }) => {
      try {
        const response = await apiRequest("PUT", `/api/owners/activities/${activityId}/verify`, {
          driverTip: driverTipDisplay,
          driverTipCents,
        });
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Approval mutation error:", error);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      const activityId = variables.activityId;
      console.log("Approval successful:", data);
      const updatedActivity = {
        ...data,
        id: activityId,
        status: data?.status || "verified",
        verifiedBy: data?.verifiedBy || user?.id || null,
        verifiedAt: data?.verifiedAt || new Date().toISOString(),
      };

      queryClient.setQueryData(['/api/owners/activities?dateRange=all'], (current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((activity) =>
          String(activity.id) === String(activityId) ? { ...activity, ...updatedActivity } : activity,
        );
      });

      queryClient.setQueryData([`/api/owners/activities?dateRange=${dateRange}`], (current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((activity) =>
          String(activity.id) === String(activityId) ? { ...activity, ...updatedActivity } : activity,
        );
      });

      toast({
        title: data?.message || t("owner.dashboard.approveSuccess"),
        description: data?.paymentStatus === 'awaiting_driver_stripe'
          ? t("owner.dashboard.approveDeferred")
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/billing/pending-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
      void queryClient.refetchQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error, activityId) => {
      const message = parseApiError(error);
      console.error("Approval failed:", { activityId, message, error });
      toast({ title: t("owner.dashboard.approveFailed"), description: message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (activityId: string) => {
      try {
        const response = await apiRequest("PUT", `/api/owners/activities/${activityId}/reject`);
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Rejection mutation error:", error);
        throw error;
      }
    },
    onSuccess: (data, activityId) => {
      console.log("Rejection successful:", data);
      toast({ title: t("owner.dashboard.rejectSuccess") });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/billing/pending-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drivers/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error, activityId) => {
      console.error("Rejection failed:", error);
      toast({ title: t("owner.dashboard.rejectFailed"), variant: "destructive" });
    },
  });

  // Emergency cache invalidation for phantom activities
  const clearPhantomActivities = () => {
    console.log("🚨 EMERGENCY: Clearing phantom activities from cache");
    
    // Clear all activity-related cache entries
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0]?.toString() || '';
        return key.includes('/api/owners/activities') || 
               key.includes('/api/owners/dashboard') ||
               key.includes('activities');
      }
    });
    
    // Force remove all cached data completely
    queryClient.removeQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0]?.toString() || '';
        return key.includes('/api/owners/activities') || key.includes('activities');
      }
    });
    
    console.log("✅ Phantom activities cache cleared");
    
    // Force immediate refetch
    queryClient.refetchQueries({
      predicate: (query) => {
        const key = query.queryKey[0]?.toString() || '';
        return key.includes('/api/owners/activities');
      }
    });
  };

  // Combined loading states
  const isMainLoading = isDashboardLoading;
  const isDataReady = dashboardData && activitiesData;
  

  if (isMainLoading) {
    return <OwnerDashboardSkeleton />;
  }

  const { weekStats, monthStats, locations } = (dashboardData as any) || {};
  const billingReceivablesSummary = (dashboardData as any)?.billingReceivablesSummary || null;

  const approvalQueueActivities = Array.isArray(allActivitiesData)
    ? filterPendingWashoutApprovals(allActivitiesData)
    : [];

  const recentActivities = (isAuthError || isDashboardAuthError) 
    ? [] 
    : Array.isArray(activitiesData) ? activitiesData : [];

  const platformFeeExposureCents = Number(weekStats?.platformFeesOwedCents || 0);
  const driverIncentiveExposureCents = Number(weekStats?.driverTipTotalCents || 0);
  const ownerChargeExposureCents = Number(weekStats?.ownerChargeTotalCents || (platformFeeExposureCents + driverIncentiveExposureCents));
  const billingPlatformFeesTotalCents = Number(billingReceivablesSummary?.platformFeesTotalCents ?? platformFeeExposureCents);
  const billingDriverTipsTotalCents = Number(billingReceivablesSummary?.driverTipTotalCents ?? driverIncentiveExposureCents);
  const billingOwnerChargeTotalCents = Number(billingReceivablesSummary?.ownerChargeTotalCents ?? ownerChargeExposureCents);
  const pendingPaymentsCents = ownerChargeExposureCents;
  const pendingCount = Number(weekStats?.unbilledApprovedWashoutCount || approvalQueueActivities.length || 0);
  const approvedPaymentsCents = Number(weekStats?.platformFeesPaidCents || 0);
  const washoutStatusMix = dashboardData?.washoutStatusMix && typeof dashboardData.washoutStatusMix === "object"
    ? dashboardData.washoutStatusMix
    : Array.isArray(allActivitiesData)
      ? allActivitiesData.reduce<Record<string, number>>((acc: Record<string, number>, activity: any) => {
          const status = String(activity?.status || "unknown");
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {})
      : {};
  const ownerWashoutStatusCounts = Object.entries(washoutStatusMix).reduce(
    (acc, [status, count]) => {
      const bucket = bucketOwnerWashoutStatus(status);
      acc[bucket] += Number(count || 0);
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 },
  );
  const approvedCount = Number(ownerWashoutStatusCounts.approved || weekStats?.billedWashoutCount || 0);
  const rejectedCount = Number(ownerWashoutStatusCounts.rejected || 0);

  // Debug data is now available through the DebugPanel component (add ?debug=1 to URL)

  // Calculate total washouts from the canonical billing summary when available
  const totalWashouts = Number(weekStats?.totalWashouts || recentActivities?.filter((activity: any) => activity.status !== 'rejected').length || 0);

  // Calculate unique drivers from the canonical billing summary when available
  const uniqueDrivers = Number(weekStats?.totalDrivers || (recentActivities ? new Set(
    recentActivities
      .filter((activity: any) => activity.status !== 'rejected')
      .map((activity: any) => activity.driver?.user?.id)
      .filter(Boolean)
  ).size : 0));
  const ownerStatusChartData = [
    { label: t("common.pending"), amount: ownerWashoutStatusCounts.pending, count: ownerWashoutStatusCounts.pending },
    { label: t("common.approved"), amount: ownerWashoutStatusCounts.approved, count: ownerWashoutStatusCounts.approved },
    { label: t("common.rejected"), amount: ownerWashoutStatusCounts.rejected, count: ownerWashoutStatusCounts.rejected },
  ];

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20">
      <OwnerHeader />

      <main className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        {/* Profile Completion Notice - Temporarily commented out for TypeScript fix */}
        {/* TODO: Re-enable after TypeScript configuration is resolved */}

        {!membershipState.dashboardAccessAllowed && membershipState.accountStatusMessage && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-semibold text-foreground">
                  {membershipState.membershipStatus === "pending_review" ? t("owner.dashboard.accountPendingReview") : t("owner.dashboard.accountStatus")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {membershipState.accountStatusMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overview */}
        <section className="space-y-3">
          <div className="grid gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm md:grid-cols-[1.35fr_0.65fr] md:p-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("owner.dashboard.portfolioOverview")}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300">
                  {t("owner.dashboard.liveOperations")}
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t("owner.dashboard.title")}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("owner.dashboard.description")}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
                  <Gauge className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{t("owner.dashboard.openReviews", { count: pendingCount })}</p>
                    <p className="text-[11px] text-muted-foreground">{t("owner.dashboard.requiresAttention")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
                  <Building2 className="h-4 w-4 text-secondary" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{t("owner.dashboard.sites", { count: Number(locations) || 0 })}</p>
                    <p className="text-[11px] text-muted-foreground">{t("owner.dashboard.activeWashoutLocations")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
                  <Activity className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{t("owner.dashboard.jobs", { count: recentActivities.length })}</p>
                    <p className="text-[11px] text-muted-foreground">{t("owner.dashboard.selectedRange")}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Platform Fees</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCentsToDollars(billingPlatformFeesTotalCents)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Current platform receivables for approved washouts</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Driver Tips</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-sky-700 dark:text-sky-300">{formatCentsToDollars(billingDriverTipsTotalCents)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Driver incentive total included in owner charge</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total Owner Charge</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{formatCentsToDollars(billingOwnerChargeTotalCents)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Platform fee + driver incentive awaiting review</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DSKpiCard
              label={t("common.washouts")}
              value={recentActivities?.length || 0}
              detail={t("owner.dashboard.pendingApproval", { count: pendingCount })}
              accentTone="info"
              data-testid="text-daily-visits"
            />
            <DSKpiCard
              label="Current Receivables"
              value={formatCentsToDollars(pendingPaymentsCents)}
              detail="Owner charge exposure awaiting review"
              accentTone="warning"
              data-testid="text-pending-payments"
            />
            <DSKpiCard
              label={t("owner.dashboard.ready")}
              value={formatCentsToDollars(approvedPaymentsCents)}
              detail="Platform revenue approved for payout"
              accentTone="success"
              data-testid="text-approved-payments"
            />
            <DSKpiCard
              label={t("owner.dashboard.activeSitesTitle")}
              value={Number(locations) || 0}
              detail={t("owner.dashboard.activeWashoutLocations")}
              accentTone="accent"
              data-testid="text-total-locations"
            />
          </div>
        </section>

        {/* Payment and Activity Analytics */}
        <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <DSCard padding="lg">
            <DSSectionHeader
              title={t("owner.dashboard.washoutStatusMix")}
              description={t("owner.dashboard.washoutStatusMixDescription")}
              actions={<DSStatusChip tone="neutral">{dateRange}</DSStatusChip>}
            />
            <div className="pt-0">
              <ChartContainer
                config={{
                  amount: { label: t("common.washouts"), color: "#F97316" },
                }}
                className="h-[240px] w-full"
              >
                <BarChart data={ownerStatusChartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--foreground))" }}
                  />
                  <YAxis hide />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => new Intl.NumberFormat("en-US").format(Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="amount" fill="#F97316" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </DSCard>

          <DSCard padding="lg">
            <DSSectionHeader title={t("owner.dashboard.thirtyDayTotals")} />
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.totalPayments")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("owner.dashboard.currentMonthActivity")}</p>
                  </div>
                  <span className="text-2xl font-semibold tracking-tight text-sky-500 dark:text-sky-300" data-testid="text-month-total">
                    {formatCurrency(monthStats?.totalPayments || 0)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current Receivables</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-sky-500 dark:text-sky-300" data-testid="text-pending-total">
                    {formatCentsToDollars(pendingPaymentsCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("owner.dashboard.awaitingReview")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.rejected")}</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-red-600 dark:text-red-400" data-testid="text-rejected-count">
                    {rejectedCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("owner.dashboard.requiresFollowUp")}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight" data-testid="text-month-washouts">{totalWashouts}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("common.washouts")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight" data-testid="text-month-drivers">{uniqueDrivers}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("common.drivers")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{approvedCount}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Billable Washouts</p>
                </div>
              </div>
            </div>
          </DSCard>
        </div>

        {/* Recent Activity */}
        <DSCard padding="lg">
          <DSSectionHeader
            title={t("owner.dashboard.recentActivity")}
            actions={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <Select value={dateRange} onValueChange={(value) => setDateRange(value as typeof dateRange)}>
                  <SelectTrigger className="h-9 w-full border-border bg-card text-foreground shadow-sm data-[placeholder]:text-muted-foreground sm:w-36" data-testid="select-date-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today" data-testid="option-today">{t("owner.dashboard.today")}</SelectItem>
                    <SelectItem value="yesterday" data-testid="option-yesterday">{t("owner.dashboard.yesterday")}</SelectItem>
                    <SelectItem value="7days" data-testid="option-7days">{t("owner.dashboard.last7Days")}</SelectItem>
                    <SelectItem value="30days" data-testid="option-30days">{t("owner.dashboard.last30Days")}</SelectItem>
                    <SelectItem value="90days" data-testid="option-90days">{t("owner.dashboard.last90Days")}</SelectItem>
                    <SelectItem value="all" data-testid="option-all">{t("owner.dashboard.allTime")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 justify-start px-3 sm:justify-center"
                  onClick={() => setLocation('/drivers')}
                  data-testid="button-view-all-activity"
                >
                  {t("common.viewAll")}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            }
          />
          <div className="space-y-4">
            {/* 72-hour auto-approval warning */}
            {approvalQueueActivities.some((a: any) => isPendingWashoutApproval(a.status)) && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">
                      {t("owner.dashboard.reviewRequiredTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("owner.dashboard.reviewRequiredDescription")}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {isAllActivitiesLoading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-11 w-11 rounded-xl" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Skeleton className="h-10 w-full rounded-lg" />
                      <Skeleton className="h-10 w-40 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isAllActivitiesFetching ? (
              <div className="space-y-3 opacity-60 transition-opacity">
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("owner.dashboard.updatingActivities")}
                </div>
                {approvalQueueActivities.map((activity: any, index: number) => (
                <div key={activity.id} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4" data-testid={`card-recent-activity-${index}`}>
                    {/* Previous activity content will be dimmed while fetching */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold" data-testid={`text-driver-name-${index}`}>
                            {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                          </div>
                          {activity.driver?.user?.phone && (
                            <div className="text-xs text-muted-foreground" data-testid={`text-driver-phone-${index}`}>
                              {activity.driver.user.phone}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground" data-testid={`text-activity-timestamp-${index}`}>
                            {new Date(activity.checkInTime).toLocaleDateString(language === "es" ? "es-US" : "en-US")} at {new Date(activity.checkInTime).toLocaleTimeString(language === "es" ? "es-US" : "en-US", {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                          {formatCurrency(Number(activity.amount || 0))}
                        </div>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                        <MapPinned className="h-4 w-4 text-secondary" />
                        <span>{activity.location?.name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (isAuthError || isDashboardAuthError) ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-950/20">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <X className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-300">{t("owner.dashboard.authRequired")}</h3>
                <p className="mb-4 text-sm text-muted-foreground">{t("owner.dashboard.sessionExpired")}</p>
                <div className="space-y-2">
                  <Button
                    onClick={clearPhantomActivities}
                    variant="outline"
                    className="mr-2 h-10"
                    data-testid="button-clear-cache"
                  >
                    {t("common.clearCache")}
                  </Button>
                  <LogoutButton
                    onClick={logout}
                    tone="danger"
                    label={t("owner.dashboard.logInAgain")}
                    iconOnlyOnMobile={false}
                    dataTestId="button-reauth"
                  />
                </div>
              </div>
            ) : !approvalQueueActivities.length ? (
              <DashboardEmptyState
                title={t("owner.dashboard.noActivity")}
                description={t("owner.dashboard.noActivityDescription")}
                icon={Clock}
                toneClassName="bg-slate-50 text-foreground dark:bg-slate-950/30 dark:text-foreground"
                action={
                  <Button
                    variant="default"
                    size="sm"
                    className="h-9"
                    onClick={() => setLocation('/locations')}
                    data-testid="button-view-locations-empty"
                  >
                    {t("owner.dashboard.viewLocations")}
                  </Button>
                }
              />
            ) : (
              approvalQueueActivities.map((activity: any, index: number) => (
                (() => {
                  const driverTipDisplay = approvalDriverTipDrafts[activity.id] ?? (resolveLocationDriverTipRateCents(activity.location?.rate ?? 0) / 100).toFixed(2);
                  const driverTipCents = normalizeDollarInputToCents(driverTipDisplay || 0);
                  return (
                <div key={activity.id} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`card-recent-activity-${index}`}>
                  {/* Header Row - Driver and Amount */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" data-testid={`text-driver-name-${index}`}>
                          {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                        </div>
                        {activity.driver?.user?.phone && (
                          <div className="text-xs text-muted-foreground" data-testid={`text-driver-phone-${index}`}>
                            {activity.driver.user.phone}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground" data-testid={`text-activity-timestamp-${index}`}>
                          {new Date(activity.checkInTime).toLocaleDateString(language === "es" ? "es-US" : "en-US")} at {new Date(activity.checkInTime).toLocaleTimeString(language === "es" ? "es-US" : "en-US", {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.amount || 0))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Location Row - Full width for location name */}
                  <div className="w-full">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                      <MapPinned className="h-4 w-4 text-secondary" />
                      <span>{activity.location?.name}</span>
                    </div>
                    {activity.location && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatAddress({
                          street: activity.location.street || '',
                          city: activity.location.city || '',
                          state: activity.location.state || '',
                          zip: activity.location.zip || ''
                        })}
                      </div>
                    )}
                    {(activity.latitude && activity.longitude) && (
                      <div className="mt-1 text-xs text-muted-foreground" data-testid={`text-gps-coordinates-${index}`}>
                        GPS: {Number(activity.latitude).toFixed(6)}, {Number(activity.longitude).toFixed(6)}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions Row - Status and Buttons */}
                  <div className="pt-2 border-t border-border/50 space-y-2 sm:space-y-0">
                    {/* Mobile layout: Stack status above buttons */}
                    <div className="flex flex-col space-y-2 sm:hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DSStatusChip tone={statusTone(activity.status)} data-testid={`badge-activity-status-${index}`}>
                          {translateOwnerWashoutStatus(activity.status, t)}
                        </DSStatusChip>
                        {isPendingWashoutApproval(activity.status) && activity.checkInTime && (() => {
                          const timeLeft = getTimeUntilAutoApproval(activity.checkInTime);
                          return (
                            <span 
                              className={`text-xs font-medium ${timeLeft.isUrgent ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}
                              data-testid={`text-time-remaining-${index}`}
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              {timeLeft.isExpired 
                                ? t("owner.dashboard.autoApprovingSoon")
                                : t("owner.dashboard.timeLeft", { hours: timeLeft.hours, minutes: timeLeft.minutes })}
                            </span>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            Driver Tip
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="h-9 w-24 text-right text-xs"
                            value={driverTipDisplay}
                            onChange={(event) => setApprovalDriverTipDrafts((current) => ({
                              ...current,
                              [activity.id]: event.target.value,
                            }))}
                            data-testid={`input-driver-tip-${index}`}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 px-3 min-w-[70px]"
                          onClick={() => {
                            console.log("Owner Photo Button Clicked:", activity);
                            console.log("🔧 Dashboard: Setting modal state", {
                              activityId: activity.id,
                              currentModalOpen: isPhotoModalOpen,
                              currentSelectedActivity: selectedActivity?.id,
                              activityData: activity
                            });
                            setSelectedActivity(activity);
                            setIsPhotoModalOpen(true);
                            console.log("🔧 Dashboard: Modal state updated");
                          }}
                          data-testid={`button-view-photos-${index}`}
                        >
                          <ImageIcon className="w-4 h-4 mr-1" />
                          {t("common.photos")}
                        </Button>
                        
                        {/* Approval buttons for pending washouts */}
                        {isPendingWashoutApproval(activity.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs px-3 h-9 min-w-[70px]"
                              onClick={() => rejectMutation.mutate(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-reject-${index}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {t("common.reject")}
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-9 min-w-[80px] bg-green-600 hover:bg-green-700"
                              onClick={() => approveMutation.mutate({ activityId: activity.id, driverTipDisplay, driverTipCents })}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-approve-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {t("common.approve")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Desktop layout: Keep status and buttons side by side */}
                    <div className="hidden sm:flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DSStatusChip tone={statusTone(activity.status)} data-testid={`badge-activity-status-${index}`}>
                          {translateOwnerWashoutStatus(activity.status, t)}
                        </DSStatusChip>
                        {isPendingWashoutApproval(activity.status) && activity.checkInTime && (() => {
                          const timeLeft = getTimeUntilAutoApproval(activity.checkInTime);
                          return (
                            <span 
                              className={`text-xs font-medium ${timeLeft.isUrgent ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              {timeLeft.isExpired 
                                ? t("owner.dashboard.autoApprovingSoon")
                                : t("owner.dashboard.timeLeft", { hours: timeLeft.hours, minutes: timeLeft.minutes })}
                            </span>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            Driver Tip
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="h-8 w-24 text-right text-xs"
                            value={driverTipDisplay}
                            onChange={(event) => setApprovalDriverTipDrafts((current) => ({
                              ...current,
                              [activity.id]: event.target.value,
                            }))}
                            data-testid={`input-driver-tip-desktop-${index}`}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 px-3"
                          onClick={() => {
                            console.log("Owner Photo Button Clicked:", activity);
                            console.log("🔧 Dashboard: Setting modal state", {
                              activityId: activity.id,
                              currentModalOpen: isPhotoModalOpen,
                              currentSelectedActivity: selectedActivity?.id,
                              activityData: activity
                            });
                            setSelectedActivity(activity);
                            setIsPhotoModalOpen(true);
                            console.log("🔧 Dashboard: Modal state updated");
                          }}
                          data-testid={`button-view-photos-${index}`}
                        >
                          <ImageIcon className="w-4 h-4 mr-1" />
                          {t("common.photos")}
                        </Button>
                        
                        {/* Approval buttons for pending washouts */}
                        {isPendingWashoutApproval(activity.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs px-3 h-8"
                              onClick={() => rejectMutation.mutate(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-reject-${index}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {t("common.reject")}
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-8 bg-green-600 hover:bg-green-700"
                              onClick={() => approveMutation.mutate({ activityId: activity.id, driverTipDisplay, driverTipCents })}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-approve-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {t("common.approve")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  );
                })()
              ))
            )}
          </div>
        </DSCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border bg-card p-4 text-left shadow-sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-manage-locations"
          >
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">{t("common.locations")}</div>
              <div className="text-xs text-muted-foreground">{t("owner.dashboard.manageActiveSites")}</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border bg-card p-4 text-left shadow-sm"
            onClick={() => setLocation('/payments')}
            data-testid="button-view-payments"
          >
            <DollarSign className="h-5 w-5 text-secondary" />
            <div>
              <div className="text-sm font-semibold">{t("common.payments")}</div>
              <div className="text-xs text-muted-foreground">{t("owner.dashboard.viewPayoutHistory")}</div>
            </div>
          </Button>
        </div>

        {/* Support Section */}
        <DSCard padding="lg" className="border-border bg-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">{t("owner.dashboard.supportDescription")}</p>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              onClick={() => setIsSupportDialogOpen(true)}
              data-testid="button-contact-support"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              {t("owner.dashboard.messageSupport")}
            </Button>
          </div>
        </DSCard>
      </main>

      <PhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => {
          setIsPhotoModalOpen(false);
          setSelectedActivity(null);
        }}
        activity={selectedActivity}
      />

      <SupportMessageDialog
        isOpen={isSupportDialogOpen}
        onClose={() => setIsSupportDialogOpen(false)}
      />

        <DebugPanel
          currentDateRange={dateRange}
          activitiesData={activitiesData as any}
          queryKeys={[
            '/api/owners/dashboard',
            `/api/owners/activities?dateRange=${dateRange}`,
            '/api/auth/user'
          ]}
        />

      <MobileNav role="owner" />
    </div>
  );
}
