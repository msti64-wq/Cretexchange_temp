import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
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
import { Users, DollarSign, MapPin, Clock, ImageIcon, Check, X, MessageCircle, Phone, Building2, ChevronRight, Gauge, MapPinned, Loader2, ShieldAlert, Activity, Search, TrendingUp, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { OwnerHeader } from "@/components/OwnerHeader";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@shared/addressUtils";
import { LogoutButton } from "@/components/LogoutButton";
import { resolveOwnerMembershipState } from "@shared/ownerMembership";
import { resolveConfiguredWashoutPlatformFeeCents } from "@shared/billingPolicy";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { filterPendingWashoutApprovals, getWashoutApprovalDisplayStatus, isBillableWashoutForOwnerBilling, isPendingWashoutApproval } from "@shared/washoutApproval";
import { formatLocalizedCurrency, useLanguage } from "@/lib/i18n";
import { normalizeDollarInputToCents } from "@shared/money";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [rejectionTarget, setRejectionTarget] = useState<{ id: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionReasonError, setRejectionReasonError] = useState<string | null>(null);
  const rejectionSubmissionRef = useRef(false);
  const [approvalTarget, setApprovalTarget] = useState<{
    id: string;
    intentToken: string;
    driverTipDisplay: string;
    driverTipCents: number;
  } | null>(null);
  const approvalIntentRequestRef = useRef(false);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days' | 'all'>('today');
  const [driverSearch, setDriverSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState<'all' | 'new' | 'repeat' | 'recent'>('all');
  const [driverSort, setDriverSort] = useState<'most_active' | 'recent_visit' | 'name'>('most_active');
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

  const { data: ownerLocationsData, isLoading: isOwnerLocationsLoading } = useQuery<any[]>({
    queryKey: ['/api/owners/locations'],
    refetchInterval: 30000,
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
    retry: false,
    mutationFn: async ({ activityId, driverTipDisplay, driverTipCents, intentToken }: { activityId: string; driverTipDisplay: string; driverTipCents: number; intentToken: string }) => {
      try {
        const response = await apiRequest("PUT", `/api/owners/activities/${activityId}/verify`, {
          driverTip: driverTipDisplay,
          driverTipCents,
          intentToken,
          actionSource: "owner-dashboard-button",
          confirmationAcknowledged: true,
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
      setApprovalTarget(null);
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

  const openApprovalDialog = async (activityId: string, driverTipDisplay: string, driverTipCents: number) => {
    if (approvalIntentRequestRef.current || approveMutation.isPending || rejectMutation.isPending || approvalTarget || rejectionTarget) return;
    approvalIntentRequestRef.current = true;
    try {
      const response = await apiRequest("POST", `/api/owners/activities/${activityId}/approval-intent`);
      const payload = await response.json();
      if (!payload || typeof payload.intentToken !== "string") {
        throw new Error("The server did not return an approval confirmation.");
      }
      setApprovalTarget({ id: activityId, intentToken: payload.intentToken, driverTipDisplay, driverTipCents });
    } catch (error) {
      toast({ title: t("owner.dashboard.approveFailed"), description: parseApiError(error), variant: "destructive" });
    } finally {
      approvalIntentRequestRef.current = false;
    }
  };

  const submitApproval = () => {
    if (!approvalTarget || approveMutation.isPending) return;
    approveMutation.mutate({
      activityId: approvalTarget.id,
      driverTipDisplay: approvalTarget.driverTipDisplay,
      driverTipCents: approvalTarget.driverTipCents,
      intentToken: approvalTarget.intentToken,
    });
  };

  const rejectMutation = useMutation({
    retry: false,
    mutationFn: async ({ activityId, reason }: { activityId: string; reason: string }) => {
      try {
        const response = await apiRequest("PUT", `/api/owners/activities/${activityId}/reject`, { reason });
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("Rejection mutation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: t("owner.dashboard.rejectSuccess") });
      setRejectionTarget(null);
      setRejectionReason("");
      setRejectionReasonError(null);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Boolean(query.queryKey[0]?.toString().startsWith('/api/owners/activities'))
      });
    },
    onError: (error) => {
      const message = parseApiError(error);
      setRejectionReasonError(message);
      toast({ title: t("owner.dashboard.rejectFailed"), description: message, variant: "destructive" });
    },
    onSettled: () => { rejectionSubmissionRef.current = false; },
  });

  const openRejectionDialog = (activityId: string) => {
    if (rejectMutation.isPending || approveMutation.isPending || rejectionTarget) return;
    setRejectionTarget({ id: activityId });
    setRejectionReason("");
    setRejectionReasonError(null);
  };

  const submitRejection = () => {
    const reason = rejectionReason.trim().replace(/\s+/g, " ");
    if (!reason) {
      setRejectionReasonError(t("owner.dashboard.rejectionReasonRequired"));
      return;
    }
    if (reason.length > 500) {
      setRejectionReasonError(t("owner.dashboard.rejectionReasonTooLong"));
      return;
    }
    if (!rejectionTarget || rejectionSubmissionRef.current || rejectMutation.isPending) return;
    rejectionSubmissionRef.current = true;
    rejectMutation.mutate({ activityId: rejectionTarget.id, reason });
  };

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
  

  if (isMainLoading) {
    return <OwnerDashboardSkeleton />;
  }

  const { weekStats, monthStats, locations } = (dashboardData as any) || {};
  const owner = (dashboardData as any)?.owner || null;
  const billingReceivablesSummary = (dashboardData as any)?.billingReceivablesSummary || null;
  const ownerActivityRows = Array.isArray(allActivitiesData) ? allActivitiesData : [];
  const ownerLocationRows = Array.isArray(ownerLocationsData) ? ownerLocationsData : [];

  const approvalQueueActivities = Array.isArray(allActivitiesData)
    ? filterPendingWashoutApprovals(allActivitiesData)
    : [];
  const pendingReviewCount = approvalQueueActivities.length;
  const configuredPlatformFeeCents = resolveConfiguredWashoutPlatformFeeCents({
    ownerCustomPlatformFee: owner?.customPlatformFee,
  });
  const pendingReviewPotentialChargesCents = approvalQueueActivities.reduce((sum: number, activity: any) => {
    const rawDriverTipRate = activity?.location?.rate ?? activity?.washout_locations?.rate ?? null;
    const driverTipCents = rawDriverTipRate !== null && rawDriverTipRate !== undefined && rawDriverTipRate !== ""
      ? resolveLocationDriverTipRateCents(rawDriverTipRate)
      : normalizeDollarInputToCents(activity?.washout_activities?.amount ?? activity?.amount ?? 0);
    return sum + configuredPlatformFeeCents + driverTipCents;
  }, 0);

  const recentActivities = (isAuthError || isDashboardAuthError) 
    ? [] 
    : Array.isArray(activitiesData) ? activitiesData : [];
  const recentActivityCount = recentActivities.length;

  const ownerActivityDriverVisitCounts = ownerActivityRows.reduce<Record<string, number>>((acc, activity: any) => {
    const driverKey = activity?.driver?.user?.id ?? activity?.driver?.id ?? activity?.driverId;
    if (!driverKey) return acc;
    acc[driverKey] = (acc[driverKey] || 0) + 1;
    return acc;
  }, {});

  const ownerActivityLocationCounts = ownerActivityRows.reduce<Record<string, { count: number; name: string }>>((acc, activity: any) => {
    const locationKey = activity?.location?.id ?? activity?.locationId;
    if (!locationKey) return acc;
    if (!acc[locationKey]) {
      acc[locationKey] = {
        count: 0,
        name: activity?.location?.name || t("owner.dashboard.unknownLocation"),
      };
    }
    acc[locationKey].count += 1;
    return acc;
  }, {});

  const ownerActivityUniqueDriverCount = Object.keys(ownerActivityDriverVisitCounts).length;
  const repeatDriverCount = Object.values(ownerActivityDriverVisitCounts).filter((count) => count > 1).length;
  const repeatVisitCount = Object.values(ownerActivityDriverVisitCounts).reduce((sum, count) => {
    return count > 1 ? sum + (count - 1) : sum;
  }, 0);
  const ownerActivityCount = ownerActivityRows.length;
  const recentLocationCount = new Set(
    recentActivities
      .map((activity: any) => activity?.location?.id ?? activity?.locationId)
      .filter(Boolean)
  ).size;
  const topLocationByActivity = Object.values(ownerActivityLocationCounts).sort((a, b) => b.count - a.count)[0] || null;
  const configuredLocationTipValues = ownerLocationRows
    .map((location: any) => {
      const rawRate = location?.rate;
      if (rawRate === null || rawRate === undefined || rawRate === "") {
        return null;
      }
      const resolved = resolveLocationDriverTipRateCents(rawRate);
      return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
    })
    .filter((value): value is number => value !== null);
  const averageConfiguredIncentiveCents = configuredLocationTipValues.length > 0
    ? Math.round(configuredLocationTipValues.reduce((sum, value) => sum + value, 0) / configuredLocationTipValues.length)
    : null;
  const activeVisibleLocationCount = ownerLocationRows.filter((location: any) => location?.isActive && location?.isVisible).length;
  const ownerIntelligenceLoading = isDashboardLoading || isAllActivitiesLoading || isOwnerLocationsLoading;
  const hasOwnerIntelligenceData = ownerActivityCount > 0 || ownerLocationRows.length > 0;

  // Driver Intelligence is operational-only. It intentionally uses approved activity rows,
  // not payment, wallet, Stripe, or settlement records.
  const selectedRangeApprovedActivities = recentActivities.filter((activity: any) => (
    bucketOwnerWashoutStatus(activity?.status) === "approved"
  ));
  const allApprovedActivities = ownerActivityRows.filter((activity: any) => (
    bucketOwnerWashoutStatus(activity?.status) === "approved"
  ));
  const selectedRangeApprovedActivityIds = new Set(selectedRangeApprovedActivities.map((activity: any) => String(activity?.id)));
  const approvedActivitiesByDriver = selectedRangeApprovedActivities.reduce<Record<string, any[]>>((acc, activity: any) => {
    const driverKey = activity?.driver?.user?.id ?? activity?.driver?.id ?? activity?.driverId;
    if (!driverKey) return acc;
    const key = String(driverKey);
    (acc[key] ||= []).push(activity);
    return acc;
  }, {});
  const allApprovedActivitiesByDriver = allApprovedActivities.reduce<Record<string, any[]>>((acc, activity: any) => {
    const driverKey = activity?.driver?.user?.id ?? activity?.driver?.id ?? activity?.driverId;
    if (!driverKey) return acc;
    const key = String(driverKey);
    (acc[key] ||= []).push(activity);
    return acc;
  }, {});
  const getActivityTime = (activity: any) => {
    const time = new Date(activity?.checkInTime ?? activity?.createdAt ?? 0).getTime();
    return Number.isFinite(time) ? time : 0;
  };
  const driverIntelligenceRows = Object.entries(approvedActivitiesByDriver).map(([driverId, activities]) => {
    const sortedActivities = [...activities].sort((left, right) => getActivityTime(left) - getActivityTime(right));
    const allDriverActivities = [...(allApprovedActivitiesByDriver[driverId] || [])]
      .sort((left, right) => getActivityTime(left) - getActivityTime(right));
    const locationVisits = activities.reduce<Record<string, { name: string; count: number }>>((acc, activity: any) => {
      const locationKey = String(activity?.location?.id ?? activity?.locationId ?? "unknown");
      const locationName = activity?.location?.name || t("owner.dashboard.unknownLocation");
      if (!acc[locationKey]) acc[locationKey] = { name: locationName, count: 0 };
      acc[locationKey].count += 1;
      return acc;
    }, {});
    const favoriteLocation = Object.values(locationVisits)
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))[0] || null;
    const latestActivity = sortedActivities[sortedActivities.length - 1] || null;
    const driverUser = latestActivity?.driver?.user || latestActivity?.driver || {};
    const driverName = `${driverUser?.firstName || ""} ${driverUser?.lastName || ""}`.trim()
      || driverUser?.username
      || t("owner.dashboard.unnamedDriver");
    const firstApprovedActivity = allDriverActivities[0] || null;
    const lastVisitAt = getActivityTime(latestActivity);
    return {
      driverId,
      driverName,
      visitCount: activities.length,
      favoriteLocation: favoriteLocation?.name || "—",
      favoriteLocationCount: favoriteLocation?.count || 0,
      lastVisitAt,
      isNew: !!firstApprovedActivity && selectedRangeApprovedActivityIds.has(String(firstApprovedActivity.id)),
      isRepeat: activities.length > 1,
      isRecent: lastVisitAt > 0 && lastVisitAt >= Date.now() - 7 * 24 * 60 * 60 * 1000,
    };
  });
  const totalUniqueDrivers = driverIntelligenceRows.length;
  const newDriverCount = driverIntelligenceRows.filter((driver) => driver.isNew).length;
  const selectedRangeRepeatDriverCount = driverIntelligenceRows.filter((driver) => driver.isRepeat).length;
  const recentDriverCount = driverIntelligenceRows.filter((driver) => driver.isRecent).length;
  const visitsPerDriver = totalUniqueDrivers > 0
    ? selectedRangeApprovedActivities.length / totalUniqueDrivers
    : 0;
  const mostActiveDriver = [...driverIntelligenceRows]
    .sort((left, right) => right.visitCount - left.visitCount || left.driverName.localeCompare(right.driverName))[0] || null;
  const driverConcentrationPercent = mostActiveDriver && selectedRangeApprovedActivities.length > 0
    ? Math.round((mostActiveDriver.visitCount / selectedRangeApprovedActivities.length) * 100)
    : 0;
  const driverLoyaltyPercent = totalUniqueDrivers > 0
    ? Math.round((selectedRangeRepeatDriverCount / totalUniqueDrivers) * 100)
    : 0;
  const driverActivityTrendData = Object.values(selectedRangeApprovedActivities.reduce<Record<string, { label: string; sortTime: number; visits: number }>>((acc, activity: any) => {
    const activityTime = getActivityTime(activity);
    if (!activityTime) return acc;
    const activityDate = new Date(activityTime);
    const key = activityDate.toISOString().slice(0, 10);
    if (!acc[key]) {
      acc[key] = {
        label: activityDate.toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" }),
        sortTime: activityTime,
        visits: 0,
      };
    }
    acc[key].visits += 1;
    return acc;
  }, {}))
    .sort((left, right) => left.sortTime - right.sortTime)
    .slice(-12);
  const normalizedDriverSearch = driverSearch.trim().toLocaleLowerCase();
  const filteredDriverIntelligenceRows = driverIntelligenceRows
    .filter((driver) => {
      const matchesSearch = !normalizedDriverSearch
        || `${driver.driverName} ${driver.favoriteLocation}`.toLocaleLowerCase().includes(normalizedDriverSearch);
      const matchesFilter = driverFilter === "all"
        || (driverFilter === "new" && driver.isNew)
        || (driverFilter === "repeat" && driver.isRepeat)
        || (driverFilter === "recent" && driver.isRecent);
      return matchesSearch && matchesFilter;
    })
    .sort((left, right) => {
      if (driverSort === "recent_visit") return right.lastVisitAt - left.lastVisitAt || right.visitCount - left.visitCount;
      if (driverSort === "name") return left.driverName.localeCompare(right.driverName);
      return right.visitCount - left.visitCount || right.lastVisitAt - left.lastVisitAt;
    });

  const platformFeeExposureCents = Number(weekStats?.platformFeesOwedCents || 0);
  const driverIncentiveExposureCents = Number(weekStats?.driverTipTotalCents || 0);
  const ownerChargeExposureCents = Number(weekStats?.ownerChargeTotalCents || (platformFeeExposureCents + driverIncentiveExposureCents));
  const billingPlatformFeesTotalCents = Number(billingReceivablesSummary?.platformFeesTotalCents ?? platformFeeExposureCents);
  const billingDriverTipsTotalCents = Number(billingReceivablesSummary?.driverTipTotalCents ?? driverIncentiveExposureCents);
  const billingOwnerChargeTotalCents = Number(billingReceivablesSummary?.ownerChargeTotalCents ?? ownerChargeExposureCents);
  const currentReceivablesCents = billingOwnerChargeTotalCents;
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
  const billableRecentActivities = Array.isArray(recentActivities)
    ? recentActivities.filter((activity: any) => isBillableWashoutForOwnerBilling(activity))
    : [];
  const billableWashoutCount = billableRecentActivities.length;
  const approvedCount = Number(billingReceivablesSummary?.approvedWashoutCount || ownerWashoutStatusCounts.approved || 0);
  const rejectedCount = Number(ownerWashoutStatusCounts.rejected || 0);

  // Debug data is now available through the DebugPanel component (add ?debug=1 to URL)

  // Calculate total washouts from the canonical billing summary when available
  const totalWashouts = Number(billableWashoutCount || 0);

  // Calculate unique drivers from the canonical billing summary when available
  const uniqueDrivers = Number(new Set(
    billableRecentActivities
      .map((activity: any) => activity.driver?.user?.id)
      .filter(Boolean)
  ).size || 0);
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
                    <p className="text-xs font-medium text-foreground">{t("owner.dashboard.openReviews", { count: pendingReviewCount })}</p>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.platformFees")}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{formatLocalizedCurrency(billingPlatformFeesTotalCents / 100, language)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("owner.dashboard.platformFeesDescription")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.driverTips")}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-sky-700 dark:text-sky-300">{formatLocalizedCurrency(billingDriverTipsTotalCents / 100, language)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("owner.dashboard.driverTipsDescription")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.totalOwnerCharge")}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{formatLocalizedCurrency(billingOwnerChargeTotalCents / 100, language)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("owner.dashboard.totalOwnerChargeDescription")}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DSKpiCard
              label={t("common.washouts")}
              value={billableWashoutCount}
              detail={t("owner.dashboard.billableWashoutsDescription")}
              accentTone="info"
              data-testid="text-daily-visits"
            />
            <DSKpiCard
              label={t("owner.dashboard.pendingReview")}
              value={pendingReviewCount}
              detail={
                <div className="space-y-0.5">
                  <div>{`${pendingReviewCount} Washout${pendingReviewCount === 1 ? "" : "s"}`}</div>
                  <div>{t("owner.dashboard.potentialCharges", { amount: formatLocalizedCurrency(pendingReviewPotentialChargesCents / 100, language) })}</div>
                </div>
              }
              accentTone="warning"
              data-testid="text-pending-payments"
            />
            <DSKpiCard
              label={t("owner.dashboard.currentReceivables")}
              value={formatLocalizedCurrency(currentReceivablesCents / 100, language)}
              detail={
                <div className="space-y-0.5">
                  <div>{`${approvedCount} Approved Washouts`}</div>
                  <div>Owner charge awaiting collection</div>
                </div>
              }
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

        {/* Owner Intelligence */}
        <section className="space-y-3">
          <DSSectionHeader
            title={t("owner.dashboard.ownerIntelligence")}
            description={t("owner.dashboard.ownerIntelligenceDescription")}
          />
          {ownerIntelligenceLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5].map((item) => (
                <DSCard key={item} padding="md">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </DSCard>
              ))}
            </div>
          ) : !hasOwnerIntelligenceData ? (
            <DashboardEmptyState
              title={t("owner.dashboard.noOwnerIntelligence")}
              description={t("owner.dashboard.noOwnerIntelligenceDescription")}
              icon={Activity}
              action={
                <Button variant="outline" size="sm" onClick={() => setLocation("/locations")}>
                  {t("common.locations")}
                </Button>
              }
              dataTestId="empty-owner-intelligence"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DSKpiCard
                label={t("owner.dashboard.driverAttraction")}
                value={ownerActivityCount}
                detail={
                  <div className="space-y-0.5">
                    <div>{`${ownerActivityUniqueDriverCount} unique driver${ownerActivityUniqueDriverCount === 1 ? "" : "s"}`}</div>
                    <div>{`Recent activity: ${recentActivityCount}`}</div>
                    <div className="text-xs text-muted-foreground">{t("owner.dashboard.derivedFromOwnerActivity")}</div>
                  </div>
                }
                accentTone="info"
                data-testid="text-owner-driver-attraction"
              />
              <DSKpiCard
                label={t("owner.dashboard.repeatDriverVisits")}
                value={repeatDriverCount}
                detail={
                  <div className="space-y-0.5">
                    <div>{`${repeatVisitCount} repeat visit${repeatVisitCount === 1 ? "" : "s"}`}</div>
                    <div>A repeat driver has more than one activity in the selected data set</div>
                  </div>
                }
                accentTone="warning"
                data-testid="text-owner-repeat-drivers"
              />
              <DSKpiCard
                label={t("owner.dashboard.averageDriverIncentive")}
                value={averageConfiguredIncentiveCents !== null ? formatLocalizedCurrency(averageConfiguredIncentiveCents / 100, language) : "—"}
                detail={
                  <div className="space-y-0.5">
                    <div>{configuredLocationTipValues.length > 0
                      ? `${configuredLocationTipValues.length} configured location${configuredLocationTipValues.length === 1 ? "" : "s"}`
                      : t("owner.dashboard.noConfiguredRates")}
                    </div>
                    <div className="text-xs text-muted-foreground">{t("owner.dashboard.derivedFromLocationRates")}</div>
                  </div>
                }
                accentTone="success"
                data-testid="text-owner-average-driver-incentive"
              />
              <DSKpiCard
                label={t("owner.dashboard.washoutCounts")}
                value={ownerActivityCount}
                detail={
                  <div className="space-y-0.5">
                    <div>{`${ownerWashoutStatusCounts.approved} approved / ${ownerWashoutStatusCounts.pending} pending / ${ownerWashoutStatusCounts.rejected} rejected`}</div>
                    <div>{`Selected range washouts: ${billableWashoutCount}`}</div>
                    <div className="text-xs text-muted-foreground">{t("owner.dashboard.derivedFromOwnerActivity")}</div>
                  </div>
                }
                accentTone="accent"
                data-testid="text-owner-washout-counts"
              />
              <DSKpiCard
                label={t("owner.dashboard.siteEngagementSnapshot")}
                value={activeVisibleLocationCount}
                detail={
                  <div className="space-y-0.5">
                    <div>{`${recentLocationCount} location${recentLocationCount === 1 ? "" : "s"} with recent activity`}</div>
                    <div>{topLocationByActivity
                      ? `Top location: ${topLocationByActivity.name} (${topLocationByActivity.count})`
                      : t("owner.dashboard.noActivityRanked")}
                    </div>
                    <div className="text-xs text-muted-foreground">{t("owner.dashboard.totalLocationsConfigured", { count: ownerLocationRows.length })}</div>
                  </div>
                }
                accentTone="border"
                data-testid="text-owner-site-engagement"
              />
            </div>
          )}
        </section>

        {/* Driver Intelligence — approved activity analytics only */}
        <section className="space-y-3">
          <DSSectionHeader
            title={t("owner.dashboard.driverIntelligence")}
            description={t("owner.dashboard.driverIntelligenceDescription")}
            actions={<DSStatusChip tone="neutral">{dateRange}</DSStatusChip>}
          />
          {isAllActivitiesLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <DSCard key={item} padding="md" className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32" />
                </DSCard>
              ))}
            </div>
          ) : selectedRangeApprovedActivities.length === 0 ? (
            <DashboardEmptyState
              title={t("owner.dashboard.noApprovedDriverActivity")}
              description={t("owner.dashboard.noApprovedDriverActivityDescription")}
              icon={Users}
              toneClassName="bg-slate-50 text-foreground dark:bg-slate-950/30 dark:text-foreground"
              action={
                <Button variant="outline" size="sm" onClick={() => setDateRange("30days")}>
                  View 30 days
                </Button>
              }
              dataTestId="empty-driver-intelligence"
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <DSKpiCard
                  label={t("owner.dashboard.uniqueDrivers")}
                  value={totalUniqueDrivers}
                  detail={t("owner.dashboard.approvedActivityInRange")}
                  accentTone="info"
                  data-testid="text-driver-intelligence-unique"
                />
                <DSKpiCard
                  label={t("owner.dashboard.newDrivers")}
                  value={newDriverCount}
                  detail={t("owner.dashboard.firstApprovedActivityInRange")}
                  accentTone="success"
                  data-testid="text-driver-intelligence-new"
                />
                <DSKpiCard
                  label={t("owner.dashboard.repeatDrivers")}
                  value={selectedRangeRepeatDriverCount}
                  detail={t("owner.dashboard.moreThanOneApprovedActivity")}
                  accentTone="warning"
                  data-testid="text-driver-intelligence-repeat"
                />
                <DSKpiCard
                  label={t("owner.dashboard.visitsPerDriver")}
                  value={visitsPerDriver.toFixed(1)}
                  detail={`${selectedRangeApprovedActivities.length} approved activity visit${selectedRangeApprovedActivities.length === 1 ? "" : "s"}`}
                  accentTone="accent"
                  data-testid="text-driver-intelligence-visits-per-driver"
                />
                <DSKpiCard
                  label={t("owner.dashboard.recentDrivers")}
                  value={recentDriverCount}
                  detail={t("owner.dashboard.lastApprovedVisitWithin7Days")}
                  accentTone="border"
                  data-testid="text-driver-intelligence-recent"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <DSCard padding="lg">
                  <DSSectionHeader
                    title={t("owner.dashboard.activityTrend")}
                    description={t("owner.dashboard.activityTrendDescription")}
                    actions={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                  />
                  <ChartContainer
                    config={{ visits: { label: t("owner.dashboard.approvedVisits"), color: "#0EA5E9" } }}
                    className="mt-3 h-[220px] w-full"
                  >
                    <BarChart data={driverActivityTrendData} margin={{ left: -18, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} />
                      <YAxis hide />
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel formatter={(value) => `${Number(value)} approved visit${Number(value) === 1 ? "" : "s"}`} />}
                      />
                      <Bar dataKey="visits" fill="#0EA5E9" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </DSCard>

                <DSCard padding="lg">
                  <DSSectionHeader title={t("owner.dashboard.driverEngagement")} description={t("owner.dashboard.driverEngagementDescription")} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.mostActive")}</p>
                      <p className="mt-2 truncate text-lg font-semibold tracking-tight" data-testid="text-driver-intelligence-most-active">
                        {mostActiveDriver?.driverName || "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{mostActiveDriver ? t("owner.dashboard.approvedVisitCount", { count: mostActiveDriver.visitCount }) : t("owner.dashboard.noActivity")}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.driverConcentration")}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight" data-testid="text-driver-intelligence-concentration">{driverConcentrationPercent}%</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("owner.dashboard.driverConcentrationDescription")}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.driverLoyalty")}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight" data-testid="text-driver-intelligence-loyalty">{driverLoyaltyPercent}%</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("owner.dashboard.driverLoyaltyDescription")}</p>
                    </div>
                  </div>
                </DSCard>
              </div>

              <DSCard padding="lg">
                <DSSectionHeader
                  title={t("owner.dashboard.driverActivityDirectory")}
                  description={t("owner.dashboard.driverActivityDirectoryDescription")}
                  actions={<UserRoundCheck className="h-4 w-4 text-muted-foreground" />}
                />
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_170px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={driverSearch}
                      onChange={(event) => setDriverSearch(event.target.value)}
                      placeholder={t("owner.dashboard.searchDriverOrLocation")}
                      className="pl-9"
                      data-testid="input-driver-intelligence-search"
                    />
                  </div>
                  <Select value={driverFilter} onValueChange={(value) => setDriverFilter(value as typeof driverFilter)}>
                    <SelectTrigger data-testid="select-driver-intelligence-filter"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All drivers</SelectItem>
                      <SelectItem value="new">New drivers</SelectItem>
                      <SelectItem value="repeat">{t("owner.dashboard.repeatDrivers")}</SelectItem>
                      <SelectItem value="recent">{t("owner.dashboard.recentDrivers")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={driverSort} onValueChange={(value) => setDriverSort(value as typeof driverSort)}>
                    <SelectTrigger data-testid="select-driver-intelligence-sort"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most_active">{t("owner.dashboard.mostActive")}</SelectItem>
                      <SelectItem value="recent_visit">{t("owner.dashboard.latestVisit")}</SelectItem>
                      <SelectItem value="name">Driver name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filteredDriverIntelligenceRows.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No approved drivers match the current search and filters.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">{t("common.driver")}</th>
                          <th className="px-4 py-3 font-semibold">{t("owner.dashboard.visits")}</th>
                          <th className="px-4 py-3 font-semibold">{t("owner.dashboard.favoriteLocation")}</th>
                          <th className="px-4 py-3 font-semibold">{t("owner.dashboard.lastVisit")}</th>
                          <th className="px-4 py-3 font-semibold">{t("owner.dashboard.activity")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredDriverIntelligenceRows.slice(0, 25).map((driver) => (
                          <tr key={driver.driverId} className="bg-card">
                            <td className="px-4 py-3 font-medium text-foreground">{driver.driverName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{driver.visitCount}</td>
                            <td className="px-4 py-3 text-muted-foreground">{driver.favoriteLocation}{driver.favoriteLocationCount > 1 ? ` (${driver.favoriteLocationCount})` : ""}</td>
                            <td className="px-4 py-3 text-muted-foreground">{driver.lastVisitAt ? new Date(driver.lastVisitAt).toLocaleDateString(language === "es" ? "es-US" : "en-US") : "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {driver.isNew && <DSStatusChip tone="success">{t("owner.dashboard.new")}</DSStatusChip>}
                                {driver.isRepeat && <DSStatusChip tone="warning">{t("owner.dashboard.repeat")}</DSStatusChip>}
                                {driver.isRecent && <DSStatusChip tone="info">Recent</DSStatusChip>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing up to 25 of {filteredDriverIntelligenceRows.length} approved driver record{filteredDriverIntelligenceRows.length === 1 ? "" : "s"} in the selected range.
                </p>
              </DSCard>
            </>
          )}
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
                    {formatLocalizedCurrency(monthStats?.totalPayments || 0, language)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("owner.dashboard.currentReceivables")}</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-sky-500 dark:text-sky-300" data-testid="text-pending-total">
                    {formatLocalizedCurrency(currentReceivablesCents / 100, language)}
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
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t("owner.dashboard.billableWashouts")}</p>
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
                  {new Date(activity.checkInTime).toLocaleDateString(language === "es" ? "es-US" : "en-US")} {t("owner.dashboard.at")} {new Date(activity.checkInTime).toLocaleTimeString(language === "es" ? "es-US" : "en-US", {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                          {formatLocalizedCurrency(Number(activity.amount || 0), language)}
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
                          {new Date(activity.checkInTime).toLocaleDateString(language === "es" ? "es-US" : "en-US")} {t("owner.dashboard.at")} {new Date(activity.checkInTime).toLocaleTimeString(language === "es" ? "es-US" : "en-US", {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold tracking-tight text-accent" data-testid={`text-activity-amount-${index}`}>
                        {formatLocalizedCurrency(Number(activity.amount || 0), language)}
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
                          {t("common.photos")}{Number(activity.photoCount || 0) > 0 ? ` (${activity.photoCount})` : ""}
                        </Button>
                        
                        {/* Approval buttons for pending washouts */}
                        {isPendingWashoutApproval(activity.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs px-3 h-9 min-w-[70px]"
                              onClick={() => openRejectionDialog(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending || rejectionTarget?.id === activity.id}
                              data-testid={`button-reject-${index}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {t("common.reject")}
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-9 min-w-[80px] bg-green-600 hover:bg-green-700"
                              type="button"
                              onClick={() => void openApprovalDialog(activity.id, driverTipDisplay, driverTipCents)}
                              disabled={rejectMutation.isPending || approveMutation.isPending || approvalIntentRequestRef.current}
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
                          {t("common.photos")}{Number(activity.photoCount || 0) > 0 ? ` (${activity.photoCount})` : ""}
                        </Button>
                        
                        {/* Approval buttons for pending washouts */}
                        {isPendingWashoutApproval(activity.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs px-3 h-8"
                              onClick={() => openRejectionDialog(activity.id)}
                              disabled={rejectMutation.isPending || approveMutation.isPending || rejectionTarget?.id === activity.id}
                              data-testid={`button-reject-${index}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {t("common.reject")}
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs px-3 h-8 bg-green-600 hover:bg-green-700"
                              type="button"
                              onClick={() => void openApprovalDialog(activity.id, driverTipDisplay, driverTipCents)}
                              disabled={rejectMutation.isPending || approveMutation.isPending || approvalIntentRequestRef.current}
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

      <Dialog open={Boolean(approvalTarget)} onOpenChange={(open) => {
        if (!open && !approveMutation.isPending) setApprovalTarget(null);
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("owner.dashboard.approveActivityTitle")}</DialogTitle>
            <DialogDescription>{t("owner.dashboard.approveActivityDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("owner.dashboard.approveActivityConfirmation")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApprovalTarget(null)} disabled={approveMutation.isPending}>{t("common.cancel")}</Button>
            <Button type="button" onClick={submitApproval} disabled={approveMutation.isPending} data-testid="button-confirm-approve">
              {approveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectionTarget)} onOpenChange={(open) => {
        if (!open && !rejectMutation.isPending) {
          setRejectionTarget(null);
          setRejectionReason("");
          setRejectionReasonError(null);
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("owner.dashboard.rejectActivityTitle")}</DialogTitle>
            <DialogDescription>{t("owner.dashboard.rejectActivityDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="owner-rejection-reason" className="text-sm font-medium">
              {t("owner.dashboard.rejectionReason")}
            </label>
            <textarea
              id="owner-rejection-reason"
              value={rejectionReason}
              onChange={(event) => { setRejectionReason(event.target.value); setRejectionReasonError(null); }}
              disabled={rejectMutation.isPending}
              maxLength={500}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-invalid={Boolean(rejectionReasonError)}
              aria-describedby={rejectionReasonError ? "owner-rejection-reason-error" : undefined}
            />
            {rejectionReasonError && <p id="owner-rejection-reason-error" className="text-sm text-destructive">{rejectionReasonError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectionTarget(null)} disabled={rejectMutation.isPending}>{t("common.cancel")}</Button>
            <Button type="button" variant="destructive" onClick={submitRejection} disabled={rejectMutation.isPending} data-testid="button-confirm-reject">
              {rejectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
