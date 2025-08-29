import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { MapPin, History, User, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function DriverDashboard() {
  const [, setLocation] = useLocation();

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['/api/drivers/dashboard'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  const { dailyStats, weeklyStats, recentActivities } = dashboardData || {};

  // Calculate rejected washouts and their total amount
  const rejectedWashouts = recentActivities?.filter((activity: any) => 
    (activity.washout_activities?.status || activity.status) === 'rejected'
  ) || [];
  
  const rejectedTotal = rejectedWashouts.reduce((total: number, activity: any) => {
    return total + Number(activity.washout_activities?.amount || activity.amount || 0);
  }, 0);

  // Calculate adjusted earnings (total minus rejected)
  const adjustedDailyEarnings = (dailyStats?.earnings || 0) - rejectedTotal;

  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />

      {/* GPS Status Bar */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium" data-testid="text-gps-status">GPS Active</span>
          </div>
          <div className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
            <MapPin className="w-4 h-4 inline mr-1" />
            <span data-testid="text-current-location">Location Enabled</span>
          </div>
        </div>
      </div>

      <main className="p-4 space-y-6">
        {/* Today's Activity */}
        <StatCard
          title="Today's Activity"
          subtitle={
            <div className="flex items-center justify-between">
              <span>{new Date().toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              })}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-primary hover:text-primary/80 text-xs"
                onClick={() => refetch()}
                data-testid="button-refresh-dashboard"
              >
                Refresh
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1" data-testid="text-daily-visits">
                {dailyStats?.visits || 0}
              </div>
              <div className="text-sm text-muted-foreground">Site Visits</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-secondary mb-1" data-testid="text-daily-earnings">
                {formatCurrency(adjustedDailyEarnings)}
              </div>
              <div className="text-sm text-muted-foreground">Today's Earnings</div>
              {rejectedTotal > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1" data-testid="text-rejected-amount">
                  -{formatCurrency(rejectedTotal)} rejected
                </div>
              )}
            </div>
          </div>
        </StatCard>

        {/* 7-Day Summary */}
        <StatCard
          title="7-Day Summary"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              +12%
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Earned</span>
              <span className="text-2xl font-bold text-foreground" data-testid="text-weekly-earnings">
                {formatCurrency(weeklyStats?.totalEarnings || 0)}
              </span>
            </div>
            {rejectedTotal > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Rejected Amount</span>
                <span className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-weekly-rejected">
                  -{formatCurrency(rejectedTotal)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Net Earnings</span>
              <span className="text-xl font-bold text-green-600 dark:text-green-500" data-testid="text-net-earnings">
                {formatCurrency((weeklyStats?.totalEarnings || 0) - rejectedTotal)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Washouts</span>
              <span className="text-lg font-semibold" data-testid="text-weekly-washouts">
                {weeklyStats?.totalWashouts || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg per Washout</span>
              <span className="text-lg font-semibold" data-testid="text-avg-washout">
                {formatCurrency(weeklyStats?.avgPerWashout || 0)}
              </span>
            </div>
            {rejectedWashouts.length > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Rejected Washouts</span>
                <span className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-rejected-washouts">
                  {rejectedWashouts.length} ({formatCurrency(rejectedTotal)})
                </span>
              </div>
            )}
          </div>
        </StatCard>

        {/* Check-in Button */}
        <Button 
          className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 text-accent-foreground shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
          onClick={() => setLocation('/locations')}
          data-testid="button-find-location"
        >
          <MapPin className="w-6 h-6 mr-3" />
          Find Nearby Washout Location
        </Button>

        {/* Recent Activity */}
        <StatCard
          title="Recent Washouts"
          subtitle={
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary hover:text-primary/80"
              onClick={() => setLocation('/activity')}
              data-testid="button-view-all"
            >
              View All
            </Button>
          }
        >
          <div className="space-y-3">
            {!recentActivities?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No recent washouts</p>
              </div>
            ) : (
              recentActivities.map((activity: any, index: number) => (
                <div key={activity.washout_activities?.id || activity.id || index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`card-activity-${index}`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium" data-testid={`text-location-name-${index}`}>
                        {activity.washout_locations?.name || activity.location?.name || 'Unknown Location'}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-activity-time-${index}`}>
                        {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground" data-testid={`text-activity-amount-${index}`}>
                      {formatCurrency(Number(activity.washout_activities?.amount || activity.amount || 0))}
                    </div>
                    <div className={`text-xs font-medium ${
                      (activity.washout_activities?.status || activity.status) === 'verified' ? 'text-green-600' : 
                      (activity.washout_activities?.status || activity.status) === 'pending' ? 'text-yellow-600' : 'text-red-600'
                    }`} data-testid={`text-activity-status-${index}`}>
                      {(activity.washout_activities?.status || activity.status) === 'verified' ? 'Verified' : 
                       (activity.washout_activities?.status || activity.status) === 'pending' ? 'Pending' : 'Rejected'}
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
            onClick={() => setLocation('/activity')}
            data-testid="button-view-history"
          >
            <History className="w-6 h-6 text-primary" />
            <div className="text-center">
              <div className="font-medium">View History</div>
              <div className="text-xs text-muted-foreground">Download CSV</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-20 flex-col space-y-2"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
          >
            <User className="w-6 h-6 text-secondary" />
            <div className="text-center">
              <div className="font-medium">Profile</div>
              <div className="text-xs text-muted-foreground">Update Details</div>
            </div>
          </Button>
        </div>
      </main>

      <MobileNav role="driver" />
    </div>
  );
}
