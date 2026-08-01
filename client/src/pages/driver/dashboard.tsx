import { Component, useEffect, useRef, useState, type ReactNode } from "react";
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
import { MapPin, MessageCircle, Phone, Wallet, Ticket, RefreshCw, Truck, Route, ArrowRight, Activity, Bell, CheckCircle2, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatAddress } from "@shared/addressUtils";
import { getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "@shared/washoutApproval";
import { calculateDistance, getCurrentLocation } from "@/lib/gps";
import { resolveLocationDriverTipRateCents } from "@shared/locationBilling";
import { localeForLanguage, useLanguage } from "@/lib/i18n";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { apiRequest } from "@/lib/queryClient";
import { getDriverPayoutStatus } from "@/lib/driverPayoutSettings";
import { useDriverPaymentLifecycle } from "@/hooks/useDriverPaymentLifecycle";
import { DriverLifecycleSummary } from "@/components/driver/DriverLifecycleSummary";
import { DriverMaterialIntentSelector, driverMaterialIntentKey, type DriverMaterialIntent } from "@/components/driver/DriverMaterialIntentSelector";
import { DriverIntelligenceSummary } from "@/components/driver/DriverIntelligenceSummary";
import { formatDistanceToNow } from "date-fns";
import { resolveDriverOperationalReadiness } from "@shared/driverOperationalReadiness";
import { resolveDriverDashboardGpsState, resolveDriverDashboardReadinessPresentation } from "@/lib/driverDashboardReadiness";

type DriverDashboardStatsRange = "today" | "week" | "month";

interface DriverWalletBalance {
  availableBalance: number;
  pendingBalance: number;
  totalBalance: number;
}

interface DriverAuthUser {
  id?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  roleData?: {
    employerName?: string;
    truckNumber?: string;
    hasAgreedToTerms?: boolean;
    termsAgreedAt?: string | Date | null;
  };
}

interface DriverTermsStatus {
  hasAgreed: boolean;
  agreedAt: string | null;
}

interface DriverStripeAccountStatus {
  hasAccount: boolean;
  status: "not_started" | "setup_started" | "action_required" | "payout_ready" | "payouts_ready" | "status_unavailable" | "account_conflict";
  onboardingComplete?: boolean | null;
  payoutsEnabled?: boolean | null;
  chargesEnabled?: boolean | null;
  detailsSubmitted?: boolean | null;
  payoutReady?: boolean | null;
  errorState?: { code?: string; retryable?: boolean; supportRequired?: boolean } | null;
}

interface DriverDebitCardStatus {
  hasRequested?: boolean;
  status?: string;
  cardStatus?: string;
  cardLast4?: string;
  requestedAt?: string | Date | null;
  issuedAt?: string | Date | null;
  activatedAt?: string | Date | null;
}

interface DriverLotteryStatus {
  enabled: boolean;
  driverEntryCount?: number | null;
  currentDrawing?: {
    monthName?: string | null;
    lotteryYear?: number | null;
  } | null;
  currentDrawingMessage?: string | null;
}

interface UnreadNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string | Date;
  isRead?: boolean;
}

interface DriverDashboardLocation {
  id?: string;
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  rate?: string | number | null;
  isActive?: boolean;
  isVisible?: boolean;
  operatingHours?: string | null;
}

interface RankedDashboardLocation extends DriverDashboardLocation {
  distanceMiles?: number | null;
  configuredIncentiveCents: number;
}

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

function isBillableWashoutStatus(status: string | null | undefined) {
  return status === "verified" || status === "approved" || status === "completed";
}

function normalizeDashboardLocation(item: any): DriverDashboardLocation {
  return item?.washout_locations || item || {};
}

function parseLocationCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDistanceMiles(distance: number | null | undefined, unavailableText: string): string {
  if (distance === null || distance === undefined || !Number.isFinite(distance)) {
    return unavailableText;
  }

  if (distance < 1) {
    return `${Math.max(1, Math.round(distance * 5280))} ft away`;
  }

  return `${distance.toFixed(distance < 10 ? 1 : 0)} mi away`;
}

function formatDashboardLocationAddress(location: DriverDashboardLocation): string {
  return location.street || location.city || location.state || location.zip
    ? formatAddress(location as Record<string, unknown>)
    : "";
}

function DriverDashboardErrorFallback() {
  const { t } = useLanguage();
  return (
    <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground">
      <div className="w-full border-b border-border/70 bg-card/95 px-3 py-3 shadow-sm sm:px-4">
        <div className="mx-auto w-full max-w-6xl min-w-0 text-sm text-muted-foreground">{t("driver.dashboard.errorTitle")}</div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-3 py-4 text-sm text-muted-foreground sm:px-4">{t("driver.dashboard.errorDescription")}</div>
    </div>
  );
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
      return <DriverDashboardErrorFallback />;
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
  const [deferredDashboardWidgetsEnabled, setDeferredDashboardWidgetsEnabled] = useState(false);
  const [statsRange, setStatsRange] = useState<DriverDashboardStatsRange>("today");
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsChecking, setGpsChecking] = useState(true);
  const [gpsRetryCount, setGpsRetryCount] = useState(0);
  const materialSelectorRef = useRef<HTMLDivElement>(null);

  const { data: dashboardData, isLoading, isError: dashboardDataError, refetch } = useQuery({
    queryKey: [`/api/drivers/dashboard?statsRange=${statsRange}&includeSecondary=false`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Let the operational dashboard commit before beginning secondary financial,
  // rewards, lifecycle, and notification work. Two animation frames ensure the
  // first usable view has an opportunity to paint on mobile browsers.
  useEffect(() => {
    if (!dashboardData || deferredDashboardWidgetsEnabled) return;
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setDeferredDashboardWidgetsEnabled(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [dashboardData, deferredDashboardWidgetsEnabled]);

  const { data: authUser, isLoading: authUserLoading, isError: authUserError, refetch: refetchAuthUser } = useQuery<DriverAuthUser>({
    queryKey: ['/api/auth/user'],
    refetchInterval: 60000,
  });

  const { data: termsStatus, isLoading: termsStatusLoading, isError: termsStatusError, refetch: refetchTermsStatus } = useQuery<DriverTermsStatus>({
    queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`],
    refetchInterval: 60000,
  });

  const { data: stripeAccountStatus, isLoading: stripeAccountStatusLoading, isError: stripeAccountStatusError } = useQuery<DriverStripeAccountStatus>({
    queryKey: ['/api/drivers/stripe-status'],
    refetchInterval: 60000,
    enabled: deferredDashboardWidgetsEnabled,
  });

  const { data: debitCardStatus, isLoading: debitCardStatusLoading, isError: debitCardStatusError } = useQuery<DriverDebitCardStatus>({
    queryKey: ['/api/drivers/debit-card-status'],
    refetchInterval: 60000,
    enabled: deferredDashboardWidgetsEnabled,
  });

  const { data: unreadNotificationsData, isLoading: unreadNotificationsLoading, isError: unreadNotificationsError, refetch: refetchUnreadNotifications } = useQuery<{
    count: number;
    notifications: UnreadNotification[];
  }>({
    queryKey: ['/api/notifications/unread'],
    refetchInterval: 30000,
    enabled: deferredDashboardWidgetsEnabled,
  });

  const { data: materialIntent, isLoading: materialIntentLoading, isError: materialIntentError, refetch: refetchMaterialIntent } = useQuery<DriverMaterialIntent>({
    queryKey: driverMaterialIntentKey,
    queryFn: async () => (await apiRequest("GET", "/api/drivers/material-intent")).json(),
  });
  const activeMaterialSlug = materialIntent?.materialSlug || null;
  const hasValidActiveMaterial = Boolean(activeMaterialSlug && materialIntent?.material);
  const { data: driverLocations, isLoading: driverLocationsLoading, isError: driverLocationsError, refetch: refetchDriverLocations } = useQuery<any[]>({
    queryKey: ['/api/drivers/locations', activeMaterialSlug],
    queryFn: async () => (await apiRequest("GET", `/api/drivers/locations?materialSlug=${encodeURIComponent(activeMaterialSlug!)}`)).json(),
    enabled: hasValidActiveMaterial,
    refetchInterval: 300000,
  });

  const driverLifecycle = useDriverPaymentLifecycle({ enabled: deferredDashboardWidgetsEnabled });

  const { data: walletBalance, isLoading: walletBalanceLoading, isError: walletBalanceError, refetch: refetchWalletBalance } = useQuery<DriverWalletBalance>({
    queryKey: ['/api/wallet/balance'],
    refetchInterval: 30000,
    enabled: deferredDashboardWidgetsEnabled,
  });

  const { data: lotteryStatus, isLoading: lotteryStatusLoading } = useQuery<DriverLotteryStatus>({
    queryKey: ['/api/lottery/status'],
    queryFn: async () => (await apiRequest("GET", "/api/lottery/status")).json(),
    refetchInterval: 60000,
    enabled: deferredDashboardWidgetsEnabled,
  });

  const refreshDashboardData = () => {
    void refetch();
    if (deferredDashboardWidgetsEnabled) {
      driverLifecycle.refresh();
      void refetchWalletBalance();
    }
  };

  const { data: lotteryEntries, isLoading: lotteryEntriesLoading, error: lotteryEntriesError } = useQuery<any[]>({
    queryKey: ['/api/drivers/lottery-entries'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/drivers/lottery-entries");
      return response.json();
    },
    enabled: deferredDashboardWidgetsEnabled && showLotteryEntries,
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


  useEffect(() => {
    let cancelled = false;

    const loadCurrentLocation = async () => {
      setGpsChecking(true);
      try {
        const coords = await getCurrentLocation();
        if (cancelled) return;
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationError(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : t("pilot.gps.unavailable");
        setLocationError(message);
        setCurrentLocation(null);
      } finally {
        if (!cancelled) setGpsChecking(false);
      }
    };

    loadCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, [gpsRetryCount]);

  if (isLoading) {
    return <DriverDashboardSkeleton />;
  }

  if (dashboardDataError) {
    return (
      <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
        <DriverHeader />
        <main className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4">
          <DSCard padding="lg" elevated>
            <h1 className="text-xl font-semibold">{t("driver.dashboard.operationalDataUnavailable")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("driver.dashboard.operationalDataUnavailableHelp")}</p>
            <Button className="mt-4" onClick={() => void refetch()} data-testid="button-retry-dashboard-data">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("common.retry")}
            </Button>
          </DSCard>
        </main>
        <MobileNav role="driver" />
      </div>
    );
  }

  // Extract data with proper null checks and type annotation
  const dailyStats = (dashboardData as any)?.dailyStats || null;
  const recentActivities = (dashboardData as any)?.recentActivities || null;
  const lotteryEntryCount = lotteryStatus?.driverEntryCount ?? 0;
  const lotteryActive = lotteryStatus?.enabled ?? false;
  const currentDrawing = lotteryStatus?.currentDrawing || null;
  const currentDrawingLabel = currentDrawing?.monthName && currentDrawing.lotteryYear
    ? new Date(`${currentDrawing.monthName} 1, ${currentDrawing.lotteryYear}`).toLocaleDateString(
        localeForLanguage(language),
        { month: "long", year: "numeric" },
      )
    : t("driver.dashboard.awaitingDrawing");

  const latestActivity = Array.isArray(recentActivities) && recentActivities.length > 0 ? recentActivities[0] : null;
  const latestLocationName = latestActivity?.washout_locations?.name || latestActivity?.location?.name || t("driver.dashboard.latestStop");
  const latestLocationAddress = latestActivity
    ? (latestActivity.washout_locations?.address
      || latestActivity.location?.address
      || formatAddress(latestActivity.washout_locations || latestActivity.location || {}))
    : "";
  const latestActivityStatus = latestActivity ? (latestActivity.washout_activities?.status || latestActivity.status) : null;
  const driverOperationalReadiness = resolveDriverOperationalReadiness({
    user: authUser,
    profile: authUser?.roleData ? {
      userId: authUser.id,
      employerName: authUser.roleData.employerName,
      truckNumber: authUser.roleData.truckNumber,
      activeMaterialSlug,
    } : null,
    termsAccepted: termsStatus?.hasAgreed,
    activeMaterial: materialIntent?.material,
  });
  const dashboardReadiness = resolveDriverDashboardReadinessPresentation(driverOperationalReadiness, {
    authenticationLoading: authUserLoading,
    termsLoading: termsStatusLoading,
    materialLoading: materialIntentLoading,
    authenticationUnavailable: authUserError,
    termsUnavailable: termsStatusError,
    materialUnavailable: materialIntentError,
  });
  const profileReady = driverOperationalReadiness.profileComplete;
  const termsAccepted = driverOperationalReadiness.termsAccepted;
  const stripePresentationStatus = stripeAccountStatusError
    ? "status_unavailable"
    : getDriverPayoutStatus(stripeAccountStatus);
  const stripeReady = stripePresentationStatus === "payout_ready";
  const debitCardState = debitCardStatus?.hasRequested
    ? (debitCardStatus.status || debitCardStatus.cardStatus || "requested")
    : "not requested";
  const accountReady = dashboardReadiness.state === "ready";
  const gpsState = resolveDriverDashboardGpsState({
    checking: gpsChecking,
    hasCurrentLocation: Boolean(currentLocation),
    error: locationError,
  });
  const handleDashboardReadinessAction = () => {
    if (!dashboardReadiness.action) return;
    if (dashboardReadiness.action === "retry_readiness") {
      if (dashboardReadiness.unavailableSource === "authentication") void refetchAuthUser();
      if (dashboardReadiness.unavailableSource === "terms") void refetchTermsStatus();
      if (dashboardReadiness.unavailableSource === "material") void refetchMaterialIntent();
      return;
    }
    if (dashboardReadiness.action === "select_material") {
      materialSelectorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (dashboardReadiness.route) setLocation(dashboardReadiness.route);
  };
  const stripeStatusUnavailable = stripePresentationStatus === "status_unavailable";
  const unreadNotifications = unreadNotificationsData?.notifications || [];
  const unreadNotificationCount = unreadNotificationsData?.count ?? unreadNotifications.length;
  const topUnreadNotifications = unreadNotifications.slice(0, 3);
  const currentDrawingText = currentDrawingLabel;
  const optionalFinancialLoading = !deferredDashboardWidgetsEnabled || stripeAccountStatusLoading;
  const optionalDebitCardLoading = !deferredDashboardWidgetsEnabled || debitCardStatusLoading;
  const optionalNotificationsLoading = !deferredDashboardWidgetsEnabled || unreadNotificationsLoading;
  const optionalWalletLoading = !deferredDashboardWidgetsEnabled || walletBalanceLoading;
  const optionalLotteryLoading = !deferredDashboardWidgetsEnabled || lotteryStatusLoading;

  const rankedDriverLocations: RankedDashboardLocation[] = Array.isArray(driverLocations)
    ? driverLocations
        .map((item: any) => {
          const location = normalizeDashboardLocation(item);
          const latitude = parseLocationCoordinate(location.latitude);
          const longitude = parseLocationCoordinate(location.longitude);
          const configuredIncentiveCents = resolveLocationDriverTipRateCents(location.rate);

          const distanceMiles = currentLocation && latitude !== null && longitude !== null
            ? calculateDistance(currentLocation.lat, currentLocation.lng, latitude, longitude)
            : null;

          return {
            ...location,
            distanceMiles,
            configuredIncentiveCents,
          } as RankedDashboardLocation;
        })
        .filter((location) => location.isActive !== false && location.isVisible !== false)
    : [];

  const recommendedLocation = rankedDriverLocations
    .filter((location) => location.distanceMiles !== null)
    .sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0))[0] || null;

  const hasLocationData = Array.isArray(driverLocations) && driverLocations.length > 0;
  const locationRankingUnavailable = Boolean(locationError) || !currentLocation;

  return (
    <DriverDashboardErrorBoundary>
      <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
        <DriverHeader />

        {/* GPS is a contextual browser capability, not account readiness. */}
        <DSCard className="w-full max-w-full rounded-none border-x-0 border-t-0 px-3 py-3 sm:px-4" padding="sm" elevated>
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${gpsState === "available" ? "bg-emerald-500" : gpsState === "checking" ? "bg-amber-500 animate-pulse" : "bg-muted-foreground"}`} />
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight" data-testid="text-gps-status">{t(`driver.dashboard.gps.${gpsState}`)}</span>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-full border border-border/70 bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" data-testid="text-current-location">{t(`driver.dashboard.gpsHelp.${gpsState}`)}</span>
              {(gpsState === "permission_needed" || gpsState === "unavailable") && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setGpsRetryCount((count) => count + 1)} data-testid="button-retry-gps">{t("common.retry")}</Button>}
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
              <span className="max-w-full break-words rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:tracking-[0.16em]">
                {t(`driver.dashboard.gps.${gpsState}`)}
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
            <div ref={materialSelectorRef}>
              <DriverMaterialIntentSelector />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant="default"
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 focus-visible:ring-primary/50"
                onClick={handleDashboardReadinessAction}
                disabled={dashboardReadiness.state === "loading"}
                data-testid="button-find-location-hero"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="break-words text-sm font-semibold tracking-tight">{dashboardReadiness.action ? t(`driver.dashboard.readinessAction.${dashboardReadiness.action}`) : t("common.loading")}</span>
                <span className="break-words text-xs text-primary-foreground/85">{dashboardReadiness.action ? t(`driver.dashboard.readinessActionHelp.${dashboardReadiness.action}`) : t("driver.dashboard.readinessLoadingHelp")}</span>
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

              {!optionalLotteryLoading && lotteryActive && (
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

        <DriverIntelligenceSummary enabled={Boolean(dashboardData)} />

        <section className="space-y-2">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.operationalIntelligence")}
              </p>
              <h3 className="break-words text-sm font-semibold tracking-tight text-foreground">
                {t("driver.dashboard.operationalIntelligenceDescription")}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <DriverLifecycleSummary lifecycle={driverLifecycle.lifecycle} isLoading={!deferredDashboardWidgetsEnabled || driverLifecycle.isLoading} paymentError={driverLifecycle.paymentError} onViewActivity={() => setLocation('/activity')} variant="dashboard" />
            <DSCard padding="md" elevated className="min-h-[260px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.accountReadiness")}
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      {t("driver.dashboard.readyToWork")}
                    </h3>
                  </div>
                  <DSStatusChip tone={dashboardReadiness.state === "loading" || dashboardReadiness.state === "unavailable" ? "neutral" : accountReady ? "success" : "warning"} size="sm">
                    {dashboardReadiness.state === "loading"
                      ? t("common.loading")
                      : dashboardReadiness.state === "unavailable"
                      ? t("driver.dashboard.readinessStatusUnavailable")
                      : accountReady ? t("driver.dashboard.readinessReady") : t("driver.dashboard.readinessActionNeeded")}
                  </DSStatusChip>
                </div>

                <div data-testid="driver-operational-readiness">
                {dashboardReadiness.state === "loading" ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-36 bg-muted" />
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {dashboardReadiness.state === "unavailable" ? (
                      <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2" data-testid="driver-account-readiness-unavailable">
                        <p className="text-sm font-medium">{t("driver.dashboard.readinessUnavailable")}</p>
                        <Button variant="link" className="h-auto px-0 py-1" onClick={handleDashboardReadinessAction}>{t("common.retry")}</Button>
                      </div>
                    ) : !accountReady ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100" data-testid="driver-account-readiness-next-step">
                        {t(`driver.dashboard.readinessActionHelp.${dashboardReadiness.action}`)}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">{t("driver.dashboard.profileVerification")}</span>
                      <DSStatusChip tone={profileReady ? "success" : "warning"} size="sm">
                        {profileReady ? t("driver.dashboard.readinessComplete") : t("driver.dashboard.readinessNeedsInfo")}
                      </DSStatusChip>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">{t("driver.dashboard.termsAccepted")}</span>
                      <DSStatusChip tone={termsAccepted ? "success" : "warning"} size="sm">
                        {termsAccepted ? t("driver.dashboard.termsAcceptedStatus") : t("driver.dashboard.termsPending")}
                      </DSStatusChip>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">{t("driver.dashboard.activeMaterial")}</span>
                      <DSStatusChip tone={driverOperationalReadiness.activeMaterialState === "valid" ? "success" : "warning"} size="sm">
                        {driverOperationalReadiness.activeMaterialState === "valid" ? t("driver.dashboard.readinessComplete") : t("driver.dashboard.readinessNeedsInfo")}
                      </DSStatusChip>
                    </div>
                  </div>
                )}
                </div>
                <div className="space-y-2 text-sm" data-testid="driver-optional-financial-status">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">{t("driver.dashboard.optionalStripe")}</span>
                      {optionalFinancialLoading ? <Skeleton className="h-5 w-24 bg-muted" /> : (
                        <DSStatusChip tone={stripeStatusUnavailable ? "neutral" : stripeReady ? "success" : "warning"} size="sm">
                          {t(`driver.payout.status.${stripePresentationStatus}`)}
                        </DSStatusChip>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">{t("driver.dashboard.optionalDebitCard")}</span>
                      {optionalDebitCardLoading ? <Skeleton className="h-5 w-24 bg-muted" /> : (
                        <DSStatusChip tone={debitCardStatusError ? "neutral" : debitCardState === "active" ? "success" : "neutral"} size="sm">
                          {debitCardStatusError ? t("driver.dashboard.optionalFinancialStatusUnavailable") : t(`driver.dashboard.debitStatus.${debitCardState.replaceAll(" ", "_")}`)}
                        </DSStatusChip>
                      )}
                    </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={handleDashboardReadinessAction}
                  >
                    {dashboardReadiness.action === "find_locations" ? t("driver.dashboard.findLocation") : dashboardReadiness.action ? t(`driver.dashboard.readinessAction.${dashboardReadiness.action}`) : t("common.loading")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/wallet')}
                  >
                    {t("common.wallet")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DSCard>

            <DSCard padding="md" elevated className="min-h-[260px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.unreadNotifications")}
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      {t("driver.dashboard.notificationsTitle")}
                    </h3>
                  </div>
                  <DSStatusChip tone={unreadNotificationCount > 0 ? "warning" : "neutral"} size="sm">
                    {optionalNotificationsLoading ? "…" : unreadNotificationCount}
                  </DSStatusChip>
                </div>

                {optionalNotificationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
                  </div>
                ) : unreadNotificationsError ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4" data-testid="driver-notifications-unavailable">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.notificationsUnavailable")}</p>
                    <Button variant="link" className="h-auto px-0 py-1" onClick={() => void refetchUnreadNotifications()}>{t("common.retry")}</Button>
                  </div>
                ) : topUnreadNotifications.length > 0 ? (
                  <div className="space-y-2">
                    {topUnreadNotifications.map((notification) => (
                      <div key={notification.id} className="rounded-2xl border border-border/70 bg-background/70 p-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                            <Bell className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.message}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.allCaughtUp")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("driver.dashboard.noUnreadNotifications")}</p>
                  </div>
                )}

                <div className="mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/notifications')}
                  >
                    {t("driver.dashboard.notifications")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DSCard>

            <DSCard padding="md" elevated className="min-h-[260px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.walletPreview")}
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      {t("driver.dashboard.availableFunds")}
                    </h3>
                  </div>
                  <Wallet className="h-5 w-5 shrink-0 text-primary" />
                </div>

                {optionalWalletLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-32 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </div>
                ) : walletBalanceError ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3" data-testid="driver-wallet-unavailable">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.walletUnavailable")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("driver.dashboard.walletUnavailableHelp")}</p>
                    <Button variant="link" className="h-auto px-0 py-1" onClick={() => void refetchWalletBalance()}>{t("common.retry")}</Button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t("driver.dashboard.walletBalance")}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-dashboard-available-balance">
                        {formatCurrency(walletBalance?.availableBalance ?? 0)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("driver.dashboard.walletSeparation")}</p>
                  </>
                )}

                <div className="mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/wallet')}
                  >
                    {t("driver.dashboard.viewWallet")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DSCard>

            <DSCard padding="md" elevated className="min-h-[260px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.rewardsSummary")}
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      {t("driver.dashboard.monthlyTicketProgress")}
                    </h3>
                  </div>
                  <DSStatusChip tone={optionalLotteryLoading ? "neutral" : lotteryActive ? "success" : "warning"} size="sm">
                    {optionalLotteryLoading ? "…" : lotteryActive ? t("common.active") : t("driver.dashboard.paused")}
                  </DSStatusChip>
                </div>

                {optionalLotteryLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 rounded-2xl bg-muted" />
                    <Skeleton className="h-20 rounded-2xl bg-muted" />
                  </div>
                ) : (
                <div className="space-y-2 text-sm">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.currentMonthEntries")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      {lotteryEntryCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.currentDrawingLabel")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {currentDrawingText}
                    </p>
                  </div>
                </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/driver/rewards')}
                  >
                    {t("driver.dashboard.viewRewards")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DSCard>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
                {t("driver.dashboard.locationIntelligence")}
              </p>
              <h3 className="break-words text-sm font-semibold tracking-tight text-foreground">
                {t("driver.dashboard.locationDiscovery")}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <DSCard padding="md" elevated className="min-h-[240px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("driver.dashboard.recommendedLocation")}
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      {t("driver.dashboard.nearestSuitableStop")}
                    </h3>
                  </div>
                  <MapPin className="h-5 w-5 shrink-0 text-primary" />
                </div>

                {materialIntentError ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4" data-testid="driver-material-unavailable">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.materialUnavailable")}</p>
                    <Button variant="link" className="h-auto px-0 py-1" onClick={() => void refetchMaterialIntent()}>{t("common.retry")}</Button>
                  </div>
                ) : materialIntentLoading ? (
                  <div className="space-y-3" data-testid="driver-material-loading">
                    <Skeleton className="h-4 w-36 bg-muted" />
                    <Skeleton className="h-8 w-52 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                  </div>
                ) : !hasValidActiveMaterial ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.materialSelectionNeeded")}</p>
                    <Button variant="link" className="h-auto px-0 py-1" onClick={handleDashboardReadinessAction}>{t("driver.dashboard.readinessAction.select_material")}</Button>
                  </div>
                ) : driverLocationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-36 bg-muted" />
                    <Skeleton className="h-8 w-52 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </div>
                ) : driverLocationsError ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4" data-testid="driver-locations-unavailable">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.locationsUnavailable")}</p>
                    <Button variant="link" className="h-auto px-0 py-1" onClick={() => void refetchDriverLocations()}>{t("common.retry")}</Button>
                  </div>
                ) : gpsState === "checking" ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4" data-testid="driver-location-ranking-checking">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.locationAccessNeeded")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("driver.dashboard.locationAccessChecking")}</p>
                  </div>
                ) : locationRankingUnavailable ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">{t("driver.dashboard.locationAccessNeeded")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("driver.dashboard.locationAccessUnavailable")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLocation('/locations')}>
                        {t("driver.dashboard.viewLocations")}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setGpsRetryCount((count) => count + 1)}>
                        {t("common.retry")}
                      </Button>
                    </div>
                  </div>
                ) : !hasLocationData ? (
                  <DashboardEmptyState
                    title={t("driver.dashboard.noLocations")}
                    description={t("driver.dashboard.noLocationsDescription")}
                    icon={MapPin}
                    toneClassName="bg-card text-foreground"
                  />
                ) : recommendedLocation ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-semibold text-foreground">
                            {recommendedLocation.name || t("driver.dashboard.nearbyLocation")}
                          </p>
                          {formatDashboardLocationAddress(recommendedLocation) && (
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {formatDashboardLocationAddress(recommendedLocation)}
                            </p>
                          )}
                        </div>
                        <DSStatusChip tone="success" size="sm">{t("driver.dashboard.recommended")}</DSStatusChip>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>{formatDistanceMiles(recommendedLocation.distanceMiles, t("driver.dashboard.distanceUnavailable"))}</span>
                        <span>•</span>
                        <span>
                          {recommendedLocation.configuredIncentiveCents > 0
                            ? t("driver.dashboard.configuredIncentiveValue", { amount: formatCurrency(recommendedLocation.configuredIncentiveCents / 100) })
                            : t("driver.dashboard.configuredIncentiveUnavailable")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("driver.dashboard.configuredIncentiveQualification")}</p>
                      {recommendedLocation.operatingHours && (
                        <p className="text-sm text-muted-foreground">
                          {t("driver.dashboard.hours", { hours: recommendedLocation.operatingHours })}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                        onClick={() => setLocation('/locations')}
                      >
                        {t("driver.dashboard.viewLocations")}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <DashboardEmptyState
                    title={t("driver.dashboard.noRankedLocation")}
                    description={t("driver.dashboard.noRankedLocationDescription")}
                    icon={MapPin}
                    toneClassName="bg-card text-foreground"
                  />
                )}
              </div>
            </DSCard>

          </div>
        </section>

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
              onClick={refreshDashboardData}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("driver.dashboard.refresh")}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DSKpiCard
              label={t("driver.dashboard.siteVisitsToday")}
              value={dailyStats?.visits || 0}
              detail={t("driver.dashboard.completedToday")}
              accentTone="info"
              data-testid="text-daily-visits"
            />
          </div>
        </section>

        {/* Today's Activity */}
        <DSCard padding="sm" elevated>
          <DSSectionHeader
            title={t("driver.dashboard.todaysActivity")}
            description={t("driver.dashboard.todaysActivityDescription")}
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
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
              <div className="min-w-0 rounded-2xl border border-border/70 bg-card px-3 py-2">
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("driver.dashboard.siteVisitsToday")}</p>
                <p className="break-words text-xl font-semibold text-foreground" data-testid="text-today-visits">{dailyStats?.visits || 0}</p>
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
