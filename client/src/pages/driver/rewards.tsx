import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bell,
  Clock3,
  History,
  Home,
  Ticket,
  Trophy,
  User,
  Wallet,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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

const rewardNotificationTypes = new Set([
  "lottery_winner",
  "lottery_announcement",
  "lottery_drawing_complete",
  "lottery_entry",
]);

const quickLinks = [
  { label: "Dashboard", path: "/", icon: Home },
  { label: "Wallet", path: "/wallet", icon: Wallet },
  { label: "Notifications", path: "/notifications", icon: Bell },
  { label: "Profile", path: "/profile", icon: User },
];

const futureSections = [
  {
    title: "Prize Fulfillment Status",
    description:
      "Delivery progress, fulfillment status, and follow-up notes require a future driver-safe read path.",
    icon: History,
  },
];

function formatDate(value: string | Date | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern);
}

function formatRelative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatMonthYear(month: number | null | undefined, year: number | null | undefined) {
  if (!month || !year) return "—";
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
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

export default function DriverRewards() {
  const [, setLocation] = useLocation();
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

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<any>({
    queryKey: ["/api/drivers/dashboard"],
    refetchInterval: 30000,
  });

  const { data: lotteryStatusData, isLoading: lotteryStatusLoading } = useQuery<any>({
    queryKey: ["/api/lottery/status"],
    refetchInterval: 30000,
  });

  const { data: lotteryEntriesData, isLoading: lotteryEntriesLoading } = useQuery<LotteryEntry[]>({
    queryKey: ["/api/drivers/lottery-entries"],
    refetchInterval: 60000,
  });

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery<RewardNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const { data: unreadData, isLoading: unreadLoading } = useQuery<any>({
    queryKey: ["/api/notifications/unread"],
    refetchInterval: 30000,
  });

  const { data: lotteryHistoryData, isLoading: lotteryHistoryLoading } = useQuery<DriverLotteryHistoryItem[]>({
    queryKey: ["/api/drivers/lottery-history"],
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
      ? `${currentDrawing.monthName} ${currentDrawing.lotteryYear}`
      : currentDrawing?.lotteryMonth && currentDrawing?.lotteryYear
        ? formatMonthYear(currentDrawing.lotteryMonth, currentDrawing.lotteryYear)
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
    const unreadNotifications = Array.isArray(unreadData?.notifications) ? unreadData.notifications : [];
    return unreadNotifications.filter(isRewardNotification).length;
  }, [unreadData]);

  const rewardUpdateCount = rewardNotifications.length;
  const ticketEntries = Array.isArray(lotteryEntriesData) ? lotteryEntriesData : [];
  const lotteryHistoryEntries = Array.isArray(lotteryHistoryData) ? lotteryHistoryData : [];
  const rewardSummaryLoading = dashboardLoading || lotteryStatusLoading;
  const rewardNotificationsLoading = notificationsLoading || unreadLoading;
  const drawingLabel =
    currentDrawing?.monthName
      ? `${currentDrawing.monthName} ${currentDrawing.lotteryYear}`
      : currentDrawing?.lotteryMonth && currentDrawing?.lotteryYear
        ? formatMonthYear(currentDrawing.lotteryMonth, currentDrawing.lotteryYear)
        : null;
  const drawingPrizes = [currentDrawing?.firstPrize, currentDrawing?.secondPrize, currentDrawing?.thirdPrize].filter(
    Boolean,
  );

  return (
    <div className="dark min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background pb-24 text-foreground">
      <DriverHeader />

      <main className="mx-auto w-full max-w-6xl space-y-5 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <DSCard className="overflow-hidden" padding="lg" elevated>
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <DSStatusChip tone="accent">Driver Rewards</DSStatusChip>
                <DSStatusChip tone="info">Field Workspace</DSStatusChip>
                <DSStatusChip tone={eligible ? "success" : "warning"}>
                  {eligible ? "Eligible" : "Paused"}
                </DSStatusChip>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Rewards Center
                </p>
                <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                  Track tickets, updates, and prize status
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  This workspace shows the reward trail behind completed work, the current drawing state,
                  and any prize updates already stored in the platform.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Entries
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-8 w-20 animate-pulse rounded bg-muted/70" />
                    ) : (
                      currentEntries.toLocaleString()
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">This month’s driver ticket count</div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lifetime Entries
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-8 w-20 animate-pulse rounded bg-muted/70" />
                    ) : (
                      lifetimeEntries.toLocaleString()
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">All earned tickets on this account</div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Drawing
                  </div>
                  <div className="mt-2 text-base font-semibold leading-6">
                    {rewardSummaryLoading ? (
                      <span className="inline-block h-6 w-28 animate-pulse rounded bg-muted/70" />
                    ) : (
                      drawingLabel || "Awaiting drawing"
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rewardSummaryLoading
                      ? "Loading current drawing state..."
                      : lotteryStatusData?.currentDrawingMessage || "No current drawing details available."}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reward Notifications
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">
                    {rewardNotificationsLoading ? (
                      <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted/70" />
                    ) : (
                      rewardUnreadCount.toLocaleString()
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {rewardNotificationsLoading
                      ? "Loading reward notifications..."
                      : `${rewardUpdateCount} recent reward-related message${rewardUpdateCount === 1 ? "" : "s"}`}
                  </div>
                </div>
              </div>
            </div>
          </DSCard>

          <DSCard padding="md">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Navigation
                </p>
                <p className="text-sm text-muted-foreground">
                  Quick links back to the rest of the driver workspace.
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
                        {item.label}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">What belongs here</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Ticket history by activity and location</li>
                  <li>Drawing results and prize status</li>
                  <li>Fulfillment progress for any win</li>
                </ul>
              </div>
            </div>
          </DSCard>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="Current"
            title="Current drawing"
            description="The live lottery snapshot comes from the shared reward status feed and stays driver-safe."
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
                      Drawing Period
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {drawingLabel || "Current drawing"}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {lotteryStatusData?.currentDrawingMessage ||
                        "Current drawing details are available from the shared lottery status feed."}
                    </p>
                  </div>
                  <DSStatusChip tone={eligible ? "success" : "warning"}>
                    {eligible ? "Eligible" : "Paused"}
                  </DSStatusChip>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Entries</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{currentEntries.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Prize</p>
                    <p className="mt-2 text-base font-semibold leading-6">{currentPrize || "TBD"}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reward Status</p>
                    <p className="mt-2 text-base font-semibold leading-6">
                      {eligible ? "Reward program active" : "Reward program paused"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prize Tiers</p>
                    <p className="mt-2 text-base font-semibold leading-6">
                      {drawingPrizes.length > 0
                        ? `${drawingPrizes.length} prize${drawingPrizes.length === 1 ? "" : "s"} published`
                        : "No prizes published"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
                  <p className="mt-1 text-sm font-medium">{nextDrawingValue || "Awaiting drawing"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-sm font-medium">No current drawing details available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The driver rewards page will show the active drawing once it is published in the shared lottery
                  status feed.
                </p>
              </div>
            )}
          </DSCard>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="Summary"
            title="Rewards summary"
            description="A concise snapshot of entries, current drawing state, and reward notifications."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <DSKpiCard
              label="Current Month Entries"
              value={currentEntries.toLocaleString()}
              detail="Tickets earned this month"
              accentTone="accent"
            />
            <DSKpiCard
              label="Lifetime Entries"
              value={lifetimeEntries.toLocaleString()}
              detail="All reward tickets ever earned"
              accentTone="info"
            />
            <DSKpiCard
              label="Current Drawing"
              value={drawingLabel || "Pending"}
              detail={currentPrize || "Top prize not published yet"}
              accentTone="accent"
            />
            <DSKpiCard
              label="Reward Notifications"
              value={rewardUnreadCount.toLocaleString()}
              detail={`${rewardUpdateCount} recent reward-related message${rewardUpdateCount === 1 ? "" : "s"}`}
              accentTone="warning"
            />
            <DSKpiCard
              label="Eligible"
              value={eligible ? "Yes" : "No"}
              detail={eligible ? "Reward program is active" : "Reward program is paused"}
              accentTone={eligible ? "success" : "warning"}
            />
          </div>
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="Attention"
            title="Reward notifications"
            description="Recent reward-related notifications pulled from the message feed."
            actions={
              <Button
                type="button"
                variant="outline"
                className="border-border bg-background text-foreground hover:bg-muted/40"
                onClick={() => setLocation("/notifications")}
              >
                <Bell className="mr-2 h-4 w-4" />
                View notifications
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
              {rewardNotifications.map((notification) => (
                <DSCard key={notification.id} padding="md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <DSStatusChip tone={notification.type === "lottery_winner" ? "success" : "info"} size="sm">
                          {notification.type === "lottery_winner" ? "Winner" : "Reward update"}
                        </DSStatusChip>
                        {!notification.isRead ? (
                          <DSStatusChip tone="warning" size="sm">
                            Unread
                          </DSStatusChip>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-base font-semibold">{notification.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{formatRelative(notification.createdAt)}</span>
                    </div>
                  </div>
                </DSCard>
              ))}
            </div>
          ) : (
            <DSCard padding="lg">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">No reward updates yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Winner notices and drawing announcements will appear here.
                  </p>
                </div>
                <DSStatusChip tone="neutral">Waiting for updates</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="History"
            title="Drawing history"
            description="Completed drawings are shown with driver-safe details only."
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
                const drawingLabelText = formatMonthYear(item.lotteryMonth, item.lotteryYear);
                const notificationLabel =
                  item.notificationStatus === "sent"
                    ? "Notification sent"
                    : item.notificationStatus === "none"
                      ? "No notification"
                      : item.notificationStatus || "Unknown";

                return (
                  <DSCard key={item.drawingId} padding="md" elevated className="flex min-h-[240px] flex-col">
                    <div className="flex h-full flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Drawing
                          </p>
                          <h3 className="mt-1 text-lg font-semibold tracking-tight">{drawingLabelText}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <DSStatusChip tone="neutral" size="sm">
                            {item.status}
                          </DSStatusChip>
                          <DSStatusChip tone={item.won ? "success" : "neutral"} size="sm">
                            {item.won ? "Won" : "No win"}
                          </DSStatusChip>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Drawing Date
                          </p>
                          <p className="mt-1 font-medium">{formatDate(item.drawingDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Notification
                          </p>
                          <p className="mt-1 font-medium">{notificationLabel}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/70 p-3">
                        {item.won ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">Winning ticket</p>
                              <DSStatusChip tone="success" size="sm">
                                Place {item.placeIndex || "—"}
                              </DSStatusChip>
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{item.ticketNumber || "—"}</p>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Prize
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
                            <p className="text-sm font-semibold">No win recorded</p>
                            <p className="text-sm text-muted-foreground">
                              This completed drawing did not result in a prize for your tickets.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto rounded-2xl border border-border bg-background/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Created
                        </p>
                        <p className="mt-1 text-sm font-medium">{formatDate(item.createdAt)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.notificationSentAt ? `Sent ${formatRelative(item.notificationSentAt)}` : "No sent timestamp available"}
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
                  <p className="text-sm font-medium">No completed drawings yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Completed drawings tied to your tickets will appear here once the driver-safe history feed is available.
                  </p>
                </div>
                <DSStatusChip tone="neutral">Waiting for history</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="Ledger"
            title="Ticket ledger"
            description="Each earned ticket is shown as a compact card with the activity and location that generated it."
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
                          Ticket Number
                        </p>
                        <h3 className="mt-1 truncate text-lg font-semibold tracking-tight">
                          {entry.ticketNumber || "—"}
                        </h3>
                      </div>
                      <DSStatusChip tone={entry.isArchived ? "neutral" : "success"} size="sm">
                        {entry.isArchived ? "Archived" : "Active"}
                      </DSStatusChip>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Date Earned
                        </p>
                        <p className="mt-1 font-medium">{formatDate(entry.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Entries Earned
                        </p>
                        <p className="mt-1 font-medium">
                          {Number(entry.entriesEarned || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <p className="truncate text-sm font-semibold">{entry.locationName || "Unknown location"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[entry.locationCity, entry.locationState].filter(Boolean).join(", ") || "Location details unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.ownerCompany || "Owner not listed"}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Earned {formatRelative(entry.activityDate || entry.createdAt)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-border bg-background px-3 text-sm text-foreground hover:bg-muted/40"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        View Details
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
                  <p className="text-sm font-medium">No tickets yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approved work will add tickets to this ledger automatically.
                  </p>
                </div>
                <DSStatusChip tone="neutral">Awaiting entries</DSStatusChip>
              </div>
            </DSCard>
          )}
        </div>

        <div className="space-y-3">
          <DSSectionHeader
            eyebrow="Reserved"
            title="Driver-safe future sections"
            description="These cards reserve room for reward history and fulfillment data without touching admin-only routes."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {futureSections.map((section) => {
              const Icon = section.icon;

              return (
                <DSCard key={section.title} padding="lg" elevated className="min-h-[210px]">
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/70">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <DSStatusChip tone="neutral" size="sm">
                            Coming soon
                          </DSStatusChip>
                          <DSStatusChip tone="info" size="sm">
                            Driver view
                          </DSStatusChip>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold tracking-tight">{section.title}</h3>
                      </div>
                    </div>

                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </DSCard>
              );
            })}
          </div>
        </div>
      </main>

      <MobileNav role="driver" />

      <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-border bg-card text-foreground sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ticket details</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedEntry ? `Ticket ${selectedEntry.ticketNumber || "—"}` : "Ticket details"}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <DSStatusChip tone={selectedEntry.isArchived ? "neutral" : "success"} size="sm">
                  {selectedEntry.isArchived ? "Archived" : "Active"}
                </DSStatusChip>
                <DSStatusChip tone="info" size="sm">
                  Drawing {selectedEntry.lotteryMonth || "—"}/{selectedEntry.lotteryYear || "—"}
                </DSStatusChip>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Number</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.ticketNumber || "—"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date Earned</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedEntry.createdAt, "PPP")}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entries Earned</p>
                  <p className="mt-1 text-sm font-medium">
                    {Number(selectedEntry.entriesEarned || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity Date</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedEntry.activityDate, "PPP")}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/70 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location Name</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.locationName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Address</p>
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drawing Month</p>
                    <p className="mt-1 text-sm font-medium">{selectedEntry.lotteryMonth || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drawing Year</p>
                    <p className="mt-1 text-sm font-medium">{selectedEntry.lotteryYear || "—"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active / Archived</p>
                  <p className="mt-1 text-sm font-medium">{selectedEntry.isArchived ? "Archived" : "Active"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
