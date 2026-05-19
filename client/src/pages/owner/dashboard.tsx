import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { Users, DollarSign, MapPin, Clock, LogOut, ImageIcon, Check, X, MessageCircle, Phone, CreditCard, AlertTriangle, ClipboardCheck, WalletCards } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { OwnerHeader } from "@/components/OwnerHeader";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@shared/addressUtils";

const AUTO_APPROVAL_HOURS = 72;

type OwnerMetricProps = {
  title: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  dataTestId?: string;
};

function OwnerMetric({ title, value, helper, icon: Icon, tone, dataTestId }: OwnerMetricProps) {
  return (
    <Card className="rounded-lg border-border/80 bg-card/95 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground" data-testid={dataTestId}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OwnerDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl p-4">
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="rounded-lg">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
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

  // Separate query for activities with date range filtering
  const { data: activitiesData, isLoading: isActivitiesLoading, isFetching: isActivitiesFetching, error: activitiesError, status: activitiesStatus } = useQuery<any>({
    queryKey: [`/api/owners/activities?dateRange=${dateRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache at all (renamed from cacheTime in v5)
  });

  // Check for authentication errors
  const isAuthError = activitiesError && activitiesError.toString().includes('401');
  const isDashboardAuthError = activitiesError && activitiesError.toString().includes('Invalid token');


  const { data: subscriptionData } = useQuery<any>({
    queryKey: ['/api/payments/subscription-status'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

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
      toast({ title: "Washout approved for payment" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error, activityId) => {
      console.error("Approval failed:", error);
      toast({ title: "Failed to approve washout", variant: "destructive" });
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
  
  // CRITICAL FIX: Force empty activities when authentication fails to prevent phantom data
  // Backend now handles phantom activity filtering, so we can trust the API response
  const recentActivities = (isAuthError || isDashboardAuthError) 
    ? [] 
    : Array.isArray(activitiesData) ? activitiesData : [];
  
  

  // Debug data is now available through the DebugPanel component (add ?debug=1 to URL)

  // Calculate pending payments (awaiting approval)
  const pendingPayments = recentActivities?.reduce((total: number, activity: any) => {
    if (activity.status === 'pending') {
      return total + Number(activity.amount || 0);
    }
    return total;
  }, 0) || 0;

  // Calculate approved payments (verified but not yet paid)
  const approvedPayments = recentActivities?.reduce((total: number, activity: any) => {
    if (activity.status === 'verified') {
      return total + Number(activity.amount || 0);
    }
    return total;
  }, 0) || 0;

  // Calculate rejected payments
  const rejectedPayments = recentActivities?.reduce((total: number, activity: any) => {
    if (activity.status === 'rejected') {
      return total + Number(activity.amount || 0);
    }
    return total;
  }, 0) || 0;
  const pendingCount = recentActivities?.filter((activity: any) => activity.status === 'pending').length || 0;
  const approvedCount = recentActivities?.filter((activity: any) => activity.status === 'verified').length || 0;
  const rejectedCount = recentActivities?.filter((activity: any) => activity.status === 'rejected').length || 0;

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

      <main className="mx-auto max-w-6xl p-4 space-y-6">
        {/* Profile Completion Notice - Temporarily commented out for TypeScript fix */}
        {/* TODO: Re-enable after TypeScript configuration is resolved */}

        {/* Subscription Required Notice */}
        {(user && subscriptionData && (subscriptionData as any).status !== 'active') && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <CreditCard className="w-3 h-3 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Subscription Required
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  You need an active subscription to add washout locations. Each location requires a subscription to operate on the platform.
                </p>
                <Button
                  size="sm"
                  onClick={() => setLocation('/subscribe')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-subscribe"
                >
                  Start Subscription
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Overview */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold tracking-normal">Owner Dashboard</h2>
            <p className="text-sm text-muted-foreground">Review washouts, pending approvals, and location revenue at a glance.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OwnerMetric
              title="Washouts"
              value={recentActivities?.length || 0}
              helper={`${pendingCount} pending approval`}
              icon={ClipboardCheck}
              tone="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
              dataTestId="text-daily-visits"
            />
            <OwnerMetric
              title="Pending"
              value={formatCurrency(pendingPayments)}
              helper="Awaiting your review"
              icon={Clock}
              tone="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
              dataTestId="text-pending-payments"
            />
            <OwnerMetric
              title="Ready"
              value={formatCurrency(approvedPayments)}
              helper="Approved for payout"
              icon={WalletCards}
              tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-approved-payments"
            />
            <OwnerMetric
              title="Active Sites"
              value={Number(locations) || 0}
              helper="Washout locations"
              icon={MapPin}
              tone="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
              dataTestId="text-total-locations"
            />
          </div>
        </section>

        {/* Payment and Activity Analytics */}
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="rounded-lg border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Washout Status Mix</CardTitle>
                  <p className="text-sm text-muted-foreground">Dollar value currently pending, approved, and rejected.</p>
                </div>
                <Badge variant="outline">{dateRange}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  amount: { label: "Amount", color: "var(--chart-2)" },
                }}
                className="h-[220px] w-full"
              >
                <BarChart data={ownerStatusChartData} margin={{ left: -18, right: 8, top: 8 }}>
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
                  <Bar dataKey="amount" fill="var(--color-amount)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">30-Day Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Payments</span>
                <span className="text-xl font-semibold text-foreground" data-testid="text-month-total">
                  {formatCurrency(monthStats?.totalPayments || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pending Payments</span>
                <span className="text-lg font-semibold text-secondary" data-testid="text-pending-total">
                  {formatCurrency(pendingPayments)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-semibold" data-testid="text-month-washouts">{totalWashouts}</p>
                  <p className="text-xs text-muted-foreground">Washouts</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-semibold" data-testid="text-month-drivers">{uniqueDrivers}</p>
                  <p className="text-xs text-muted-foreground">Drivers</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-semibold text-red-600 dark:text-red-500" data-testid="text-rejected-count">{rejectedCount}</p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <StatCard
          title="Recent Activity"
          subtitle={
            <div className="flex items-center space-x-2">
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as typeof dateRange)}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-date-range">
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
                className="text-primary hover:text-primary/80"
                onClick={() => setLocation('/drivers')}
                data-testid="button-view-all-activity"
              >
                View All
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {/* 72-hour auto-approval warning */}
            {recentActivities?.some((a: any) => a.status === 'pending') && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-400">
                      Review Required Within 72 Hours
                    </p>
                    <p className="text-amber-700 dark:text-amber-500 text-xs mt-1">
                      Pending washouts must be approved or rejected within 72 hours. After this period, they will be automatically approved and charged to your account.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Loading state for activities */}
            {isActivitiesLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p>Loading activities...</p>
              </div>
            ) : isActivitiesFetching ? (
              <div className="space-y-3 opacity-50 transition-opacity">
                <div className="text-center py-2 text-sm text-muted-foreground">
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full inline-block mr-2"></div>
                  Updating activities...
                </div>
                {recentActivities.map((activity: any, index: number) => (
                  <div key={activity.id} className="p-4 bg-muted/50 rounded-lg space-y-3" data-testid={`card-recent-activity-${index}`}>
                    {/* Previous activity content will be dimmed while fetching */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-sm" data-testid={`text-driver-name-${index}`}>
                            {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                          </div>
                          {activity.driver?.user?.phone && (
                            <div className="text-xs text-muted-foreground" data-testid={`text-driver-phone-${index}`}>
                              📞 {activity.driver.user.phone}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground" data-testid={`text-activity-timestamp-${index}`}>
                            🕒 {new Date(activity.checkInTime).toLocaleDateString()} at {new Date(activity.checkInTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-accent" data-testid={`text-activity-amount-${index}`}>
                          {formatCurrency(Number(activity.amount || 0))}
                        </div>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                        📍 {activity.location?.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (isAuthError || isDashboardAuthError) ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Authentication Required</h3>
                <p className="text-muted-foreground mb-4">Your session has expired. Please log in again to view your washout activities.</p>
                <div className="space-y-2">
                  <Button
                    onClick={clearPhantomActivities}
                    variant="outline"
                    className="mr-2"
                    data-testid="button-clear-cache"
                  >
                    Clear Cache
                  </Button>
                  <Button
                    onClick={logout}
                    className="bg-red-600 hover:bg-red-700 text-white"
                    data-testid="button-reauth"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log In Again
                  </Button>
                </div>
              </div>
            ) : !recentActivities?.length ? (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold">No activity found</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  There are no washouts for the selected period. Change the date range or check back after a driver submits a washout.
                </p>
              </div>
            ) : (
              recentActivities.map((activity: any, index: number) => (
                <div key={activity.id} className="p-4 bg-muted/50 rounded-lg space-y-3" data-testid={`card-recent-activity-${index}`}>
                  {/* Header Row - Driver and Amount */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm" data-testid={`text-driver-name-${index}`}>
                          {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                        </div>
                        {activity.driver?.user?.phone && (
                          <div className="text-xs text-muted-foreground" data-testid={`text-driver-phone-${index}`}>
                            📞 {activity.driver.user.phone}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground" data-testid={`text-activity-timestamp-${index}`}>
                          🕒 {new Date(activity.checkInTime).toLocaleDateString()} at {new Date(activity.checkInTime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-bold text-lg text-accent" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.amount || 0))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Location Row - Full width for location name */}
                  <div className="w-full">
                    <div className="text-sm font-medium text-foreground" data-testid={`text-location-name-${index}`}>
                      📍 {activity.location?.name}
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
                      <div className="text-xs text-muted-foreground mt-1" data-testid={`text-gps-coordinates-${index}`}>
                        🌐 GPS: {Number(activity.latitude).toFixed(6)}, {Number(activity.longitude).toFixed(6)}
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
                          {activity.status === 'verified' ? 'Approved' : 
                           activity.status === 'rejected' ? 'Rejected' : 
                           'Pending Review'}
                        </Badge>
                        {activity.status === 'pending' && activity.checkInTime && (() => {
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
                        {activity.status === 'pending' && (
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
                          {activity.status === 'verified' ? 'Approved' : 
                           activity.status === 'rejected' ? 'Rejected' : 
                           'Pending Review'}
                        </Badge>
                        {activity.status === 'pending' && activity.checkInTime && (() => {
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
                        {activity.status === 'pending' && (
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
        <div className="grid grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="h-20 flex-col space-y-2"
            onClick={() => setLocation('/locations')}
            data-testid="button-manage-locations"
          >
            <MapPin className="w-6 h-6 text-primary" />
            <div className="text-center">
              <div className="font-medium">Locations</div>
              <div className="text-xs text-muted-foreground">Manage Sites</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-20 flex-col space-y-2"
            onClick={() => setLocation('/payments')}
            data-testid="button-view-payments"
          >
            <DollarSign className="w-6 h-6 text-secondary" />
            <div className="text-center">
              <div className="font-medium">Payments</div>
              <div className="text-xs text-muted-foreground">View History</div>
            </div>
          </Button>
        </div>

        {/* Support Section */}
        <StatCard title="Need Help?" className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-2 flex-1">
              <p className="text-sm text-muted-foreground">Contact our support team for assistance</p>
              <div className="flex items-center space-x-2 text-sm">
                <Phone className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-600" data-testid="text-support-phone">(469) 269-6709</span>
              </div>
            </div>
            <Button 
              size="sm" 
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
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
          '/api/payments/subscription-status'
        ]}
      />

      <MobileNav role="owner" />
    </div>
  );
}
