import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { CreditCard, Download, Filter, Calendar, TrendingUp, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";

// Types
interface Subscription {
  id: string;
  ownerName: string;
  email: string;
  companyName: string;
  status: string;
  plan: string;
  amount: number | null;
  nextBillingDate: string | null;
  currentPeriodEnd: string | null;
  localEndsAt: string | null;
  createdAt: string;
  stripeCustomerId: string | null;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string | null;
}

interface SubscriptionsData {
  subscriptions: Subscription[];
  totalActive: number;
  totalSubscriptions: number;
}

// Safe date formatting helper
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
  } catch {
    return 'N/A';
  }
};

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");

  // Handle URL parameters for filtering
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam === 'active') {
      setFilterStatus('active');
    } else if (filterParam === 'renewal') {
      // For renewals, we'll filter to show subscriptions with upcoming billing dates
      setFilterStatus('active'); // Show active subscriptions for now
    }
  }, []);

  const { data: subscriptionsData, isLoading, error } = useQuery<SubscriptionsData>({
    queryKey: ['/api/admin/subscriptions'],
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

  const subscriptions = subscriptionsData?.subscriptions || [];
  const totalActive = subscriptionsData?.totalActive || 0;
  const totalSubscriptions = subscriptionsData?.totalSubscriptions || 0;

  // Check if we're filtering for renewals (upcoming billing dates)
  const isRenewalFilter = new URLSearchParams(window.location.search).get('filter') === 'renewal';

  const filteredSubscriptions = subscriptions.filter((subscription: Subscription) => {
    if (filterStatus === "all") return true;
    
    // Special handling for renewal filter
    if (isRenewalFilter && filterStatus === "active") {
      // Show active subscriptions with billing dates in the next 30 days
      if (subscription.status !== 'active') return false;
      
      if (subscription.nextBillingDate) {
        const nextBilling = new Date(subscription.nextBillingDate);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        return nextBilling <= thirtyDaysFromNow;
      }
      return false;
    }
    
    return subscription.status === filterStatus;
  });

  const handleExport = () => {
    try {
      // Create CSV content from filtered data
      const csvContent = [
        'Owner Name,Email,Company,Status,Plan,Amount,Next Billing,Created,Customer ID,Subscription ID',
        ...filteredSubscriptions.map((sub: Subscription) => 
          `"${sub.ownerName}","${sub.email}","${sub.companyName}","${sub.status}","${sub.plan}","${sub.amount ? formatCurrency(sub.amount) : 'N/A'}","${formatDate(sub.nextBillingDate)}","${formatDate(sub.createdAt)}","${sub.stripeCustomerId || 'N/A'}","${sub.id}"`
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscriptions-${filterStatus !== "all" ? filterStatus + "-" : ""}${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export subscription data",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  // Calculate stats based on ALL subscription data (not filtered display)
  // Monthly revenue and average should always be calculated from active subscriptions only
  const activeSubscriptions = subscriptions.filter((s: Subscription) => s.status === 'active' && s.amount);
  
  // Calculate total active locations from monthly revenue ($1.00 per location)
  const totalActiveLocations = activeSubscriptions
    .reduce((sum: number, s: Subscription) => sum + Number(s.amount), 0) / 1;
  
  const stats = {
    totalActive,
    totalSubscriptions,
    monthlyRevenue: activeSubscriptions
      .reduce((sum: number, s: Subscription) => sum + Number(s.amount), 0),
    totalActiveLocations: totalActiveLocations,
    upcomingBillings: filteredSubscriptions.filter((s: Subscription) => {
      if (!s.nextBillingDate) return false;
      try {
        const nextBilling = new Date(s.nextBillingDate);
        if (isNaN(nextBilling.getTime())) return false;
        const inSevenDays = new Date();
        inSevenDays.setDate(inSevenDays.getDate() + 7);
        return nextBilling <= inSevenDays;
      } catch {
        return false;
      }
    }).length,
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'trialing': return 'secondary';
      case 'past_due': return 'destructive';
      case 'canceled': return 'outline';
      case 'pending_approval': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">
                Subscription Management
                {isRenewalFilter && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Upcoming Renewals
                  </Badge>
                )}
              </h1>
              <p className="text-white/80 text-sm">
                {isRenewalFilter 
                  ? "Subscriptions renewing in the next 30 days" 
                  : "Active subscriptions & billing"
                }
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            data-testid="button-export-subscriptions"
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard title="Monthly Revenue" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-monthly-revenue">
              {formatCurrency(stats.monthlyRevenue)}
            </div>
            <div className="text-xs text-muted-foreground">Active Subscriptions</div>
          </StatCard>

          <StatCard title="Active Subscriptions" className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-subscriptions">
              {stats.totalActive}
            </div>
            <div className="text-xs text-muted-foreground">of {stats.totalSubscriptions} total</div>
          </StatCard>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Active Locations" className="text-center">
            <div className="text-xl font-bold text-foreground" data-testid="text-active-locations">
              {stats.totalActiveLocations}
            </div>
            <div className="text-xs text-muted-foreground">$1.00/month each</div>
          </StatCard>

          <StatCard title="Upcoming Billings" className="text-center">
            <div className="text-xl font-bold text-yellow-600" data-testid="text-upcoming-billings">
              {stats.upcomingBillings}
            </div>
            <div className="text-xs text-muted-foreground">Next 7 Days</div>
          </StatCard>

          <StatCard title="Success Rate" className="text-center">
            <div className="text-xl font-bold text-green-600" data-testid="text-success-rate">
              {stats.totalSubscriptions > 0 ? 
                Math.round((stats.totalActive / stats.totalSubscriptions) * 100) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Active Rate</div>
          </StatCard>
        </div>

        {/* Performance Insights */}
        <StatCard
          title="Billing Insights"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              Recurring revenue
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Annual Revenue</span>
              <span className="text-lg font-semibold text-foreground" data-testid="text-annual-revenue">
                {formatCurrency(stats.monthlyRevenue * 12)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Retention Rate</span>
              <span className="text-lg font-semibold text-green-600">
                95%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Churn Risk</span>
              <span className="text-lg font-semibold text-yellow-600">
                {filteredSubscriptions.filter((s: any) => s.status === 'past_due').length}
              </span>
            </div>
          </div>
        </StatCard>

        {/* Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Status Filter</span>
              </div>
              
              <div className="flex-1 max-w-xs">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subscriptions</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Table */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Subscriptions ({filteredSubscriptions.length})
          </h2>

          {filteredSubscriptions.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No subscriptions found</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table data-testid="table-subscriptions">
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="table-head-owner">Owner</TableHead>
                      <TableHead data-testid="table-head-email">Email</TableHead>
                      <TableHead data-testid="table-head-company">Company</TableHead>
                      <TableHead data-testid="table-head-plan">Plan</TableHead>
                      <TableHead data-testid="table-head-amount">Amount</TableHead>
                      <TableHead data-testid="table-head-status">Status</TableHead>
                      <TableHead data-testid="table-head-next-billing">Next Billing</TableHead>
                      <TableHead data-testid="table-head-created">Created</TableHead>
                      <TableHead data-testid="table-head-customer-id">Customer ID</TableHead>
                      <TableHead data-testid="table-head-subscription-id">Subscription ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((subscription: Subscription, index: number) => (
                      <TableRow key={(subscription as any).ownerId || subscription.id || index} data-testid={`table-row-subscription-${index}`}>
                        <TableCell data-testid={`table-cell-owner-${index}`}>
                          <div className="font-medium">
                            {subscription.ownerName}
                          </div>
                          {subscription.cancelAtPeriodEnd && (
                            <div className="text-xs text-yellow-600 font-medium">
                              ⚠️ Will cancel
                            </div>
                          )}
                          {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                            <div className="text-xs text-blue-600 font-medium">
                              🎯 Trial ends: {formatDate(subscription.trialEnd)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`table-cell-email-${index}`}>
                          <div className="text-sm">
                            {subscription.email}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-company-${index}`}>
                          <div className="text-sm">
                            {subscription.companyName}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-plan-${index}`}>
                          <div className="text-sm capitalize">
                            {subscription.plan}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-amount-${index}`}>
                          <div className="font-semibold">
                            {subscription.amount ? formatCurrency(subscription.amount) : 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-status-${index}`}>
                          <Badge 
                            variant={getStatusBadgeVariant(subscription.status)}
                            data-testid={`badge-subscription-status-${index}`}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {subscription.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`table-cell-next-billing-${index}`}>
                          <div className="text-sm">
                            {subscription.nextBillingDate 
                              ? formatDate(subscription.nextBillingDate)
                              : subscription.currentPeriodEnd
                              ? formatDate(subscription.currentPeriodEnd)
                              : subscription.localEndsAt
                              ? formatDate(subscription.localEndsAt)
                              : 'N/A'
                            }
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-created-${index}`}>
                          <div className="text-sm">
                            {formatDate(subscription.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-customer-id-${index}`}>
                          <div className="text-xs font-mono">
                            {subscription.stripeCustomerId || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`table-cell-subscription-id-${index}`}>
                          <div className="text-xs font-mono">
                            {subscription.id || 'N/A'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}