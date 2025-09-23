import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { PhotoModal } from "@/components/PhotoModal";
import { SupportMessageDialog } from "@/components/SupportMessageDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { Building2, Users, DollarSign, MapPin, TrendingUp, Clock, Plus, LogOut, User, ImageIcon, Check, X, MessageCircle, Phone, Crown, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days' | 'all'>('today');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Separate query for dashboard stats (stable, independent of dateRange)
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['/api/owners/dashboard'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Separate query for activities with date range filtering
  const { data: activitiesData, isLoading: isActivitiesLoading, isFetching: isActivitiesFetching, error: activitiesError, status: activitiesStatus } = useQuery({
    queryKey: [`/api/owners/activities?dateRange=${dateRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache at all (renamed from cacheTime in v5)
  });


  const { data: subscriptionData } = useQuery({
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

  // Combined loading states
  const isMainLoading = isDashboardLoading;
  const isDataReady = dashboardData && activitiesData;
  

  if (isMainLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  const { weekStats, monthStats, locations } = (dashboardData as any) || {};
  const recentActivities = Array.isArray(activitiesData) ? activitiesData : [];
  
  // DEBUGGING: Log the exact data being processed
  console.log('🎯 ACTIVITIES PROCESSING:', {
    activitiesData,
    dataType: typeof activitiesData,
    isArray: Array.isArray(activitiesData),
    length: Array.isArray(activitiesData) ? activitiesData.length : 'N/A',
    recentActivitiesLength: recentActivities.length,
    firstActivity: recentActivities.length > 0 ? recentActivities[0] : 'N/A'
  });
  

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

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        {/* Top Row - User Info and Logout */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="font-semibold text-lg leading-tight" data-testid="text-owner-name">
                Welcome, {user?.firstName} {user?.lastName}
              </h1>
              <p className="text-white/80 text-sm">Location Management</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            data-testid="button-logout"
            className="bg-black border-black text-white hover:bg-gray-800 flex-shrink-0"
          >
            <LogOut className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
        
        {/* Action Buttons Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
            className="bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
          >
            <User className="w-4 h-4 mr-2" />
            Profile
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-add-location"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/payment-methods')}
            data-testid="button-payment-methods"
            className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Payment Methods
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-6">
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

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Today's Activity" className="text-center">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-primary" data-testid="text-daily-visits">
                {recentActivities?.length || 0}
              </div>
              <div className="text-xs text-muted-foreground">Washouts Today</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-500" data-testid="text-pending-payments">
                {formatCurrency(pendingPayments)}
              </div>
              <div className="text-xs text-muted-foreground">Pending Approval</div>
            </div>
          </StatCard>

          <StatCard title="Locations & Revenue" className="text-center">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-accent" data-testid="text-total-locations">
                {locations || 0}
              </div>
              <div className="text-xs text-muted-foreground">Active Sites</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-500" data-testid="text-approved-payments">
                {formatCurrency(approvedPayments)}
              </div>
              <div className="text-xs text-muted-foreground">Ready for Payout</div>
            </div>
          </StatCard>
        </div>


        {/* 30-Day Totals */}
        <StatCard title="30-Day Totals">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Payments</span>
              <span className="text-xl font-bold text-foreground" data-testid="text-month-total">
                {formatCurrency(monthStats?.totalPayments || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Pending Payments</span>
              <span className="text-xl font-bold text-secondary" data-testid="text-pending-total">
                {formatCurrency(pendingPayments)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Washouts</span>
              <span className="text-lg font-semibold" data-testid="text-month-washouts">
                {totalWashouts}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Unique Drivers</span>
              <span className="text-lg font-semibold" data-testid="text-month-drivers">
                {uniqueDrivers}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Rejected Washouts</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-500" data-testid="text-rejected-count">
                {recentActivities?.filter((activity: any) => activity.status === 'rejected').length || 0}
              </span>
            </div>
          </div>
        </StatCard>

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
            ) : !recentActivities?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No activity found for this time period</p>
                <div className="mt-4 text-xs bg-red-100 p-2 rounded">
                  DEBUG: user={user?.id} | dateRange={dateRange} | length={recentActivities?.length}
                </div>
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
                    {activity.location?.address && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {activity.location.address}
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
                <span className="font-medium text-blue-600" data-testid="text-support-phone">214-949-3859</span>
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

{console.log("🔧 Dashboard: Rendering PhotoModal", {
        isOpen: isPhotoModalOpen,
        activity: selectedActivity,
        activityId: selectedActivity?.id
      })}
      <PhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => {
          console.log("🔧 Dashboard: PhotoModal onClose called");
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
