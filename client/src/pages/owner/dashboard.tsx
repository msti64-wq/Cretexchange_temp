import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DashboardMetricCard } from "@/components/DashboardMetricCard";
import { DashboardSectionCard } from "@/components/DashboardSectionCard";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { Users, DollarSign, MapPin, Clock, ImageIcon, Check, X, MessageCircle, Phone, ClipboardCheck, WalletCards, Building2, ChevronRight, Gauge, Package, MapPinned, Clock3, Loader2, ShieldAlert, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { OwnerHeader } from "@/components/OwnerHeader";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@shared/addressUtils";
import { LogoutButton } from "@/components/LogoutButton";
import { resolveOwnerMembershipState } from "@shared/ownerMembership";
import { filterPendingWashoutApprovals, getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";

const AUTO_APPROVAL_HOURS = 72;

function OwnerDashboardSkeleton() {
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
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
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

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days' | 'all'>('today');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ownerRecord = (user as any)?.roleData || {};
  const membershipState = resolveOwnerMembershipState(ownerRecord);

  const parseApiError = (error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const payloadMatch = rawMessage.match(/^\d+:\s*([\s\S]*)$/);
    const payload = payloadMatch?.[1] ?? rawMessage;

    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed.message === "string") {
        return parsed.message;
      }
      if (parsed && typeof parsed.error === "string") {
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
    mutationFn: async (activityId: string) => {
      try {
        const response = await apiRequest("PUT", `/api/owners/activities/${activityId}/verify`);
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Approval mutation error:", error);
        throw error;
      }
    },
    onSuccess: (data, activityId) => {
      console.log("Approval successful:", data);
      toast({
        title: data?.message || "Washout approved for payment",
        description: data?.paymentStatus === 'awaiting_driver_stripe'
          ? "Payment will be processed once the driver completes payment setup."
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error, activityId) => {
      const message = parseApiError(error);
      console.error("Approval failed:", { activityId, message, error });
      toast({ title: "Failed to approve washout", description: message, variant: "destructive" });
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
      toast({ title: "Washout rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error, activityId) => {
      console.error("Rejection failed:", error);
      toast({ title: "Failed to reject washout", variant: "destructive" });
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

  const approvalQueueActivities = Array.isArray(allActivitiesData)
    ? filterPendingWashoutApprovals(allActivitiesData)
    : [];

  const recentActivities = (isAuthError || isDashboardAuthError) 
    ? [] 
    : Array.isArray(activitiesData) ? activitiesData : [];

  const pendingPayments = approvalQueueActivities.reduce((total: number, activity: any) => {
    return total + Number(activity.amount || 0);
  }, 0);
  const pendingCount = approvalQueueActivities.length;
  const approvedPayments = recentActivities?.reduce((total: number, activity: any) => {
    if (activity.status === 'verified') {
      return total + Number(activity.amount || 0);
    }
    return total;
  }, 0) || 0;
  const rejectedPayments = recentActivities?.reduce((total: number, activity: any) => {
    if (activity.status === 'rejected') {
      return total + Number(activity.amount || 0);
    }
    return total;
  }, 0) || 0;
  const approvedCount = recentActivities?.filter((activity: any) => activity.status === 'verified').length || 0;
  const rejectedCount = recentActivities?.filter((activity: any) => activity.status === 'rejected').length || 0;

  // Debug data is now available through the DebugPanel component (add ?debug=1 to URL)

  // Calculate total washouts from recent activities (exclude rejected washouts)
  const totalWashouts = recentActivities?.filter((activity: any) => 
    activity.status !== 'rejected'
  ).length || 0;

  // Calculate unique drivers from recent activities (exclude rejected washouts)
  const uniqueDrivers = recentActivities ? new Set(
    recentActivities
      .filter((activity: any) => activity.status !== 'rejected')
      .map((activity: any) => activity.driver?.user?.id)
      .filter(Boolean)
  ).size : 0;
  const ownerStatusChartData = [
    { label: "Pending", amount: pendingPayments, count: pendingCount },
    { label: "Approved", amount: approvedPayments, count: approvedCount },
    { label: "Rejected", amount: rejectedPayments, count: rejectedCount },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <OwnerHeader />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5">
        {/* Profile Completion Notice - Temporarily commented out for TypeScript fix */}
        {/* TODO: Re-enable after TypeScript configuration is resolved */}

        {!membershipState.dashboardAccessAllowed && membershipState.accountStatusMessage && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-semibold text-amber-900 dark:text-amber-100">
                  {membershipState.membershipStatus === "pending_review" ? "Account Pending Review" : "Account Status"}
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {membershipState.accountStatusMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overview */}
        <section className="space-y-3">
          <div className="grid gap-4 rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm md:grid-cols-[1.35fr_0.65fr] md:p-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Portfolio overview
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300">
                  Live operations
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Owner Dashboard</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Monitor washout flow, approve jobs, and track payout exposure across your active sites.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2.5">
                  <Gauge className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{pendingCount} open reviews</p>
                    <p className="text-[11px] text-muted-foreground">requires your attention</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2.5">
                  <Building2 className="h-4 w-4 text-secondary" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{Number(locations) || 0} sites</p>
                    <p className="text-[11px] text-muted-foreground">active washout locations</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2.5">
                  <Activity className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{recentActivities.length} jobs</p>
                    <p className="text-[11px] text-muted-foreground">in selected range</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payment exposure</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(pendingPayments)}</p>
                <p className="mt-1 text-sm text-muted-foreground">awaiting your review</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Approved for payout</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{formatCurrency(approvedPayments)}</p>
                <p className="mt-1 text-sm text-muted-foreground">ready to settle</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recycling network</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-300">{Number(locations) || 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">active sites</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              title="Washouts"
              value={recentActivities?.length || 0}
              helper={`${pendingCount} pending approval`}
              icon={ClipboardCheck}
              toneClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
              dataTestId="text-daily-visits"
            />
            <DashboardMetricCard
              title="Pending"
              value={formatCurrency(pendingPayments)}
              helper="Awaiting your review"
              icon={Clock}
              toneClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
              dataTestId="text-pending-payments"
            />
            <DashboardMetricCard
              title="Ready"
              value={formatCurrency(approvedPayments)}
              helper="Approved for payout"
              icon={WalletCards}
              toneClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-approved-payments"
            />
            <DashboardMetricCard
              title="Active Sites"
              value={Number(locations) || 0}
              helper="Washout locations"
              icon={MapPin}
              toneClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
              dataTestId="text-total-locations"
            />
          </div>
        </section>

        {/* Payment and Activity Analytics */}
        <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <DashboardSectionCard
            title="Washout Status Mix"
            description="Dollar value currently pending, approved, and rejected."
            icon={<Package className="h-4 w-4 text-secondary" />}
            badge={<Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">{dateRange}</Badge>}
          >
            <div className="pt-0">
              <ChartContainer
                config={{
                  amount: { label: "Amount", color: "var(--color-amount)" },
                }}
                className="h-[240px] w-full"
              >
                <BarChart data={ownerStatusChartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
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
                  <Bar dataKey="amount" fill="var(--color-amount)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard
            title="30-Day Totals"
            icon={<Clock3 className="h-4 w-4 text-accent" />}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total payments</p>
                    <p className="mt-1 text-xs text-muted-foreground">Current month activity</p>
                  </div>
                  <span className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-month-total">
                    {formatCurrency(monthStats?.totalPayments || 0)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pending payments</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-secondary" data-testid="text-pending-total">
                    {formatCurrency(pendingPayments)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">awaiting review</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Rejected</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-red-600 dark:text-red-400" data-testid="text-rejected-count">
                    {rejectedCount}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">requires follow-up</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight" data-testid="text-month-washouts">{totalWashouts}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Washouts</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight" data-testid="text-month-drivers">{uniqueDrivers}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Drivers</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-center">
                  <p className="text-lg font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{approvedCount}</p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Approved</p>
                </div>
              </div>
            </div>
          </DashboardSectionCard>
        </div>

        {/* Recent Activity */}
        <StatCard
          title="Recent Activity"
          subtitle={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as typeof dateRange)}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-36" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" data-testid="option-today">Today</SelectItem>
                  <SelectItem value="yesterday" data-testid="option-yesterday">Yesterday</SelectItem>
                  <SelectItem value="7days" data-testid="option-7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days" data-testid="option-30days">Last 30 Days</SelectItem>
                  <SelectItem value="90days" data-testid="option-90days">Last 90 Days</SelectItem>
                  <SelectItem value="all" data-testid="option-all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-9 justify-start px-2 text-primary hover:text-primary/80 sm:justify-center"
                onClick={() => setLocation('/drivers')}
                data-testid="button-view-all-activity"
              >
                View All
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* 72-hour auto-approval warning */}
            {approvalQueueActivities.some((a: any) => isPendingWashoutApproval(a.status)) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Review Required Within 72 Hours
                    </p>
                    <p className="mt-1 text-amber-800/90 text-xs dark:text-amber-200/80">
                      Pending washouts must be approved or rejected within 72 hours. After this period, they will be automatically approved and charged to your account.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {isAllActivitiesLoading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
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
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating activities...
                </div>
                {approvalQueueActivities.map((activity: any, index: number) => (
                  <div key={activity.id} className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4" data-testid={`card-recent-activity-${index}`}>
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
                            {new Date(activity.checkInTime).toLocaleDateString()} at {new Date(activity.checkInTime).toLocaleTimeString('en-US', {
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
                <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-300">Authentication Required</h3>
                <p className="mb-4 text-sm text-muted-foreground">Your session has expired. Please log in again to view your washout activities.</p>
                <div className="space-y-2">
                  <Button
                    onClick={clearPhantomActivities}
                    variant="outline"
                    className="mr-2 h-10"
                    data-testid="button-clear-cache"
                  >
                    Clear Cache
                  </Button>
                  <LogoutButton
                    onClick={logout}
                    tone="danger"
                    label="Log In Again"
                    iconOnlyOnMobile={false}
                    dataTestId="button-reauth"
                  />
                </div>
              </div>
            ) : !approvalQueueActivities.length ? (
              <DashboardEmptyState
                title="No activity found"
                description="There are no washouts for the selected period. Change the date range or check back after a driver submits a washout."
                icon={Clock}
                toneClassName="bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-300"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setLocation('/locations')}
                    data-testid="button-view-locations-empty"
                  >
                    View locations
                  </Button>
                }
              />
            ) : (
              approvalQueueActivities.map((activity: any, index: number) => (
                <div key={activity.id} className="space-y-3 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm" data-testid={`card-recent-activity-${index}`}>
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
                          {new Date(activity.checkInTime).toLocaleDateString()} at {new Date(activity.checkInTime).toLocaleTimeString('en-US', {
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
                        <Badge 
                          variant={
                            activity.status === 'verified' ? 'default' : 
                            activity.status === 'rejected' ? 'destructive' : 
                            'secondary'
                          }
                          className="text-xs w-fit"
                          data-testid={`badge-activity-status-${index}`}
                        >
                          {getWashoutApprovalDisplayStatus(activity.status)}
                        </Badge>
                        {isPendingWashoutApproval(activity.status) && activity.checkInTime && (() => {
                          const timeLeft = getTimeUntilAutoApproval(activity.checkInTime);
                          return (
                            <span 
                              className={`text-xs font-medium ${timeLeft.isUrgent ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}
                              data-testid={`text-time-remaining-${index}`}
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              {timeLeft.isExpired 
                                ? 'Auto-approving soon' 
                                : `${timeLeft.hours}h ${timeLeft.minutes}m left`}
                            </span>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center gap-2 justify-end">
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
                          Photos
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
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-9 min-w-[80px] bg-green-600 hover:bg-green-700"
                              onClick={() => approveMutation.mutate(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-approve-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Desktop layout: Keep status and buttons side by side */}
                    <div className="hidden sm:flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={
                            activity.status === 'verified' ? 'default' : 
                            activity.status === 'rejected' ? 'destructive' : 
                            'secondary'
                          }
                          className="text-xs"
                          data-testid={`badge-activity-status-${index}`}
                        >
                          {getWashoutApprovalDisplayStatus(activity.status)}
                        </Badge>
                        {isPendingWashoutApproval(activity.status) && activity.checkInTime && (() => {
                          const timeLeft = getTimeUntilAutoApproval(activity.checkInTime);
                          return (
                            <span 
                              className={`text-xs font-medium ${timeLeft.isUrgent ? 'text-red-600 dark:text-red-500' : 'text-amber-600 dark:text-amber-500'}`}
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              {timeLeft.isExpired 
                                ? 'Auto-approving soon' 
                                : `${timeLeft.hours}h ${timeLeft.minutes}m left`}
                            </span>
                          );
                        })()}
                      </div>
                      
                      <div className="flex items-center gap-2">
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
                          Photos
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
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-8 bg-green-600 hover:bg-green-700"
                              onClick={() => approveMutation.mutate(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid={`button-approve-${index}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </StatCard>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-manage-locations"
          >
            <MapPin className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">Locations</div>
              <div className="text-xs text-muted-foreground">Manage active sites</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto min-h-24 flex-col items-start justify-start gap-2 rounded-2xl border-border/70 bg-card/95 p-4 text-left shadow-sm"
            onClick={() => setLocation('/payments')}
            data-testid="button-view-payments"
          >
            <DollarSign className="h-5 w-5 text-secondary" />
            <div>
              <div className="text-sm font-semibold">Payments</div>
              <div className="text-xs text-muted-foreground">View payout history</div>
            </div>
          </Button>
        </div>

        {/* Support Section */}
        <StatCard title="Need Help?" className="border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:border-sky-900/40 dark:from-sky-950/20 dark:to-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">Contact the operations team for onboarding, billing, or washout review questions.</p>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-sky-600" />
                <span className="font-medium text-sky-700 dark:text-sky-300" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="h-10 bg-sky-600 text-white hover:bg-sky-700 w-full sm:w-auto"
              onClick={() => setIsSupportDialogOpen(true)}
              data-testid="button-contact-support"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Message Support
            </Button>
          </div>
        </StatCard>
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
