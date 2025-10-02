import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, Check, AlertTriangle, Info, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

export default function OwnerNotifications() {
  const [, setLocation] = useLocation();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['/api/notifications'],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'low_balance':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'payment':
        return <DollarSign className="w-5 h-5 text-green-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'low_balance':
        return 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800';
      case 'payment':
        return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
      default:
        return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/owner')}
              className="text-white hover:bg-white/20 p-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg">Notifications</h1>
              <p className="text-white/80 text-sm">Stay updated on important events</p>
            </div>
          </div>
          <Bell className="w-6 h-6" />
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (notifications as any[]).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No notifications
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You're all caught up! You'll see notifications here when there's important information.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" data-testid="list-notifications">
            {(notifications as any[]).map((notification: any) => (
              <Card
                key={notification.id}
                className={`${getNotificationColor(notification.type)} ${
                  notification.isRead ? 'opacity-60' : ''
                }`}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {notification.title}
                        </h3>
                        <div className="flex items-center space-x-2">
                          {!notification.isRead && (
                            <Badge variant="default" className="bg-blue-600 text-white">
                              New
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        {notification.message}
                      </p>
                      {!notification.isRead && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                          className="bg-white dark:bg-gray-800"
                          data-testid={`button-mark-read-${notification.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Mark as read
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
