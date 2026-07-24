import { Component, useEffect, useState, type ReactNode } from "react";
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
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { apiRequest } from "@/lib/queryClient";
import { getDriverPayoutStatus, getDriverPayoutStatusLabel } from "@/lib/driverPayoutSettings";
import { useDriverPaymentLifecycle } from "@/hooks/useDriverPaymentLifecycle";
import { DriverLifecycleSummary } from "@/components/driver/DriverLifecycleSummary";
import { DriverMaterialIntentSelector } from "@/components/driver/DriverMaterialIntentSelector";
import { formatDistanceToNow } from "date-fns";
import { resolveDriverAccountReadiness } from "@/lib/pilotOnboarding";

type DriverDashboardStatsRange = "today" | "week" | "month";

interface DriverWalletBalance {
  availableBalance: number;
  pendingBalance: number;
  totalBalance: number;
}

interface DriverAuthUser {
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
  driverIncentiveCents: number;
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

function formatDistanceMiles(distance: number | null | undefined): string {
  if (distance === null || distance === undefined || !Number.isFinite(distance)) {
    return "Distance unavailable";
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
        <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground">
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
  const [statsRange, setStatsRange] = useState<DriverDashboardStatsRange>("today");
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: [`/api/drivers/dashboard?statsRange=${statsRange}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: authUser, isLoading: authUserLoading } = useQuery<DriverAuthUser>({
    queryKey: ['/api/auth/user'],
    refetchInterval: 60000,
  });

  const { data: termsStatus, isLoading: termsStatusLoading } = useQuery<DriverTermsStatus>({
    queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`],
    refetchInterval: 60000,
  });

  const { data: stripeAccountStatus, isLoading: stripeAccountStatusLoading, isError: stripeAccountStatusError } = useQuery<DriverStripeAccountStatus>({
    queryKey: ['/api/drivers/stripe-status'],
    refetchInterval: 60000,
  });

  const { data: debitCardStatus, isLoading: debitCardStatusLoading, isError: debitCardStatusError } = useQuery<DriverDebitCardStatus>({
    queryKey: ['/api/drivers/debit-card-status'],
    refetchInterval: 60000,
  });

  const { data: unreadNotificationsData, isLoading: unreadNotificationsLoading } = useQuery<{
    count: number;
    notifications: UnreadNotification[];
  }>({
    queryKey: ['/api/notifications/unread'],
    refetchInterval: 30000,
  });

  const { data: driverLocations, isLoading: driverLocationsLoading } = useQuery<any[]>({
    queryKey: ['/api/drivers/locations'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/drivers/locations");
      return response.json();
    },
    refetchInterval: 300000,
  });

  const driverLifecycle = useDriverPaymentLifecycle();

  const { data: walletBalance, isLoading: walletBalanceLoading, isError: walletBalanceError, refetch: refetchWalletBalance } = useQuery<DriverWalletBalance>({
    queryKey: ['/api/wallet/balance'],
    refetchInterval: 30000,
  });

  const refreshDashboardData = () => {
    void refetch();
    driverLifecycle.refresh();
    void refetchWalletBalance();
  };

  const { data: lotteryEntries, isLoading: lotteryEntriesLoading, error: lotteryEntriesError } = useQuery<any[]>({
    queryKey: ['/api/drivers/lottery-entries'],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/drivers/lottery-entries");
      return response.json();
    },
    enabled: showLotteryEntries,
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
      try {
        const coords = await getCurrentLocation();
        if (cancelled) return;
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationError(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to get location";
        setLocationError(message);
        setCurrentLocation(null);
      }
    };

    loadCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <DriverDashboardSkeleton />;
  }

  // Extract data with proper null checks and type annotation
  const dailyStats = (dashboardData as any)?.dailyStats || null;
  const recentActivities = (dashboardData as any)?.recentActivities || null;
  const lotteryStatus = (dashboardData as any)?.lotteryStatus || null;
  const lotteryEntryCount = lotteryStatus?.driverEntryCount ?? ((dashboardData as any)?.lotteryEntryCount || 0);
  const lotteryActive = lotteryStatus?.enabled ?? ((dashboardData as any)?.lotteryActive ?? true);
  const currentDrawing = lotteryStatus?.currentDrawing || null;
  const currentDrawingLabel = currentDrawing?.monthName
    ? `${currentDrawing.monthName} ${currentDrawing.lotteryYear}`
    : lotteryStatus?.currentDrawingMessage || t("driver.dashboard.monthlyLottery");

  const latestActivity = Array.isArray(recentActivities) && recentActivities.length > 0 ? recentActivities[0] : null;
  const latestLocationName = latestActivity?.washout_locations?.name || latestActivity?.location?.name || t("driver.dashboard.latestStop");
  const latestLocationAddress = latestActivity
    ? (latestActivity.washout_locations?.address
      || latestActivity.location?.address
      || formatAddress(latestActivity.washout_locations || latestActivity.location || {}))
    : "";
  const latestActivityStatus = latestActivity ? (latestActivity.washout_activities?.status || latestActivity.status) : null;
  const driverAccountReadiness = resolveDriverAccountReadiness({
    user: authUser,
    termsAccepted: Boolean(termsStatus?.hasAgreed || authUser?.roleData?.hasAgreedToTerms),
  });
  const profileReady = driverAccountReadiness.profileComplete;
  const termsAccepted = driverAccountReadiness.termsAccepted;
  const stripePresentationStatus = stripeAccountStatusError
    ? "status_unavailable"
    : getDriverPayoutStatus(stripeAccountStatus);
  const stripeReady = stripePresentationStatus === "payout_ready";
  const debitCardState = debitCardStatus?.hasRequested
    ? (debitCardStatus.status || debitCardStatus.cardStatus || "requested")
    : "not requested";
  const accountReady = driverAccountReadiness.ready;
  const stripeStatusUnavailable = stripePresentationStatus === "status_unavailable";
  const unreadNotifications = unreadNotificationsData?.notifications || [];
  const unreadNotificationCount = unreadNotificationsData?.count ?? unreadNotifications.length;
  const topUnreadNotifications = unreadNotifications.slice(0, 3);
  const currentDrawingText = currentDrawingLabel || "Awaiting drawing";

  const rankedDriverLocations: RankedDashboardLocation[] = Array.isArray(driverLocations)
    ? driverLocations
        .map((item: any) => {
          const location = normalizeDashboardLocation(item);
          const latitude = parseLocationCoordinate(location.latitude);
          const longitude = parseLocationCoordinate(location.longitude);
          const driverIncentiveCents = resolveLocationDriverTipRateCents(location.rate);

          const distanceMiles = currentLocation && latitude !== null && longitude !== null
            ? calculateDistance(currentLocation.lat, currentLocation.lng, latitude, longitude)
            : null;

          return {
            ...location,
            distanceMiles,
            driverIncentiveCents,
          } as RankedDashboardLocation;
        })
        .filter((location) => location.isActive !== false && location.isVisible !== false)
    : [];

  const recommendedLocation = rankedDriverLocations
    .filter((location) => location.distanceMiles !== null)
    .sort((a, b) => {
      const distanceDelta = (a.distanceMiles || 0) - (b.distanceMiles || 0);
      if (Math.abs(distanceDelta) <= 0.1) {
        const incentiveDelta = (b.driverIncentiveCents || 0) - (a.driverIncentiveCents || 0);
        if (incentiveDelta !== 0) {
          return incentiveDelta;
        }
      }

      return distanceDelta;
    })[0] || null;

  const highestNearbyIncentiveLocation = rankedDriverLocations
    .filter((location) => location.distanceMiles !== null)
    .sort((a, b) => {
      const incentiveDelta = (b.driverIncentiveCents || 0) - (a.driverIncentiveCents || 0);
      if (incentiveDelta !== 0) {
        return incentiveDelta;
      }

      return (a.distanceMiles || 0) - (b.distanceMiles || 0);
    })[0] || null;

  const hasLocationData = Array.isArray(driverLocations) && driverLocations.length > 0;
  const locationRankingUnavailable = Boolean(locationError) || !currentLocation;

  return (
    <DriverDashboardErrorBoundary>
      <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-20 text-foreground">
        <DriverHeader />

        {/* GPS Status Bar */}
        <DSCard className="w-full max-w-full rounded-none border-x-0 border-t-0 px-3 py-3 sm:px-4" padding="sm" elevated>
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)] animate-pulse" />
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight" data-testid="text-gps-status">{t("driver.dashboard.gpsActive")}</span>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-card px-3 py-1 text-sm font-medium text-emerald-400">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate" data-testid="text-current-location">{t("driver.dashboard.locationEnabled")}</span>
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
              <span className="max-w-full break-words rounded-full border border-emerald-500/30 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-400 sm:tracking-[0.16em]">
                {t("driver.dashboard.gpsReady")}
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
            <DriverMaterialIntentSelector />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant="default"
                className="h-auto min-h-24 w-full max-w-full min-w-0 flex-col items-start justify-start gap-1.5 !whitespace-normal rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 focus-visible:ring-primary/50"
                onClick={() => setLocation('/locations')}
                data-testid="button-find-location-hero"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="break-words text-sm font-semibold tracking-tight">{t("driver.dashboard.findLocation")}</span>
                <span className="break-words text-xs text-primary-foreground/85">{t("driver.dashboard.findLocationHelp")}</span>
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

              {lotteryActive && (
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

        <section className="space-y-2">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
                Operational Intelligence
              </p>
              <h3 className="break-words text-sm font-semibold tracking-tight text-foreground">
                Account, wallet, notifications, and rewards at a glance
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <DriverLifecycleSummary lifecycle={driverLifecycle.lifecycle} isLoading={driverLifecycle.isLoading} paymentError={driverLifecycle.paymentError} onViewActivity={() => setLocation('/activity')} variant="dashboard" />
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
                  <DSStatusChip tone={accountReady ? "success" : "warning"} size="sm">
                    {accountReady ? t("driver.dashboard.readinessReady") : t("driver.dashboard.readinessActionNeeded")}
                  </DSStatusChip>
                </div>

                <div data-testid="driver-operational-readiness">
                {authUserLoading || termsStatusLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-36 bg-muted" />
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {!accountReady ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100" data-testid="driver-account-readiness-next-step">
                        {driverAccountReadiness.nextStep === "complete_profile"
                          ? t("driver.dashboard.completeProfileNext")
                          : t("driver.dashboard.acceptTermsNext")}
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
                  </div>
                )}
                </div>
                <div className="space-y-2 text-sm" data-testid="driver-optional-financial-status">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">Stripe payouts (optional)</span>
                      {stripeAccountStatusLoading ? <Skeleton className="h-5 w-24 bg-muted" /> : (
                        <DSStatusChip tone={stripeStatusUnavailable ? "neutral" : stripeReady ? "success" : "warning"} size="sm">
                          {getDriverPayoutStatusLabel(stripePresentationStatus)}
                        </DSStatusChip>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">Debit card</span>
                      {debitCardStatusLoading ? <Skeleton className="h-5 w-24 bg-muted" /> : (
                        <DSStatusChip tone={debitCardStatusError ? "neutral" : debitCardState === "active" ? "success" : "neutral"} size="sm">
                          {debitCardStatusError ? t("driver.dashboard.optionalFinancialStatusUnavailable") : debitCardState}
                        </DSStatusChip>
                      )}
                    </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/profile')}
                  >
                    Profile
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/wallet')}
                  >
                    Wallet
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
                      Unread Notifications
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      Stay on top of updates
                    </h3>
                  </div>
                  <DSStatusChip tone={unreadNotificationCount > 0 ? "warning" : "neutral"} size="sm">
                    {unreadNotificationsLoading ? "…" : unreadNotificationCount}
                  </DSStatusChip>
                </div>

                {unreadNotificationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
                    <Skeleton className="h-16 rounded-2xl bg-muted" />
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
                    <p className="text-sm font-medium text-foreground">All caught up</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No unread messages right now.
                    </p>
                  </div>
                )}

                <div className="mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/notifications')}
                  >
                    Notifications
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
                      Wallet Preview
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      Available funds
                    </h3>
                  </div>
                  <Wallet className="h-5 w-5 shrink-0 text-primary" />
                </div>

                {walletBalanceLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-32 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Wallet Balance
                      </p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground" data-testid="text-dashboard-available-balance">
                        {formatCurrency(walletBalance?.availableBalance || 0)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">Wallet balance is shown separately from activity review and payment status.</p>
                  </>
                )}

                <div className="mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/wallet')}
                  >
                    View Wallet
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
                      Rewards Summary
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      Monthly ticket progress
                    </h3>
                  </div>
                  <DSStatusChip tone={lotteryActive ? "success" : "warning"} size="sm">
                    {lotteryActive ? "Active" : "Paused"}
                  </DSStatusChip>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Current Month Entries
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      {lotteryEntryCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Current Drawing
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {currentDrawingText}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                    onClick={() => setLocation('/driver/rewards')}
                  >
                    View Rewards
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
                Location Intelligence
              </p>
              <h3 className="break-words text-sm font-semibold tracking-tight text-foreground">
                Nearby locations and incentive focus
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <DSCard padding="md" elevated className="min-h-[240px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Recommended Location
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      Nearest suitable stop
                    </h3>
                  </div>
                  <MapPin className="h-5 w-5 shrink-0 text-primary" />
                </div>

                {driverLocationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-36 bg-muted" />
                    <Skeleton className="h-8 w-52 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </div>
                ) : locationRankingUnavailable ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Location access needed</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Turn on location access to rank nearby stops from your current position.
                    </p>
                  </div>
                ) : !hasLocationData ? (
                  <DashboardEmptyState
                    title="No driver locations"
                    description="No active locations are available right now."
                    icon={MapPin}
                    toneClassName="bg-card text-foreground"
                  />
                ) : recommendedLocation ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-semibold text-foreground">
                            {recommendedLocation.name || "Nearby location"}
                          </p>
                          {formatDashboardLocationAddress(recommendedLocation) && (
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {formatDashboardLocationAddress(recommendedLocation)}
                            </p>
                          )}
                        </div>
                        <DSStatusChip tone="success" size="sm">Recommended</DSStatusChip>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>{formatDistanceMiles(recommendedLocation.distanceMiles)}</span>
                        <span>•</span>
                        <span>
                          {recommendedLocation.driverIncentiveCents > 0
                            ? formatCurrency(recommendedLocation.driverIncentiveCents / 100)
                            : "Incentive unavailable"}
                        </span>
                      </div>
                      {recommendedLocation.operatingHours && (
                        <p className="text-sm text-muted-foreground">
                          Hours: {recommendedLocation.operatingHours}
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
                        View Locations
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <DashboardEmptyState
                    title="No ranked location"
                    description="No nearby stop could be ranked from the current location data."
                    icon={MapPin}
                    toneClassName="bg-card text-foreground"
                  />
                )}
              </div>
            </DSCard>

            <DSCard padding="md" elevated className="min-h-[240px] border-border/70">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Highest Nearby Driver Incentive
                    </p>
                    <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">
                      Best nearby payout focus
                    </h3>
                  </div>
                  <Ticket className="h-5 w-5 shrink-0 text-primary" />
                </div>

                {driverLocationsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-36 bg-muted" />
                    <Skeleton className="h-8 w-52 bg-muted" />
                    <Skeleton className="h-4 w-40 bg-muted" />
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </div>
                ) : locationRankingUnavailable ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Location access needed</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Allow location access to rank the highest nearby driver incentive.
                    </p>
                  </div>
                ) : !hasLocationData ? (
                  <DashboardEmptyState
                    title="No driver locations"
                    description="No active locations are available right now."
                    icon={Ticket}
                    toneClassName="bg-card text-foreground"
                  />
                ) : highestNearbyIncentiveLocation ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-semibold text-foreground">
                            {highestNearbyIncentiveLocation.name || "Nearby location"}
                          </p>
                          {formatDashboardLocationAddress(highestNearbyIncentiveLocation) && (
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {formatDashboardLocationAddress(highestNearbyIncentiveLocation)}
                            </p>
                          )}
                        </div>
                        <DSStatusChip tone="accent" size="sm">Highest incentive</DSStatusChip>
                      </div>
                      <p className="text-2xl font-semibold tracking-tight text-foreground">
                        {highestNearbyIncentiveLocation.driverIncentiveCents > 0
                          ? formatCurrency(highestNearbyIncentiveLocation.driverIncentiveCents / 100)
                          : "Incentive unavailable"}
                      </p>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>{formatDistanceMiles(highestNearbyIncentiveLocation.distanceMiles)}</span>
                        {highestNearbyIncentiveLocation.operatingHours && (
                          <>
                            <span>•</span>
                            <span>Hours: {highestNearbyIncentiveLocation.operatingHours}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto min-h-9 border-border/70 bg-card px-3 text-foreground hover:bg-muted/50"
                        onClick={() => setLocation('/locations')}
                      >
                        View Locations
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <DashboardEmptyState
                    title="No ranked location"
                    description="No nearby incentive could be ranked from the current location data."
                    icon={Ticket}
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
              label="Site Visits Today"
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
            title="Today's Activity"
            description="Today's operational activity at a glance."
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
                <p className="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Site Visits Today</p>
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
