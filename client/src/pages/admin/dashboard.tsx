import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { BarChart3, Users, Building, DollarSign, TrendingUp, Calendar, Download, LogOut, MessageCircle, Clock, CheckCircle, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { PlatformPerformanceCard } from "@/components/PlatformPerformanceCard";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState("30");
  const [messageSearchTerm, setMessageSearchTerm] = useState("");
  const [showResolvedMessages, setShowResolvedMessages] = useState(false);

  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/dashboard'],
    retry: false,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/admin/messages'],
    retry: false,
  });

  const updateMessageStatusMutation = useMutation({
    mutationFn: async ({ messageId, status }: { messageId: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/admin/messages/${messageId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/messages'] });
      toast({ title: "Message status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update message status", variant: "destructive" });
    },
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
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-lg truncate">System Overview</h1>
              <p className="text-white/80 text-sm hidden sm:block">Platform Administration</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report"
              className="hidden sm:flex"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report-mobile"
              className="sm:hidden p-2"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="bg-black border-black text-white hover:bg-gray-800 hidden sm:flex"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout-mobile"
              className="bg-black border-black text-white hover:bg-gray-800 sm:hidden p-2"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">


        {/* Platform Performance Analytics */}
        <StatCard title="Platform Performance Analytics">
          <div className="space-y-4">
            {/* Date Range Selector */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm font-medium">Date Range</span>
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  variant={dateRange === "30" ? "default" : "outline"}
                  onClick={() => setDateRange("30")}
                  data-testid="button-range-30-performance"
                  className="text-xs"
                >
                  30 Days
                </Button>
                <Button 
                  size="sm"
                  variant={dateRange === "60" ? "default" : "outline"}
                  onClick={() => setDateRange("60")}
                  data-testid="button-range-60-performance"
                  className="text-xs"
                >
                  60 Days
                </Button>
                <Button 
                  size="sm"
                  variant={dateRange === "90" ? "default" : "outline"}
                  onClick={() => setDateRange("90")}
                  data-testid="button-range-90-performance"
                  className="text-xs"
                >
                  90 Days
                </Button>
              </div>
            </div>

            <PlatformPerformanceCard dateRange={parseInt(dateRange)} />
          </div>
        </StatCard>

        {/* Owner Subscription Revenue */}
        <StatCard title="Subscription Revenue">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Monthly Subscriptions</span>
              <span className="text-xl font-bold text-green-600" data-testid="text-monthly-subscriptions">
                {formatCurrency(weekStats?.subscriptionRevenue || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Active Licenses</span>
              <button 
                className="text-lg font-semibold hover:text-primary transition-colors cursor-pointer hover:underline"
                onClick={() => window.location.href = '/subscriptions?filter=active'}
                data-testid="button-active-licenses"
                title="Click to view active subscribers"
              >
                {weekStats?.activeLicenses || 0}
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">License Renewals</span>
              <div className="text-right">
                <button 
                  className="text-lg font-semibold text-foreground hover:text-primary transition-colors cursor-pointer hover:underline"
                  onClick={() => window.location.href = '/subscriptions?filter=renewal'}
                  data-testid="button-license-renewals"
                  title="Click to view upcoming renewals"
                >
                  {weekStats?.licenseRenewals || 0}
                </button>
                <div className="text-sm text-muted-foreground">
                  This month
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Stripe Integration</span>
                <Badge variant="outline" data-testid="badge-stripe-status">
                  {import.meta.env.VITE_STRIPE_PUBLIC_KEY ? "Connected" : "Development Mode"}
                </Badge>
              </div>
            </div>
          </div>
        </StatCard>

        {/* Messages Section */}
        <StatCard title="Support Messages">
          <div className="space-y-4">
            {/* Search and Filter Controls */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages (includes resolved)..."
                  value={messageSearchTerm}
                  onChange={(e) => setMessageSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
                  data-testid="input-search-messages"
                />
                {messageSearchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => setMessageSearchTerm("")}
                    data-testid="button-clear-search"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResolvedMessages(!showResolvedMessages)}
                data-testid="button-toggle-resolved"
              >
                {showResolvedMessages ? "Hide Resolved" : "Show Resolved"}
              </Button>
            </div>

            {messagesLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading messages...</p>
              </div>
            ) : (() => {
              // Filter messages based on search term and resolved toggle
              let filteredMessages = messages || [];
              
              if (messageSearchTerm) {
                // When searching, include all messages (including resolved)
                filteredMessages = filteredMessages.filter((message: any) =>
                  message.subject?.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  message.message?.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  `${message.user?.firstName} ${message.user?.lastName}`.toLowerCase().includes(messageSearchTerm.toLowerCase()) ||
                  message.userRole?.toLowerCase().includes(messageSearchTerm.toLowerCase())
                );
              } else {
                // When not searching, filter based on resolved toggle
                if (!showResolvedMessages) {
                  filteredMessages = filteredMessages.filter((message: any) => message.status !== 'resolved');
                }
              }

              return !filteredMessages || filteredMessages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  {messageSearchTerm ? (
                    <>
                      <p className="text-muted-foreground">No messages found</p>
                      <p className="text-sm text-muted-foreground">Try adjusting your search terms</p>
                    </>
                  ) : showResolvedMessages ? (
                    <>
                      <p className="text-muted-foreground">No support messages yet</p>
                      <p className="text-sm text-muted-foreground">Messages from drivers and owners will appear here</p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">No active support messages</p>
                      <p className="text-sm text-muted-foreground">Resolved messages are hidden. Use search or toggle to view them.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredMessages.slice(0, 5).map((message: any) => (
                  <div 
                    key={message.id} 
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`message-card-${message.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant={message.userRole === 'driver' ? 'default' : 'secondary'}
                          data-testid={`badge-user-role-${message.id}`}
                        >
                          {message.userRole === 'driver' ? 'Driver' : 'Owner'}
                        </Badge>
                        <Badge 
                          variant={
                            message.status === 'resolved' ? 'default' : 
                            message.status === 'read' ? 'secondary' : 'destructive'
                          }
                          data-testid={`badge-status-${message.id}`}
                        >
                          {message.status === 'unread' ? 'Unread' : 
                           message.status === 'read' ? 'Read' : 'Resolved'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(message.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <h4 className="font-semibold mb-1" data-testid={`text-subject-${message.id}`}>
                      {message.subject}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2" data-testid={`text-user-name-${message.id}`}>
                      From: {message.user.firstName} {message.user.lastName}
                      {message.userPhone && ` • ${message.userPhone}`}
                    </p>
                    <p className="text-sm mb-3 line-clamp-2" data-testid={`text-message-${message.id}`}>
                      {message.message}
                    </p>
                    <div className="flex space-x-2">
                      {message.status === 'unread' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMessageStatusMutation.mutate({ messageId: message.id, status: 'read' })}
                          data-testid={`button-mark-read-${message.id}`}
                        >
                          Mark as Read
                        </Button>
                      )}
                      {message.status !== 'resolved' && (
                        <Button
                          size="sm"
                          onClick={() => updateMessageStatusMutation.mutate({ messageId: message.id, status: 'resolved' })}
                          data-testid={`button-resolve-${message.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                  ))}
                  {filteredMessages.length > 5 && (
                    <div className="text-center pt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing 5 of {filteredMessages.length} messages
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
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

      </main>

      <MobileNav role="admin" />
    </div>
  );
}
