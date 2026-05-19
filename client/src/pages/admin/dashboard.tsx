import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, type ComponentType } from "react";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Users, Building, DollarSign, Download, LogOut, MessageCircle, Clock, CheckCircle, Search, X, Flag, Gift, PackageCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { PlatformPerformanceCard } from "@/components/PlatformPerformanceCard";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";

type AdminMetricProps = {
  title: string;
  value: string | number;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  dataTestId?: string;
};

function AdminMetric({ title, value, helper, icon: Icon, tone, dataTestId }: AdminMetricProps) {
  return (
    <Card className="group overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground" data-testid={dataTestId}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className={`rounded-xl p-3 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboardSkeleton({ role }: { role?: "driver" | "owner" | "admin" | "super_admin" }) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="gradient-bg p-4">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-12 w-56 bg-white/30" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </main>
      <MobileNav role={role} />
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState("30");
  const [messageSearchTerm, setMessageSearchTerm] = useState("");
  const [showResolvedMessages, setShowResolvedMessages] = useState(false);

  const { data: dashboardData, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/dashboard'],
    retry: false,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<any>({
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

  const { data: pendingDrawings } = useQuery<any[]>({
    queryKey: ['/api/admin/lottery/drawings/pending'],
    refetchInterval: 60000,
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ drawingId, place }: { drawingId: string; place: string }) => {
      const response = await apiRequest("PUT", `/api/admin/lottery/drawings/${drawingId}/mark-delivered`, { place });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lottery/drawings/pending'] });
      toast({ title: "Prize marked as delivered!" });
    },
    onError: () => {
      toast({ title: "Failed to update delivery status", variant: "destructive" });
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
    return <AdminDashboardSkeleton role={user?.role} />;
  }

  const { weekStats, monthStats } = dashboardData || {};
  const allMessages = Array.isArray(messages) ? messages : [];
  const unreadMessages = allMessages.filter((message: any) => message.status === "unread").length;
  const activeMessages = allMessages.filter((message: any) => message.status !== "resolved").length;
  const resolvedMessages = allMessages.filter((message: any) => message.status === "resolved").length;
  const messageChartData = [
    { label: "Unread", count: unreadMessages },
    { label: "Active", count: activeMessages },
    { label: "Resolved", count: resolvedMessages },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="brand-frame flex h-14 w-14 items-center justify-center rounded-2xl flex-shrink-0">
              <img src={logoImage} alt="CreteXchange" className="h-9 w-9 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  Admin console
                </p>
                <span className="dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  Marketplace oversight
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight">System Overview</h1>
              <p className="mt-1 text-sm text-white/80">Platform administration and support signals.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report"
              className="hidden h-10 bg-white text-primary hover:bg-white/90 sm:flex"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              data-testid="button-export-report-mobile"
              className="h-10 bg-white text-primary hover:bg-white/90 sm:hidden p-2"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="hidden h-10 border-white/20 bg-black/20 text-white hover:bg-black/35 hover:text-white sm:flex"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout-mobile"
              className="h-10 border-white/20 bg-black/20 text-white hover:bg-black/35 hover:text-white sm:hidden p-2"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 space-y-6">
        {/* Operations Snapshot */}
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Operations center
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Admin Dashboard</h2>
            <p className="mt-1 text-sm text-muted-foreground">Monitor platform health, support workload, and revenue signals.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetric
              title="Revenue"
              value={formatCurrency(weekStats?.subscriptionRevenue || 0)}
              helper="Subscription revenue"
              icon={DollarSign}
              tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
              dataTestId="text-monthly-subscriptions-summary"
            />
            <AdminMetric
              title="Active Licenses"
              value={weekStats?.activeLicenses || 0}
              helper={`${weekStats?.licenseRenewals || 0} renewals this month`}
              icon={Building}
              tone="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
              dataTestId="text-active-licenses-summary"
            />
            <AdminMetric
              title="Support Queue"
              value={activeMessages}
              helper={`${unreadMessages} unread messages`}
              icon={MessageCircle}
              tone="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300"
              dataTestId="text-active-messages-summary"
            />
            <AdminMetric
              title="Prize Follow-Up"
              value={pendingDrawings?.length || 0}
              helper="Pending drawing deliveries"
              icon={Gift}
              tone="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
              dataTestId="text-pending-drawings-summary"
            />
          </div>
        </section>

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

        {/* Revenue and Support Overview */}
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Subscription Revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Monthly Subscriptions</span>
                <span className="text-xl font-semibold text-green-600" data-testid="text-monthly-subscriptions">
                  {formatCurrency(weekStats?.subscriptionRevenue || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Licenses</span>
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
                <span className="text-sm text-muted-foreground">License Renewals</span>
                <div className="text-right">
                  <button
                    className="text-lg font-semibold text-foreground hover:text-primary transition-colors cursor-pointer hover:underline"
                    onClick={() => window.location.href = '/subscriptions?filter=renewal'}
                    data-testid="button-license-renewals"
                    title="Click to view upcoming renewals"
                  >
                    {weekStats?.licenseRenewals || 0}
                  </button>
                  <div className="text-sm text-muted-foreground">This month</div>
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
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Support Workload</CardTitle>
                  <p className="text-sm text-muted-foreground">Current message status distribution.</p>
                </div>
                <Badge variant={activeMessages > 0 ? "secondary" : "outline"}>{activeMessages} active</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  count: { label: "Messages", color: "var(--chart-3)" },
                }}
                className="h-[210px] w-full"
              >
                <BarChart data={messageChartData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

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

        {/* Pending Prize Deliveries */}
        {pendingDrawings && pendingDrawings.length > 0 && (
          <Card className="border-yellow-300 dark:border-yellow-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift className="w-4 h-4 text-yellow-600" />
                Pending Prize Deliveries
                <Badge className="ml-auto bg-yellow-100 text-yellow-700 border-yellow-300">
                  Reminder
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingDrawings.map((drawing: any) => {
                const monthName = new Date(drawing.lotteryYear, drawing.lotteryMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                const winners = [
                  { place: '🥇 1st', key: 'first', name: drawing.firstPlaceDriverName, ticket: drawing.firstPlaceTicketNumber, pref: drawing.firstPlacePayoutPreference, prize: drawing.firstPrize, delivered: drawing.firstPlaceDelivered },
                  { place: '🥈 2nd', key: 'second', name: drawing.secondPlaceDriverName, ticket: drawing.secondPlaceTicketNumber, pref: drawing.secondPlacePayoutPreference, prize: drawing.secondPrize, delivered: drawing.secondPlaceDelivered },
                  { place: '🥉 3rd', key: 'third', name: drawing.thirdPlaceDriverName, ticket: drawing.thirdPlaceTicketNumber, pref: drawing.thirdPlacePayoutPreference, prize: drawing.thirdPrize, delivered: drawing.thirdPlaceDelivered },
                ].filter(w => w.name && !w.delivered);

                return (
                  <div key={drawing.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{monthName} Drawing</p>
                    <div className="space-y-2">
                      {winners.map((winner) => (
                        <div key={winner.key} className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{winner.place} — {winner.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{winner.ticket}</p>
                            {winner.prize && <p className="text-xs text-muted-foreground">Prize: {winner.prize}</p>}
                            <p className="text-xs text-muted-foreground">
                              {winner.pref === 'gift_card' ? '🎁 Gift Card' : winner.pref === 'other_prize' ? '🎉 Surprise Prize' : '🏦 Bank Transfer'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-shrink-0 text-green-700 border-green-400 hover:bg-green-50"
                            onClick={() => markDeliveredMutation.mutate({ drawingId: drawing.id, place: winner.key })}
                            disabled={markDeliveredMutation.isPending}
                          >
                            <PackageCheck className="w-4 h-4 mr-1" />
                            Delivered
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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

          {user?.role === 'super_admin' && (
            <Button 
              variant="outline" 
              className="h-20 flex-col space-y-2"
              onClick={() => window.location.href = '/feature-flags'}
              data-testid="button-feature-flags"
            >
              <Flag className="w-6 h-6 text-green-600" />
              <div className="text-center">
                <div className="font-medium">Feature Flags</div>
                <div className="text-xs text-muted-foreground">Control Features</div>
              </div>
            </Button>
          )}
        </div>

      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
