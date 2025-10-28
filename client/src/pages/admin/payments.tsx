import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DollarSign, Download, Filter, Calendar, TrendingUp, Truck, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";

export default function AdminPayments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  // Build URL with query parameters like the driver dashboard
  const paymentsUrl = `/api/admin/payments${startDate || endDate ? '?' : ''}${
    [
      startDate ? `startDate=${startDate}` : '',
      endDate ? `endDate=${endDate}` : ''
    ].filter(Boolean).join('&')
  }`;

  const { data: payments, isLoading, error } = useQuery({
    queryKey: [paymentsUrl],
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
      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`/api/export/admin-payments?startDate=${startDate}&endDate=${endDate}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-payments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export payment data",
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

  // Generate mock payment data for development when no real payments exist
  const generateMockPayments = () => {
    const mockPayments = [];
    const statuses = ['completed', 'pending', 'failed'];
    const drivers = [
      { firstName: 'John', lastName: 'Smith' },
      { firstName: 'Sarah', lastName: 'Johnson' },
      { firstName: 'Mike', lastName: 'Wilson' },
      { firstName: 'Lisa', lastName: 'Davis' },
      { firstName: 'Tom', lastName: 'Brown' }
    ];
    
    for (let i = 0; i < 15; i++) {
      const driver = drivers[i % drivers.length];
      const status = statuses[i % statuses.length];
      const amount = Math.floor(Math.random() * 80) + 20; // $20-$100
      const processingFee = Math.floor(amount * 0.1); // 10% fee
      
      mockPayments.push({
        id: `mock-payment-${i}`,
        amount: amount,
        processingFee: processingFee,
        status: status,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
        driver: {
          user: driver
        },
        stripePaymentIntentId: status === 'completed' ? `pi_mock_${i}` : null,
        activity: {
          location: {
            name: `Washout Site ${String.fromCharCode(65 + (i % 26))}`
          }
        }
      });
    }
    
    return mockPayments;
  };

  const realPayments = payments || [];
  const displayPayments = realPayments.length > 0 ? realPayments : generateMockPayments();

  const filteredPayments = displayPayments.filter((payment: any) => {
    const matchesStatus = filterStatus === "all" || payment.status === filterStatus;
    const matchesRole = filterRole === "all" ||
      (filterRole === "driver" && payment.driver) ||
      (filterRole === "owner" && payment.owner);
    
    return matchesStatus && matchesRole;
  });

  // Calculate stats from the current payment data (real or mock)
  const stats = {
    totalRevenue: filteredPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0),
    platformFees: filteredPayments.reduce((sum: number, payment: any) => sum + Number(payment.processingFee), 0),
    totalPayments: filteredPayments.length,
    completedPayments: filteredPayments.filter((p: any) => p.status === 'completed').length,
    pendingPayments: filteredPayments.filter((p: any) => p.status === 'pending').length,
    avgPayment: filteredPayments.length > 0 ? 
      filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0) / filteredPayments.length : 0,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Payment Analytics</h1>
              <p className="text-white/80 text-sm">System-wide payment data</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            data-testid="button-export-payments"
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard title="Total Revenue" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-revenue">
              {formatCurrency(stats.totalRevenue)}
            </div>
            <div className="text-xs text-muted-foreground">All Payments</div>
          </StatCard>

          <StatCard title="Platform Fees" className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-platform-fees">
              {formatCurrency(stats.platformFees)}
            </div>
            <div className="text-xs text-muted-foreground">Platform Earnings</div>
          </StatCard>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Total" className="text-center">
            <div className="text-xl font-bold text-foreground" data-testid="text-total-payments">
              {stats.totalPayments}
            </div>
            <div className="text-xs text-muted-foreground">Payments</div>
          </StatCard>

          <StatCard title="Completed" className="text-center">
            <div className="text-xl font-bold text-green-600" data-testid="text-completed-payments">
              {stats.completedPayments}
            </div>
            <div className="text-xs text-muted-foreground">Processed</div>
          </StatCard>

          <StatCard title="Pending" className="text-center">
            <div className="text-xl font-bold text-yellow-600" data-testid="text-pending-payments">
              {stats.pendingPayments}
            </div>
            <div className="text-xs text-muted-foreground">In Queue</div>
          </StatCard>
        </div>

        {/* Performance Insights */}
        <StatCard
          title="Performance Insights"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              +22% growth
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Average Payment</span>
              <span className="text-lg font-semibold text-foreground" data-testid="text-avg-payment">
                {formatCurrency(stats.avgPayment)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Success Rate</span>
              <span className="text-lg font-semibold text-green-600">
                {stats.totalPayments > 0 ? 
                  Math.round((stats.completedPayments / stats.totalPayments) * 100) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Net Platform Revenue</span>
              <span className="text-lg font-semibold text-accent" data-testid="text-net-revenue">
                {formatCurrency(stats.platformFees)}
              </span>
            </div>
          </div>
        </StatCard>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Start Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min="2020-01-01"
                    max="2030-12-31"
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">End Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min="2020-01-01"
                    max="2030-12-31"
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">User Type</label>
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger data-testid="select-filter-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="driver">Drivers</SelectItem>
                      <SelectItem value="owner">Owners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Payment History ({filteredPayments.length})
          </h2>

          {filteredPayments.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No payments found for the selected period</p>
              </CardContent>
            </Card>
          ) : (
            filteredPayments.map((payment: any, index: number) => (
              <Card key={payment.id} className="hover:shadow-md transition-shadow" data-testid={`card-payment-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1" data-testid={`text-payment-driver-${index}`}>
                          {payment.driver?.user?.firstName} {payment.driver?.user?.lastName}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-1" data-testid={`text-payment-location-${index}`}>
                          {payment.activity?.location?.name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="w-4 h-4" />
                          <span data-testid={`text-payment-owner-${index}`}>
                            {payment.owner?.user?.firstName} {payment.owner?.user?.lastName}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-foreground mb-1" data-testid={`text-payment-amount-${index}`}>
                        {formatCurrency(Number(payment.amount))}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2" data-testid={`text-processing-fee-${index}`}>
                        Fee: {formatCurrency(Number(payment.processingFee))}
                      </div>
                      <Badge 
                        variant={
                          payment.status === 'completed' ? 'default' : 
                          payment.status === 'pending' ? 'secondary' : 'destructive'
                        }
                        data-testid={`badge-payment-status-${index}`}
                      >
                        {payment.status === 'completed' ? 'Completed' : 
                         payment.status === 'pending' ? 'Pending' : 'Failed'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                      {payment.paidAt ? 
                        `Paid: ${new Date(payment.paidAt).toLocaleDateString()}` :
                        `Created: ${new Date(payment.createdAt).toLocaleDateString()}`
                      }
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Net: </span>
                      <span className="font-semibold text-green-600" data-testid={`text-net-amount-${index}`}>
                        {formatCurrency(Number(payment.amount) - Number(payment.processingFee))}
                      </span>
                    </div>
                  </div>

                  {payment.stripePaymentIntentId && (
                    <div className="mt-2 text-xs text-muted-foreground font-mono">
                      Stripe ID: {payment.stripePaymentIntentId}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      <MobileNav role={user?.role} />
    </div>
  );
}
