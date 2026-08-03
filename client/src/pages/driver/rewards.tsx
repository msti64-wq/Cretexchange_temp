import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bell,
  Clock3,
  Home,
  Ticket,
  Trophy,
  User,
  Wallet,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { localeForLanguage, useLanguage, type AppLanguage } from "@/lib/i18n";
import { localizeDriverNotification } from "@/lib/driverNotificationLocalization";

type LotteryEntry = {
  id: string;
  ticketNumber: string | null;
  entriesEarned: number | null;
  lotteryMonth: number | null;
  lotteryYear: number | null;
  isArchived: boolean | null;
  createdAt: string | Date | null;
  ownerCompany: string | null;
  locationName: string | null;
  locationStreet: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  locationAddress: string | null;
  activityDate: string | Date | null;
};

type RewardNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead?: boolean;
  createdAt: string | Date;
  data?: Record<string, unknown>;
};

type LotteryDrawing = {
  monthName?: string;
  lotteryMonth?: number;
  lotteryYear?: number;
  firstPrize?: string | null;
  secondPrize?: string | null;
  thirdPrize?: string | null;
};

type DriverLotteryHistoryItem = {
  drawingId: string;
  lotteryMonth: number;
  lotteryYear: number;
  drawingDate: string | Date | null;
  status: string;
  won: boolean;
  placeIndex: number | null;
  ticketNumber: string | null;
  prizeTitle: string | null;
  prizeDescription: string | null;
  notificationStatus: string | null;
  notificationSentAt: string | Date | null;
  createdAt: string | Date | null;
};

type DriverLotteryFulfillmentItem = {
  drawingMonth: number;
  drawingYear: number;
  prizeTitle: string | null;
  prizeDescription: string | null;
  fulfillmentStatus: string;
  trackingStatus: string;
  fulfilledAt: string | Date | null;
  canceledAt: string | Date | null;
  issueReportedAt: string | Date | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

const rewardNotificationTypes = new Set([
  "lottery_winner",
  "lottery_announcement",
  "lottery_drawing_complete",
  "lottery_entry",
]);

const quickLinks = [
  { labelKey: "rewards.quick.dashboard", path: "/", icon: Home },
  { labelKey: "rewards.quick.wallet", path: "/wallet", icon: Wallet },
  { labelKey: "rewards.quick.messages", path: "/messages", icon: Bell },
  { labelKey: "rewards.quick.profile", path: "/profile", icon: User },
];

function formatDate(value: string | Date | null | undefined, language: AppLanguage, pattern = "MMM d, yyyy") {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    year: "numeric",
    month: pattern === "PPP" ? "long" : "short",
    day: "numeric",
  }).format(date);
}

function formatRelative(value: string | Date | null | undefined, language: AppLanguage) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true, locale: language === "es" ? es : undefined });
}

function formatMonthYear(month: number | null | undefined, year: number | null | undefined, language: AppLanguage) {
  if (!month || !year) return "—";
  return new Date(year, month - 1, 1).toLocaleDateString(localeForLanguage(language), {
    month: "long",
    year: "numeric",
  });
}

function formatNamedMonthYear(monthName: string, year: number | null | undefined, language: AppLanguage) {
  if (!year) return monthName;
  const date = new Date(`${monthName} 1, ${year}`);
  return Number.isNaN(date.getTime())
    ? `${monthName} ${year}`
    : date.toLocaleDateString(localeForLanguage(language), { month: "long", year: "numeric" });
}

function getFulfillmentTone(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "delivered":
    case "fulfilled":
      return "success";
    case "shipped":
    case "ordered":
    case "picked_up":
    case "in_progress":
      return "info";
    case "canceled":
    case "issue":
      return "warning";
    default:
      return "neutral";
  }
}

function getRewardNotificationIcon(type: string) {
  switch (type) {
    case "lottery_winner":
      return <Trophy className="h-4 w-4 text-amber-400" />;
    case "lottery_announcement":
    case "lottery_drawing_complete":
      return <Ticket className="h-4 w-4 text-sky-400" />;
    case "lottery_entry":
      return <Ticket className="h-4 w-4 text-foreground/70" />;
    default:
      return <Bell className="h-4 w-4 text-foreground/70" />;
  }
}

function isRewardNotification(notification: RewardNotification) {
  return rewardNotificationTypes.has(notification.type);
}

function rewardStatus(status: string | null | undefined, t: (key: string) => string) {
  const normalized = String(status || "").toLowerCase();
  const key = `rewards.status.${normalized}`;
  const translated = t(key);
  return translated === key ? t("rewards.unknown") : translated;
}

export default function DriverRewards() {
  const [, setLocation] = useLocation();
  const { language, t } = useLanguage();
  const [selectedEntry, setSelectedEntry] = useState<LotteryEntry | null>(null);

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

  const { data: dashboardData, isLoading: dashboardLoading, isError: dashboardError, refetch: refetchDashboard } = useQuery<any>({
    queryKey: ["/api/drivers/dashboard"],
    refetchInterval: 30000,
  });

  const { data: lotteryStatusData, isLoading: lotteryStatusLoading, isError: lotteryStatusError, refetch: refetchLotteryStatus } = useQuery<any>({
    queryKey: ["/api/lottery/status"],
    refetchInterval: 30000,
  });

  const { data: lotteryEntriesData, isLoading: lotteryEntriesLoading, isError: lotteryEntriesError, refetch: refetchLotteryEntries } = useQuery<LotteryEntry[]>({
    queryKey: ["/api/drivers/lottery-entries"],
    refetchInterval: 60000,
  });

  const { data: notificationsData, isLoading: notificationsLoading, isError: notificationsError, refetch: refetchNotifications } = useQuery<RewardNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const { data: lotteryHistoryData, isLoading: lotteryHistoryLoading, isError: lotteryHistoryError, refetch: refetchLotteryHistory } = useQuery<DriverLotteryHistoryItem[]>({
    queryKey: ["/api/drivers/lottery-history"],
    refetchInterval: 60000,
  });

  const { data: lotteryFulfillmentData, isLoading: lotteryFulfillmentLoading, isError: lotteryFulfillmentError, refetch: refetchLotteryFulfillment } = useQuery<DriverLotteryFulfillmentItem[]>({
    queryKey: ["/api/drivers/lottery-fulfillment-history"],
    refetchInterval: 60000,
  });

  const currentEntries = Number(
    lotteryStatusData?.driverEntryCount ??
      dashboardData?.lotteryStatus?.driverEntryCount ??
      dashboardData?.lotteryEntryCount ??
      0,
  );

  const lifetimeEntries = useMemo(
    () =>
      (Array.isArray(lotteryEntriesData) ? lotteryEntriesData : []).reduce(
        (sum, entry) => sum + Number(entry.entriesEarned || 0),
        0,
      ),
    [lotteryEntriesData],
  );

  const currentDrawing: LotteryDrawing | null =
    (lotteryStatusData?.currentDrawing as LotteryDrawing | null) ||
    (dashboardData?.lotteryStatus?.currentDrawing as LotteryDrawing | null) ||
    null;

  const currentPrize = currentDrawing?.firstPrize || currentDrawing?.secondPrize || currentDrawing?.thirdPrize || null;

  const nextDrawingValue =
    currentDrawing?.monthName
      ? formatNamedMonthYear(currentDrawing.monthName, currentDrawing.lotteryYear, language)
      : currentDrawing?.lotteryMonth && currentDrawing?.lotteryYear
        ? formatMonthYear(currentDrawing.lotteryMonth, currentDrawing.lotteryYear, language)
        : null;

  const eligible = Boolean(lotteryStatusData?.enabled ?? dashboardData?.lotteryActive ?? true);

  const rewardNotifications = useMemo(
    () =>
      (Array.isArray(notificationsData) ? notificationsData : [])
        .filter(isRewardNotification)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [notificationsData],
  );

  const rewardUnreadCount = useMemo(() => {
    return rewardNotifications.filter((notification) => !notification.isRead).length;
  }, [rewardNotifications]);

  const rewardUpdateCount = rewardNotifications.length;
  const ticketEntries = Array.isArray(lotteryEntriesData) ? lotteryEntriesData : [];
  const lotteryHistoryEntries = Array.isArray(lotteryHistoryData) ? lotteryHistoryData : [];
  const lotteryFulfillmentEntries = Array.isArray(lotteryFulfillmentData) ? lotteryFulfillmentData : [];
  const rewardSummaryLoading = dashboardLoading || lotteryStatusLoading;
  const rewardNotificationsLoading = notificationsLoading;
  const drawingLabel =
    currentDrawing?.monthName
      ? formatNamedMonthYear(currentDrawing.monthName, currentDrawing.lotteryYear, language)
      : currentDrawing?.lotteryMonth && currentDrawing?.lotteryYear
        ? formatMonthYear(currentDrawing.lotteryMonth, currentDrawing.lotteryYear, language)
        : null;
  const drawingPrizes = [currentDrawing?.firstPrize, currentDrawing?.secondPrize, currentDrawing?.thirdPrize].filter(
    Boolean,
  );
  const rewardsError = dashboardError || lotteryStatusError || lotteryEntriesError || notificationsError || lotteryHistoryError || lotteryFulfillmentError;
  const retryRewards = () => {
    void refetchDashboard();
    void refetchLotteryStatus();
    void refetchLotteryEntries();
    void refetchNotifications();
    void refetchLotteryHistory();
    void refetchLotteryFulfillment();
  };

  return (
    <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-24 text-foreground">
      <DriverHeader />

      <main aria-label={t("rewards.center")} className="mx-auto w-full max-w-6xl space-y-5 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        {rewardsError ? (
          <DSCard padding="md" role="alert">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-destructive">{t("rewards.error")}</p>
              <Button variant="outline" onClick={retryRewards}>{t("rewards.retry")}</Button>
            </div>
          </DSCard>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <DSCard className="overflow-hidden" padding="lg" elevated>
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <DSStatusChip tone="accent">{t("rewards.driverRewards")}</DSStatusChip>
                <DSStatusChip tone="info">{t("rewards.fieldWorkspace")}</DSStatusChip>
                <DSStatusChip tone={eligible ? "success" : "warning"}>
                  {eligible ? t("rewards.eligible") : t("rewards.paused")}
                </DSStatusChip>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("rewards.center")}
                </p>
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("rewards.title")}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {t("rewards.intro")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("rewards.currentEntries")}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-8 w-20 animate-pulse rounded bg-muted/70" />
                    ) : (
                      currentEntries.toLocaleString(localeForLanguage(language))
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t("rewards.currentEntriesDetail")}</div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("rewards.lifetimeEntries")}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-8 w-20 animate-pulse rounded bg-muted/70" />
                    ) : (
                      lifetimeEntries.toLocaleString(localeForLanguage(language))
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t("rewards.lifetimeEntriesDetail")}</div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("rewards.currentDrawing")}
                  </div>
                  <div className="mt-2 text-base font-semibold leading-6">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-6 w-28 animate-pulse rounded bg-muted/70" />
                    ) : (
                      drawingLabel || t("rewards.awaitingDrawing")
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rewardSummaryLoading
                      ? t("rewards.loadingDrawing")
                      : language === "en" && lotteryStatusData?.currentDrawingMessage ? lotteryStatusData.currentDrawingMessage : t("rewards.noDrawingDetails")}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("rewards.notifications")}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardNotificationsLoading ? (
                      <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted/70" />
                    ) : (
                      rewardUnreadCount.toLocaleString(localeForLanguage(language))
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rewardNotificationsLoading
                      ? t("rewards.loadingNotifications")
                      : t(rewardUpdateCount === 1 ? "rewards.recentMessage" : "rewards.recentMessages", { count: rewardUpdateCount })}
                  </div>
                </div>
              </div>
            </div>
          </DSCard>

          <DSCard padding="md">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("rewards.navigation")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("rewards.navigationHelp")}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {quickLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.path}
                      type="button"
                      variant="outline"
                      className="h-11 justify-between border-border bg-background px-4 text-foreground hover:bg-muted/40"
                      onClick={() => setLocation(item.path)}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {t(item.labelKey)}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">{t("rewards.belongs")}</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>{t("rewards.belongsTickets")}</li>
                  <li>{t("rewards.belongsDrawings")}</li>
                  <li>{t("rewards.belongsFulfillment")}</li>
                </ul>
              </div>
            </div>
          </DSCard>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.current")}
            title={t("rewards.currentDrawingTitle")}
            description={t("rewards.currentDescription")}
          />

          <DSCard padding="lg">
            {rewardSummaryLoading ? (
              <div className="space-y-4">
                <div className="h-4 w-40 animate-pulse rounded bg-muted/70" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-border bg-background/70 p-3">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
                      <div className="mt-3 h-6 w-28 animate-pulse rounded bg-muted/70" />
                    </div>
                  ))}
                </div>
              </div>
            ) : currentDrawing ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("rewards.drawingPeriod")}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {drawingLabel || t("rewards.currentDrawingTitle")}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {language === "en" && lotteryStatusData?.currentDrawingMessage
                        ? lotteryStatusData.currentDrawingMessage
                        : t("rewards.drawingFeedDetail")}
                    </p>
                  </div>
                  <DSStatusChip tone={eligible ? "success" : "warning"}>
                    {eligible ? t("rewards.eligible") : t("rewards.paused")}
                  </DSStatusChip>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.currentEntries")}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{currentEntries.toLocaleString(localeForLanguage(language))}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.topPrize")}</p>
                    <p className="mt-2 text-base font-semibold leading-6">{currentPrize || t("rewards.tbd")}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.rewardStatus")}</p>
                    <p className="mt-2 text-base font-semibold leading-6">
                      {eligible ? t("rewards.programActive") : t("rewards.programPaused")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.prizeTiers")}</p>
                    <p className="mt-2 text-base font-semibold leading-6">
                      {drawingPrizes.length > 0
                        ? t(drawingPrizes.length === 1 ? "rewards.prizePublished" : "rewards.prizesPublished", { count: drawingPrizes.length })
                        : t("rewards.noPrizes")}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.when")}</p>
                  <p className="mt-1 text-sm font-medium">{nextDrawingValue || t("rewards.awaitingDrawing")}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-sm font-medium">{t("rewards.noDrawingTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("rewards.noDrawingBody")}
                </p>
              </div>
            )}
          </DSCard>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.summaryEyebrow")}
            title={t("rewards.summary")}
            description={t("rewards.summaryDescription")}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <DSKpiCard
              label={t("rewards.currentEntries")}
              value={currentEntries.toLocaleString(localeForLanguage(language))}
              detail={t("rewards.ticketsMonth")}
              accentTone="accent"
            />
            <DSKpiCard
              label={t("rewards.lifetimeEntries")}
              value={lifetimeEntries.toLocaleString(localeForLanguage(language))}
              detail={t("rewards.allTickets")}
              accentTone="info"
            />
            <DSKpiCard
              label={t("rewards.currentDrawing")}
              value={drawingLabel || t("rewards.pending")}
              detail={currentPrize || t("rewards.topPrizePending")}
              accentTone="accent"
            />
            <DSKpiCard
              label={t("rewards.notifications")}
              value={rewardUnreadCount.toLocaleString(localeForLanguage(language))}
              detail={t(rewardUpdateCount === 1 ? "rewards.recentMessage" : "rewards.recentMessages", { count: rewardUpdateCount })}
              accentTone="warning"
            />
            <DSKpiCard
              label={t("rewards.eligible")}
              value={eligible ? t("rewards.yes") : t("rewards.no")}
              detail={eligible ? t("rewards.programActive") : t("rewards.programPaused")}
              accentTone={eligible ? "success" : "warning"}
            />
          </div>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.attention")}
            title={t("rewards.notificationTitle")}
            description={t("rewards.notificationDescription")}
            actions={
              <Button
                type="button"
                variant="outline"
                className="border-border bg-background text-foreground hover:bg-muted/40"
                onClick={() => setLocation("/messages")}
              >
                <Bell className="mr-2 h-4 w-4" />
                {t("rewards.viewMessages")}
              </Button>
            }
          />

          {rewardNotificationsLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <DSCard key={index} padding="md">
                  <div className="space-y-3">
                    <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted/70" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
                  </div>
                </DSCard>
              ))}
            </div>
          ) : rewardNotifications.length > 0 ? (
            <div className="grid gap-3">
              {rewardNotifications.map((notification) => {
                const localized = localizeDriverNotification(notification, language, t);
                return (
                <DSCard key={notification.id} padding="md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <DSStatusChip tone={notification.type === "lottery_winner" ? "success" : "info"} size="sm">
                          {notification.type === "lottery_winner" ? t("rewards.winner") : t("rewards.update")}
                        </DSStatusChip>
                        {!notification.isRead ? (
                          <DSStatusChip tone="warning" size="sm">
                            {t("rewards.unread")}
                          </DSStatusChip>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-base font-semibold">{localized.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {localized.message}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{formatRelative(notification.createdAt, language)}</span>
                    </div>
                  </div>
                </DSCard>
                );
              })}
            </div>
          ) : (
            <DSCard padding="lg">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("rewards.noUpdates")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("rewards.noUpdatesBody")}
                  </p>
                </div>
                <DSStatusChip tone="neutral">{t("rewards.waitingUpdates")}</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.history")}
            title={t("rewards.drawingHistory")}
            description={t("rewards.historyDescription")}
          />

          {lotteryHistoryLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <DSCard key={index} padding="lg" className="animate-pulse">
                  <div className="space-y-4">
                    <div className="h-4 w-32 rounded-full bg-muted/70" />
                    <div className="h-6 w-44 rounded-full bg-muted/70" />
                    <div className="h-20 rounded-2xl bg-muted/70" />
                  </div>
                </DSCard>
              ))}
            </div>
          ) : lotteryHistoryEntries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lotteryHistoryEntries.map((item) => {
                const drawingLabelText = formatMonthYear(item.lotteryMonth, item.lotteryYear, language);
                const notificationLabel =
                  item.notificationStatus === "sent"
                    ? t("rewards.notificationSent")
                    : item.notificationStatus === "none"
                      ? t("rewards.noNotification")
                      : item.notificationStatus || t("rewards.unknown");

                return (
                  <DSCard key={item.drawingId} padding="md" elevated className="flex min-h-[240px] flex-col">
                    <div className="flex h-full flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {t("rewards.drawing")}
                          </p>
                          <h3 className="mt-1 text-lg font-semibold tracking-tight">{drawingLabelText}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <DSStatusChip tone="neutral" size="sm">
                            {rewardStatus(item.status, t)}
                          </DSStatusChip>
                          <DSStatusChip tone={item.won ? "success" : "neutral"} size="sm">
                            {item.won ? t("rewards.won") : t("rewards.noWin")}
                          </DSStatusChip>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("rewards.drawingDate")}
                          </p>
                          <p className="mt-1 font-medium">{formatDate(item.drawingDate, language)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("rewards.notification")}
                          </p>
                          <p className="mt-1 font-medium">{notificationLabel}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/70 p-3">
                        {item.won ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{t("rewards.winningTicket")}</p>
                              <DSStatusChip tone="success" size="sm">
                                {t("rewards.place", { place: item.placeIndex || "—" })}
                              </DSStatusChip>
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{item.ticketNumber || "—"}</p>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {t("rewards.prize")}
                              </p>
                              <p className="mt-1 text-sm font-medium">{item.prizeTitle || "—"}</p>
                              {item.prizeDescription ? (
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                  {item.prizeDescription}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold">{t("rewards.noWinRecorded")}</p>
                            <p className="text-sm text-muted-foreground">
                              {t("rewards.noWinBody")}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto rounded-2xl border border-border bg-background/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.created")}
                        </p>
                        <p className="mt-1 text-sm font-medium">{formatDate(item.createdAt, language)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.notificationSentAt ? t("rewards.sentRelative", { time: formatRelative(item.notificationSentAt, language) }) : t("rewards.noSentTime")}
                        </p>
                      </div>
                    </div>
                  </DSCard>
                );
              })}
            </div>
          ) : (
            <DSCard padding="lg">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("rewards.noCompleted")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("rewards.noCompletedBody")}
                  </p>
                </div>
                <DSStatusChip tone="neutral">{t("rewards.waitingHistory")}</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.ledger")}
            title={t("rewards.ticketLedger")}
            description={t("rewards.ledgerDescription")}
          />

          {lotteryEntriesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <DSCard key={index} padding="lg" className="animate-pulse">
                  <div className="space-y-4">
                    <div className="h-4 w-28 rounded-full bg-muted/70" />
                    <div className="h-6 w-40 rounded-full bg-muted/70" />
                    <div className="h-16 rounded-2xl bg-muted/70" />
                  </div>
                </DSCard>
              ))}
            </div>
          ) : ticketEntries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ticketEntries.map((entry) => (
                <DSCard key={entry.id} padding="md" elevated className="flex min-h-[220px] flex-col">
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {t("rewards.ticketNumber")}
                        </p>
                        <h3 className="mt-1 truncate text-lg font-semibold tracking-tight">
                          {entry.ticketNumber || "—"}
                        </h3>
                      </div>
                      <DSStatusChip tone={entry.isArchived ? "neutral" : "success"} size="sm">
                        {entry.isArchived ? t("rewards.archived") : t("rewards.active")}
                      </DSStatusChip>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.dateEarned")}
                        </p>
                        <p className="mt-1 font-medium">{formatDate(entry.createdAt, language)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.entriesEarned")}
                        </p>
                        <p className="mt-1 font-medium">
                          {Number(entry.entriesEarned || 0).toLocaleString(localeForLanguage(language))}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <p className="truncate text-sm font-semibold">{entry.locationName || t("rewards.unknownLocation")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[entry.locationCity, entry.locationState].filter(Boolean).join(", ") || t("rewards.locationUnavailable")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.ownerCompany || t("rewards.ownerUnavailable")}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {t("rewards.earnedRelative", { time: formatRelative(entry.activityDate || entry.createdAt, language) })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-border bg-background px-3 text-sm text-foreground hover:bg-muted/40"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        {t("rewards.viewDetails")}
                      </Button>
                    </div>
                  </div>
                </DSCard>
              ))}
            </div>
          ) : (
            <DSCard padding="lg">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("rewards.noTickets")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("rewards.noTicketsBody")}
                  </p>
                </div>
                <DSStatusChip tone="neutral">{t("rewards.awaitingEntries")}</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={t("rewards.fulfillment")}
            title={t("rewards.fulfillmentTitle")}
            description={t("rewards.fulfillmentDescription")}
          />

          {lotteryFulfillmentLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <DSCard key={index} padding="lg" className="animate-pulse">
                  <div className="space-y-4">
                    <div className="h-4 w-32 rounded-full bg-muted/70" />
                    <div className="h-6 w-44 rounded-full bg-muted/70" />
                    <div className="h-20 rounded-2xl bg-muted/70" />
                  </div>
                </DSCard>
              ))}
            </div>
          ) : lotteryFulfillmentEntries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lotteryFulfillmentEntries.map((item) => (
                <DSCard key={`${item.drawingMonth}-${item.drawingYear}-${item.prizeTitle || "fulfillment"}-${item.createdAt || item.updatedAt}`} padding="md" elevated className="flex min-h-[260px] flex-col">
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {t("rewards.fulfillment")}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight">
                          {formatMonthYear(item.drawingMonth, item.drawingYear, language)}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <DSStatusChip tone={getFulfillmentTone(item.fulfillmentStatus)} size="sm">
                          {rewardStatus(item.fulfillmentStatus, t)}
                        </DSStatusChip>
                        <DSStatusChip tone={item.trackingStatus === "fulfilled" ? "success" : item.trackingStatus === "issue" ? "warning" : item.trackingStatus === "in_progress" ? "info" : "neutral"} size="sm">
                          {rewardStatus(item.trackingStatus, t)}
                        </DSStatusChip>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.prize")}</p>
                      <p className="mt-1 text-sm font-medium">{item.prizeTitle || "—"}</p>
                      {item.prizeDescription ? (
                        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                          {item.prizeDescription}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.fulfilled")}
                        </p>
                        <p className="mt-1 font-medium">{formatDate(item.fulfilledAt, language)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.canceled")}
                        </p>
                        <p className="mt-1 font-medium">{formatDate(item.canceledAt, language)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.issueReported")}
                        </p>
                        <p className="mt-1 font-medium">{formatDate(item.issueReportedAt, language)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("rewards.updated")}
                        </p>
                        <p className="mt-1 font-medium">{formatRelative(item.updatedAt, language)}</p>
                      </div>
                    </div>

                    <div className="mt-auto rounded-2xl border border-border bg-background/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("rewards.created")}
                      </p>
                      <p className="mt-1 text-sm font-medium">{formatDate(item.createdAt, language)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("rewards.coarseTracking")}
                      </p>
                    </div>
                  </div>
                </DSCard>
              ))}
            </div>
          ) : (
            <DSCard padding="lg">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("rewards.noFulfillment")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("rewards.noFulfillmentBody")}
                  </p>
                </div>
                <DSStatusChip tone="neutral">{t("rewards.waitingFulfillment")}</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>
      </main>

      <MobileNav role="driver" />

      <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border bg-card text-foreground sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("rewards.ticketDetails")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedEntry ? t("rewards.ticketDescription", { ticket: selectedEntry.ticketNumber || "—" }) : t("rewards.ticketDetails")}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <DSStatusChip tone={selectedEntry.isArchived ? "neutral" : "success"} size="sm">
                  {selectedEntry.isArchived ? t("rewards.archived") : t("rewards.active")}
                </DSStatusChip>
                <DSStatusChip tone="info" size="sm">
                  {t("rewards.drawingValue", { month: selectedEntry.lotteryMonth || "—", year: selectedEntry.lotteryYear || "—" })}
                </DSStatusChip>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.ticketNumber")}</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.ticketNumber || "—"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.dateEarned")}</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedEntry.createdAt, language, "PPP")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.entriesEarned")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {Number(selectedEntry.entriesEarned || 0).toLocaleString(localeForLanguage(language))}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.activityDate")}</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedEntry.activityDate, language, "PPP")}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/70 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.locationName")}</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.locationName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.fullAddress")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedEntry.locationAddress ||
                      [selectedEntry.locationStreet, selectedEntry.locationCity, selectedEntry.locationState, selectedEntry.locationZip]
                        .filter(Boolean)
                        .join(", ") ||
                      "—"}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.drawingMonth")}</p>
                    <p className="mt-1 text-sm font-medium">{selectedEntry.lotteryMonth || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.drawingYear")}</p>
                    <p className="mt-1 text-sm font-medium">{selectedEntry.lotteryYear || "—"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("rewards.activeArchived")}</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.isArchived ? t("rewards.archived") : t("rewards.active")}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
