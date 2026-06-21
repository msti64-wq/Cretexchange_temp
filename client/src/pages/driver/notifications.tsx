import { useQuery, useMutation } from "@tanstack/react-query";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell, Check, CheckCheck, AlertTriangle, Info, DollarSign,
  Trophy, Ticket, Megaphone, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { MobileNav } from "@/components/MobileNav";
import { DSCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";

function getNotificationIcon(type: string) {
  switch (type) {
    case 'lottery_winner':
      return <Trophy className="w-5 h-5 text-yellow-500" />;
    case 'lottery_drawing_complete':
      return <Ticket className="w-5 h-5 text-purple-500" />;
    case 'lottery_entry':
      return <Ticket className="w-5 h-5 text-indigo-500" />;
    case 'payment':
    case 'payment_succeeded':
      return <DollarSign className="w-5 h-5 text-green-500" />;
    case 'warning':
    case 'low_balance':
      return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    case 'success':
      return <Check className="w-5 h-5 text-green-500" />;
    case 'announcement':
      return <Megaphone className="w-5 h-5 text-blue-500" />;
    default:
      return <Info className="w-5 h-5 text-blue-500" />;
  }
}

function getNotificationColor(type: string, isRead: boolean) {
  const base = (() => {
    switch (type) {
      case 'lottery_winner':
        return 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800';
      case 'lottery_drawing_complete':
      case 'lottery_entry':
        return 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800';
      case 'payment':
      case 'payment_succeeded':
      case 'success':
        return 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800';
      case 'warning':
      case 'low_balance':
        return 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';
      default:
        return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800';
    }
  })();
  return `${base} ${isRead ? 'opacity-60' : ''}`;
}

export default function DriverNotifications() {
  const [, setLocation] = useLocation();

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20 p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg">Message Center</h1>
              <p className="text-white/80 text-sm">
                {unreadCount > 0 ? `${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 text-xs gap-1"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </Button>
            )}
            <Bell className="w-6 h-6" />
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        <DSSectionHeader
          title="Message Center"
          description={unreadCount > 0 ? `${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
        />
        {isLoading ? (
          [1, 2, 3].map(i => (
            <DSCard key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </CardContent>
            </DSCard>
          ))
        ) : notifications.length === 0 ? (
          <DSCard padding="lg">
            <CardContent className="p-12 text-center">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No messages yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You'll see notifications here about lottery results, payments, and account updates.
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
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                        {notification.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!notification.isRead && (
                          <DSStatusChip tone="info" className="text-xs">New</DSStatusChip>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </span>
                      {!notification.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                          className="h-7 text-xs bg-white dark:bg-gray-800"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Mark read
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
