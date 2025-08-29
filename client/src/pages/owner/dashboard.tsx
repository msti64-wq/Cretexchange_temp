import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Building2, Users, DollarSign, MapPin, TrendingUp, Clock, Plus, LogOut, User } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['/api/owners/dashboard'],
  });

  if (isLoading) {
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

  const { weekStats, monthStats, locations, recentActivities } = dashboardData || {};

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg" data-testid="text-owner-name">
                Welcome, {user?.firstName} {user?.lastName}
              </h1>
              <p className="text-white/80 text-sm">Location Management</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLocation('/locations')}
              data-testid="button-add-location"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Location
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/profile')}
              data-testid="button-profile"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <User className="w-4 h-4 mr-1" />
              Profile
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Locations" className="text-center">
            <div className="text-3xl font-bold text-primary mb-1" data-testid="text-total-locations">
              {locations || 0}
            </div>
            <div className="text-sm text-muted-foreground">Active Sites</div>
          </StatCard>

          <StatCard title="This Week" className="text-center">
            <div className="text-3xl font-bold text-secondary mb-1" data-testid="text-week-earnings">
              {formatCurrency(weekStats?.totalPayments || 0)}
            </div>
            <div className="text-sm text-muted-foreground">Revenue</div>
          </StatCard>
        </div>

        {/* Weekly Performance */}
        <StatCard
          title="7-Day Performance"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              +15%
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="text-xl font-bold text-foreground" data-testid="text-week-total">
                {formatCurrency(weekStats?.totalPayments || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Washouts Completed</span>
              <span className="text-lg font-semibold" data-testid="text-week-washouts">
                {weekStats?.totalWashouts || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Active Drivers</span>
              <span className="text-lg font-semibold" data-testid="text-week-drivers">
                {weekStats?.totalDrivers || 0}
              </span>
            </div>
          </div>
        </StatCard>

        {/* Monthly Comparison */}
        <StatCard title="30-Day Summary">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="text-xl font-bold text-foreground" data-testid="text-month-total">
                {formatCurrency(monthStats?.totalPayments || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Washouts</span>
              <span className="text-lg font-semibold" data-testid="text-month-washouts">
                {monthStats?.totalWashouts || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Unique Drivers</span>
              <span className="text-lg font-semibold" data-testid="text-month-drivers">
                {monthStats?.totalDrivers || 0}
              </span>
            </div>
          </div>
        </StatCard>

        {/* Recent Activity */}
        <StatCard
          title="Recent Activity"
          subtitle={
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary hover:text-primary/80"
              onClick={() => setLocation('/drivers')}
              data-testid="button-view-all-activity"
            >
              View All
            </Button>
          }
        >
          <div className="space-y-3">
            {!recentActivities?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            ) : (
              recentActivities.slice(0, 3).map((activity: any, index: number) => (
                <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`card-recent-activity-${index}`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium" data-testid={`text-driver-name-${index}`}>
                        {activity.driver?.user?.firstName} {activity.driver?.user?.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-location-name-${index}`}>
                        {activity.location?.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground" data-testid={`text-activity-amount-${index}`}>
                      {formatCurrency(Number(activity.amount))}
                    </div>
                    <Badge 
                      variant={activity.status === 'verified' ? 'default' : 'secondary'}
                      className="text-xs"
                      data-testid={`badge-activity-status-${index}`}
                    >
                      {activity.status === 'verified' ? 'Verified' : 'Pending'}
                    </Badge>
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
      </main>

      <MobileNav role="owner" />
    </div>
  );
}
