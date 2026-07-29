import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell, Check, CheckCheck, AlertTriangle, Info, DollarSign,
  Trophy, Ticket, Megaphone, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileNav } from "@/components/MobileNav";
import { DSCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { formatLocalizedDate, useLanguage } from "@/lib/i18n";

function getNotificationIcon(type: string) {
  switch (type) {
    case 'lottery_winner':
      return <Trophy className="w-5 h-5 text-amber-500" />;
    case 'lottery_drawing_complete':
      return <Ticket className="w-5 h-5 text-primary" />;
    case 'lottery_entry':
      return <Ticket className="w-5 h-5 text-foreground/70" />;
    case 'payment':
    case 'payment_succeeded':
      return <DollarSign className="w-5 h-5 text-emerald-500" />;
    case 'warning':
    case 'low_balance':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    case 'success':
      return <Check className="w-5 h-5 text-emerald-500" />;
    case 'announcement':
      return <Megaphone className="w-5 h-5 text-primary" />;
    default:
      return <Info className="w-5 h-5 text-foreground/70" />;
  }
}

function getNotificationColor(type: string, isRead: boolean) {
  const base = (() => {
    switch (type) {
      case 'lottery_winner':
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-amber-500/30 bg-card/90 ring-1 ring-amber-500/15';
      case 'lottery_drawing_complete':
      case 'lottery_entry':
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-primary/30 bg-card/90 ring-1 ring-primary/15';
      case 'payment':
      case 'payment_succeeded':
      case 'success':
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-emerald-500/30 bg-card/90 ring-1 ring-emerald-500/15';
      case 'warning':
      case 'low_balance':
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-amber-500/30 bg-card/90 ring-1 ring-amber-500/15';
      case 'error':
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-red-500/30 bg-card/90 ring-1 ring-red-500/15';
      default:
        return isRead
          ? 'border-border/70 bg-card/80'
          : 'border-primary/30 bg-card/90 ring-1 ring-primary/15';
    }
  })();
  return base;
}

export default function DriverNotifications() {
  const [, setLocation] = useLocation();
  const { language, t } = useLanguage();

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

  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) =>
      apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/api/notifications/read-all', { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  return (
    <div className="dark min-h-screen bg-background pb-24 text-foreground">
      <header className="border-b border-border/70 bg-card/95 p-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="border-border/70 bg-background/60 p-2 text-foreground hover:bg-background hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg text-foreground">{t("driver.notifications.title")}</h1>
              <p className="text-sm text-foreground/75">
                {unreadCount > 0 ? t("driver.notifications.unreadCount", { count: unreadCount }) : t("driver.notifications.allCaughtUp")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs gap-1 border-border/70 bg-background/60 text-foreground hover:bg-background hover:text-foreground"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck className="w-4 h-4" />
                {t("driver.notifications.markAllRead")}
              </Button>
            )}
            <Bell className="w-6 h-6" />
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        <DSSectionHeader
          title={t("driver.notifications.title")}
          description={unreadCount > 0 ? t("driver.notifications.unreadCount", { count: unreadCount }) : t("driver.notifications.allCaughtUp")}
        />
        {isLoading ? (
          [1, 2, 3].map(i => (
            <DSCard key={i} className="animate-pulse border-border/70 bg-card/90">
              <CardContent className="p-4">
                <div className="h-20 rounded-2xl bg-muted/70" />
              </CardContent>
            </DSCard>
          ))
        ) : notifications.length === 0 ? (
          <DSCard padding="lg" className="border-border/70 bg-card/90">
            <CardContent className="p-12 text-center">
              <Bell className="w-12 h-12 text-foreground/65 mx-auto mb-4" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {t("driver.notifications.emptyTitle")}
              </h3>
              <p className="text-sm text-foreground/70">
                {t("driver.notifications.emptyDescription")}
              </p>
            </CardContent>
          </DSCard>
        ) : (
          notifications.map((notification: any) => (
            <DSCard
              key={notification.id}
              className={`border ${getNotificationColor(notification.type, notification.isRead)}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold leading-snug text-foreground">
                        {notification.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!notification.isRead && (
                          <DSStatusChip tone="warning" className="text-xs">{t("driver.notifications.new")}</DSStatusChip>
                        )}
                      </div>
                    </div>
                    <p className="mb-2 text-sm leading-relaxed text-foreground/78">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground/65">
                        {formatLocalizedDate(notification.createdAt, language, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      {!notification.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                          className="h-7 border-border/70 bg-background/60 text-xs text-foreground hover:bg-background hover:text-foreground"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          {t("driver.notifications.markRead")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </DSCard>
          ))
        )}
      </main>

      <MobileNav role="driver" />
    </div>
  );
}
