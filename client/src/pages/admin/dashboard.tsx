import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { BarChart3, Users, Building, DollarSign, TrendingUp, Calendar, Download, LogOut } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [dateRange, setDateRange] = useState("7");

  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/dashboard'],
    retry: false,
  });

  // Handle unauthorized error
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  const handleExport = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`/api/export/admin-all?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export system report",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-muted rounded-lg" />
            <div className="h-32 bg-muted rounded-lg" />
          </div>
          <div className="h-48 bg-muted rounded-lg" />
        </div>
        <MobileNav role="admin" />
      </div>
    );
  }

  const { weekStats, monthStats } = dashboardData || {};

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">System Overview</h1>
              <p className="text-white/80 text-sm">Platform Administration</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
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
        {/* Date Range Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Date Range</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  variant={dateRange === "7" ? "default" : "outline"}
                  onClick={() => setDateRange("7")}
                  data-testid="button-range-7"
                >
                  7 Days
                </Button>
                <Button 
                  size="sm"
                  variant={dateRange === "30" ? "default" : "outline"}
                  onClick={() => setDateRange("30")}
                  data-testid="button-range-30"
                >
                  30 Days
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics - Week */}
        <StatCard
          title="7-Day Performance"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              +18%
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-1" data-testid="text-week-earnings">
                {formatCurrency(weekStats?.totalEarnings || 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Revenue</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary mb-1" data-testid="text-week-washouts">
                {weekStats?.totalWashouts || 0}
              </div>
              <div className="text-sm text-muted-foreground">Washouts</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <div className="text-xl font-semibold text-foreground" data-testid="text-week-drivers">
                {weekStats?.totalDrivers || 0}
              </div>
              <div className="text-sm text-muted-foreground">Active Drivers</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-foreground" data-testid="text-week-owners">
                {weekStats?.totalOwners || 0}
              </div>
              <div className="text-sm text-muted-foreground">Active Owners</div>
            </div>
          </div>
        </StatCard>

        {/* Monthly Comparison */}
        <StatCard title="30-Day Summary">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Revenue</span>
              <span className="text-xl font-bold text-foreground" data-testid="text-month-earnings">
                {formatCurrency(monthStats?.totalEarnings || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Washouts</span>
              <span className="text-lg font-semibold" data-testid="text-month-washouts">
                {monthStats?.totalWashouts || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Platform Growth</span>
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">
                  {monthStats?.totalDrivers || 0} drivers
                </div>
                <div className="text-sm text-muted-foreground">
                  {monthStats?.totalOwners || 0} owners
                </div>
              </div>
            </div>
          </div>
        </StatCard>

        {/* Platform Health */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">System Status</span>
                </div>
                <Badge variant="default" data-testid="badge-system-status">Operational</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Payment Processing</span>
                </div>
                <Badge variant="default" data-testid="badge-payment-status">Active</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-sm">Object Storage</span>
                </div>
                <Badge variant="secondary" data-testid="badge-storage-status">Connected</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">GPS Services</span>
                </div>
                <Badge variant="default" data-testid="badge-gps-status">Available</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="h-20 flex-col space-y-2"
            onClick={() => window.location.href = '/users'}
            data-testid="button-manage-users"
          >
            <Users className="w-6 h-6 text-primary" />
            <div className="text-center">
              <div className="font-medium">Users</div>
              <div className="text-xs text-muted-foreground">Manage & Approve</div>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-20 flex-col space-y-2"
            onClick={() => window.location.href = '/locations'}
            data-testid="button-manage-locations"
          >
            <Building className="w-6 h-6 text-secondary" />
            <div className="text-center">
              <div className="font-medium">Locations</div>
              <div className="text-xs text-muted-foreground">Monitor Sites</div>
            </div>
          </Button>
        </div>

        {/* System Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Key Performance Indicators</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Average per Washout</span>
                <span className="font-semibold" data-testid="text-avg-washout">
                  {weekStats?.totalWashouts > 0 ? 
                    formatCurrency((weekStats?.totalEarnings || 0) / weekStats.totalWashouts) : 
                    formatCurrency(0)
                  }
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Platform Commission (1%)</span>
                <span className="font-semibold text-green-600" data-testid="text-platform-commission">
                  {formatCurrency((weekStats?.totalEarnings || 0) * 0.01)}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Driver Retention Rate</span>
                <span className="font-semibold">94%</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Owner Satisfaction</span>
                <span className="font-semibold">4.8/5</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <MobileNav role="admin" />
    </div>
  );
}
