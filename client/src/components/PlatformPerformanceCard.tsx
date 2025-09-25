import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, CreditCard, Building2, Users } from "lucide-react";

interface PlatformPerformanceCardProps {
  dateRange: number;
}

interface PerformanceData {
  dateRange: number;
  moneyFromOwners: number;
  moneyPaidToDrivers: number;
  withdrawalFees: number;
  subscriptionFees: number;
  totalRevenue: number;
  totalWashouts: number;
  totalWithdrawals: number;
}

export function PlatformPerformanceCard({ dateRange }: PlatformPerformanceCardProps) {
  const { data: performanceData, isLoading, error } = useQuery<PerformanceData>({
    queryKey: ['/api/admin/platform-performance', 'v2', dateRange],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`/api/admin/platform-performance?days=${dateRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 bg-muted rounded w-1/3"></div>
              <div className="h-6 bg-muted rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    console.error('Platform performance error:', error);
    return (
      <div className="text-center py-4 text-destructive">
        <p className="text-sm">Failed to load performance data</p>
        <p className="text-xs text-muted-foreground mt-1">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const data = performanceData || {
    moneyFromOwners: 0,
    moneyPaidToDrivers: 0,
    withdrawalFees: 0,
    subscriptionFees: 0,
    totalRevenue: 0,
    totalWashouts: 0,
    totalWithdrawals: 0
  };

  return (
    <div className="space-y-4">
      {/* Total Revenue Summary */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-800 dark:text-green-200">Total Platform Revenue</span>
          </div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300" data-testid="text-total-platform-revenue">
            {formatCurrency(data.totalRevenue)}
          </div>
        </div>
        <div className="text-sm text-green-600 dark:text-green-400 mt-1">
          Last {dateRange} days
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            <span className="text-muted-foreground">Money from Owners</span>
          </div>
          <span className="text-lg font-semibold text-blue-600" data-testid="text-money-from-owners">
            {formatCurrency(data.moneyFromOwners)}
          </span>
        </div>
        
        <div className="ml-6 text-sm space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">↳ Driver Payments</span>
            <span className="font-medium" data-testid="text-driver-payments">
              {formatCurrency(data.moneyPaidToDrivers)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">↳ Service Fees</span>
            <span className="font-medium text-green-600" data-testid="text-service-fees">
              {formatCurrency(data.moneyFromOwners - data.moneyPaidToDrivers)}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-orange-500" />
            <span className="text-muted-foreground">Withdrawal Fees</span>
          </div>
          <span className="text-lg font-semibold text-orange-600" data-testid="text-withdrawal-fees">
            {formatCurrency(data.withdrawalFees)}
          </span>
        </div>
        

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-muted-foreground">Subscription Fees</span>
          </div>
          <span className="text-lg font-semibold text-purple-600" data-testid="text-subscription-fees">
            {formatCurrency(data.subscriptionFees)}
          </span>
        </div>
        
      </div>

      {/* Activity Summary */}
      <div className="pt-3 border-t border-border">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-xl font-bold text-foreground" data-testid="text-total-washouts">
              {data.totalWashouts}
            </div>
            <div className="text-xs text-muted-foreground">Total Washouts</div>
          </div>
          <div>
            <div className="text-xl font-bold text-foreground" data-testid="text-total-withdrawals">
              {data.totalWithdrawals}
            </div>
            <div className="text-xs text-muted-foreground">Total Withdrawals</div>
          </div>
        </div>
      </div>
    </div>
  );
}