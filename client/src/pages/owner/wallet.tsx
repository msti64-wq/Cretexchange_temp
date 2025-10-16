import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { useLocation } from "wouter";
import { 
  Wallet, 
  ArrowLeft, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  CreditCard, 
  Building2, 
  TrendingUp, 
  AlertTriangle,
  Settings,
  RefreshCw,
  Download,
  Calendar,
  DollarSign
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { OwnerColumnOnboardingDialog } from "@/components/OwnerColumnOnboardingDialog";

export default function OwnerWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [selectedFundingSource, setSelectedFundingSource] = useState("");
  const [dateRange, setDateRange] = useState<'7days' | '30days' | '90days' | 'all'>('30days');
  const queryClient = useQueryClient();

  // Query for wallet data
  const { data: walletData, isLoading: isWalletLoading } = useQuery({
    queryKey: ['/api/owners/wallet'],
    refetchInterval: 30000,
  });

  // Query for funding sources
  const { data: fundingSources, isLoading: isSourcesLoading } = useQuery({
    queryKey: ['/api/owners/funding-sources'],
    refetchInterval: 30000,
  });

  // Query for transaction history
  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
    queryKey: ['/api/owners/wallet/transactions', dateRange],
    refetchInterval: 30000,
  });

  // Query for wallet analytics
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ['/api/owners/wallet/analytics', dateRange],
    refetchInterval: 60000,
  });

  const fundWalletMutation = useMutation({
    mutationFn: async (data: { amount: string; fundingSourceId: string }) => {
      const response = await apiRequest("POST", "/api/owners/wallet/fund", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Wallet funded successfully",
        description: "Your wallet balance has been updated.",
      });
      setShowFundDialog(false);
      setFundAmount("");
      setSelectedFundingSource("");
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet/analytics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to fund wallet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const simulateFundingMutation = useMutation({
    mutationFn: async (data: { amount: string }) => {
      const response = await apiRequest("POST", "/api/owners/wallet/simulate-funding", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Wallet funded successfully (Test Mode)",
        description: "Simulated funding completed. This is for testing only.",
      });
      setShowFundDialog(false);
      setFundAmount("");
      setSelectedFundingSource("");
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet/analytics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to simulate funding",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateWalletSettingsMutation = useMutation({
    mutationFn: async (data: { lowBalanceThreshold: string; autoTopupEnabled: boolean; autoTopupAmount: string }) => {
      const response = await apiRequest("PUT", "/api/owners/wallet/settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Wallet settings updated",
        description: "Your auto top-up preferences have been saved.",
      });
      setShowSettingsDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const simulateSettlementMutation = useMutation({
    mutationFn: async (columnTransferId: string) => {
      const response = await apiRequest("POST", "/api/owners/wallet/simulate-settlement", {
        columnTransferId
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Transfer settled",
        description: "The ACH transfer has been settled and your balance updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet/transactions'] });
    },
    onError: (error: any) => {
      toast({
        title: "Settlement failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const columnOnboardingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/column/onboard", {
        companyName: data.companyName,
        businessLicense: data.businessLicense,
        taxId: data.taxId,
        address: {
          line1: data.addressLine1,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode
        }
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment account set up successfully",
        description: "You can now fund your wallet and process payments.",
      });
      setShowOnboardingDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set up payment account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [settingsData, setSettingsData] = useState({
    lowBalanceThreshold: '',
    autoTopupEnabled: false,
    autoTopupAmount: '',
  });

  const handleFundButtonClick = () => {
    // Check if owner needs Stripe onboarding first
    if (!(walletData as any)?.hasStripeAccount) {
      setShowOnboardingDialog(true);
      return;
    }
    setShowFundDialog(true);
  };

  const handleFundWallet = () => {
    if (!fundAmount) {
      toast({
        title: "Missing information",
        description: "Please enter an amount.",
        variant: "destructive",
      });
      return;
    }

    // Check if Treasury is available (wallet status is active and has Treasury account)
    const hasTreasury = (walletData as any)?.stripeTreasuryAccountId;
    
    if (hasTreasury && selectedFundingSource) {
      // Use real Treasury funding
      fundWalletMutation.mutate({
        amount: fundAmount,
        fundingSourceId: selectedFundingSource,
      });
    } else {
      // Use simulated funding for testing
      simulateFundingMutation.mutate({
        amount: fundAmount,
      });
    }
  };

  const handleUpdateSettings = () => {
    updateWalletSettingsMutation.mutate(settingsData);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'funding':
        return <ArrowDownRight className="w-4 h-4 text-green-600" />;
      case 'payment':
        return <ArrowUpRight className="w-4 h-4 text-red-600" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-blue-600" />;
      case 'fee':
        return <ArrowUpRight className="w-4 h-4 text-orange-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'funding':
        return 'text-green-600';
      case 'payment':
      case 'withdrawal':
        return 'text-red-600';
      case 'fee':
        return 'text-orange-600';
      default:
        return 'text-gray-600';
    }
  };

  const isLoading = isWalletLoading || isSourcesLoading || isTransactionsLoading || isAnalyticsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            className="text-white hover:bg-white/20 p-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Wallet Dashboard</h1>
              <p className="text-white/80 text-sm">Column Banking</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettingsDialog(true)}
                className="text-white hover:bg-white/20 p-2"
                data-testid="button-settings"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Configure low balance alerts & auto top-up</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Low Balance Warning Banner */}
        {(() => {
          const balance = parseFloat((walletData as any)?.balance || '0');
          const threshold = parseFloat((walletData as any)?.lowBalanceThreshold || '100');
          const isLowBalance = balance < threshold;
          
          if (isLowBalance) {
            return (
              <div className="bg-orange-50 dark:bg-orange-950 border-l-4 border-orange-500 p-4 rounded-r-lg" data-testid="alert-low-balance">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-orange-900 dark:text-orange-100">Low Balance Alert</h3>
                    <p className="text-sm text-orange-700 dark:text-orange-200 mt-1">
                      Your wallet balance ({formatCurrency(balance)}) is below your threshold of {formatCurrency(threshold)}. 
                      {(walletData as any)?.autoTopupEnabled ? (
                        <span className="font-medium"> Auto top-up is enabled.</span>
                      ) : (
                        <span className="font-medium"> Please fund your wallet to continue service.</span>
                      )}
                    </p>
                    {!(walletData as any)?.autoTopupEnabled && (
                      <Button
                        size="sm"
                        onClick={handleFundButtonClick}
                        className="mt-3 bg-orange-600 hover:bg-orange-700 text-white"
                        data-testid="button-fund-from-alert"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Fund Wallet Now
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Wallet Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-blue-100 text-sm">Current Balance</p>
                  <h2 className="text-3xl font-bold" data-testid="text-wallet-balance">
                    {formatCurrency((walletData as any)?.balance || 0)}
                  </h2>
                </div>
                <Wallet className="w-8 h-8 text-blue-200" />
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="bg-blue-500 text-white">
                  {(walletData as any)?.status || 'Active'}
                </Badge>
                <Button
                  onClick={handleFundButtonClick}
                  size="sm"
                  className="bg-white text-blue-600 hover:bg-blue-50"
                  data-testid="button-fund-wallet"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Fund
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Auto Top-up</span>
                  <Badge variant={(walletData as any)?.autoTopupEnabled ? 'default' : 'secondary'}>
                    {(walletData as any)?.autoTopupEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Low Balance Alert</span>
                  <span className="text-sm font-medium">
                    ${(walletData as any)?.lowBalanceThreshold || 100}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Funding Sources</span>
                  <span className="text-sm font-medium">
                    {(fundingSources as any[])?.length || 0} connected
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation('/payment-methods')}
                  className="w-full"
                  data-testid="button-manage-sources"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Manage Sources
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <ArrowDownRight className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Funded</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatCurrency((analytics as any)?.totalFunded || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <ArrowUpRight className="w-4 h-4 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                    <p className="text-lg font-semibold text-red-600">
                      {formatCurrency((analytics as any)?.totalSpent || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Monthly</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {formatCurrency((analytics as any)?.avgMonthlySpend || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Transactions</p>
                    <p className="text-lg font-semibold text-purple-600">
                      {(analytics as any)?.transactionCount || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Low Balance Warning */}
        {(walletData as any)?.balance && 
         parseFloat((walletData as any).balance) < parseFloat((walletData as any)?.lowBalanceThreshold || '100') && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Low Wallet Balance
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Your wallet balance is below the {formatCurrency(parseFloat((walletData as any)?.lowBalanceThreshold || 100))} threshold. 
                    Consider funding your wallet to avoid payment delays.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <RefreshCw className="w-5 h-5 mr-2" />
                Transaction History
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
                  <SelectTrigger className="w-32" data-testid="select-date-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">Last 7 days</SelectItem>
                    <SelectItem value="30days">Last 30 days</SelectItem>
                    <SelectItem value="90days">Last 90 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" data-testid="button-export">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!(transactions as any[])?.length ? (
              <div className="text-center py-8">
                <RefreshCw className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">No Transactions</h3>
                <p className="text-muted-foreground">
                  No transactions found for the selected time period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {((transactions as any[]) || []).map((transaction: any, index: number) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`transaction-${index}`}
                  >
                    <div className="flex items-center space-x-3">
                      {getTransactionIcon(transaction.transactionType)}
                      <div>
                        <div className="font-medium">
                          {transaction.description || 
                           `${transaction.transactionType.charAt(0).toUpperCase() + transaction.transactionType.slice(1)}`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString()} • 
                          <Badge variant="outline" className="ml-2">
                            {transaction.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className={`text-right ${getTransactionColor(transaction.transactionType)}`}>
                        <div className="font-semibold">
                          {transaction.transactionType === 'funding' ? '+' : '-'}
                          {formatCurrency(transaction.amount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {transaction.externalTransactionId && 
                           `ID: ${transaction.externalTransactionId.slice(-6)}`}
                        </div>
                      </div>
                      {transaction.status === 'pending' && transaction.externalTransactionId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => simulateSettlementMutation.mutate(transaction.externalTransactionId)}
                          disabled={simulateSettlementMutation.isPending}
                          data-testid={`button-settle-${index}`}
                        >
                          {simulateSettlementMutation.isPending ? 'Settling...' : 'Settle'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Fund Wallet Dialog */}
      <Dialog open={showFundDialog} onOpenChange={setShowFundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fund Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Test Mode Banner */}
            {!(walletData as any)?.stripeTreasuryAccountId && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">Test Mode</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Stripe Treasury is not available in sandbox. This will simulate wallet funding for testing purposes only.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                data-testid="input-fund-amount"
              />
            </div>
            
            {(walletData as any)?.stripeTreasuryAccountId && (
              <div>
                <Label htmlFor="fundingSource">Funding Source</Label>
                <Select value={selectedFundingSource} onValueChange={setSelectedFundingSource}>
                  <SelectTrigger data-testid="select-funding-source">
                    <SelectValue placeholder="Select funding source" />
                  </SelectTrigger>
                  <SelectContent>
                    {((fundingSources as any[]) || []).map((source: any) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.sourceType === 'credit_card' ? (
                          <div className="flex items-center space-x-2">
                            <CreditCard className="w-4 h-4" />
                            <span>{source.cardBrand || 'Card'} ****{source.cardLast4}</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <Building2 className="w-4 h-4" />
                            <span>{source.bankName} ****{source.accountNumberLast4}</span>
                          </div>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex space-x-2 pt-4">
              <Button
                onClick={handleFundWallet}
                disabled={fundWalletMutation.isPending || simulateFundingMutation.isPending}
                data-testid="button-confirm-fund"
              >
                {(fundWalletMutation.isPending || simulateFundingMutation.isPending) 
                  ? "Processing..." 
                  : (walletData as any)?.stripeTreasuryAccountId 
                    ? "Fund Wallet" 
                    : "Simulate Funding (Test)"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowFundDialog(false)}
                data-testid="button-cancel-fund"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="threshold">Low Balance Threshold ($)</Label>
              <Input
                id="threshold"
                type="number"
                placeholder="100"
                value={settingsData.lowBalanceThreshold}
                onChange={(e) => setSettingsData({...settingsData, lowBalanceThreshold: e.target.value})}
                data-testid="input-threshold"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoTopup"
                checked={settingsData.autoTopupEnabled}
                onChange={(e) => setSettingsData({...settingsData, autoTopupEnabled: e.target.checked})}
                data-testid="checkbox-auto-topup"
              />
              <Label htmlFor="autoTopup">Enable Auto Top-up</Label>
            </div>
            {settingsData.autoTopupEnabled && (
              <div>
                <Label htmlFor="topupAmount">Auto Top-up Amount ($)</Label>
                <Input
                  id="topupAmount"
                  type="number"
                  placeholder="500"
                  value={settingsData.autoTopupAmount}
                  onChange={(e) => setSettingsData({...settingsData, autoTopupAmount: e.target.value})}
                  data-testid="input-topup-amount"
                />
              </div>
            )}
            <div className="flex space-x-2 pt-4">
              <Button
                onClick={handleUpdateSettings}
                disabled={updateWalletSettingsMutation.isPending}
                data-testid="button-save-settings"
              >
                {updateWalletSettingsMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettingsDialog(false)}
                data-testid="button-cancel-settings"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Column Onboarding Dialog */}
      <OwnerColumnOnboardingDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
        onSubmit={async (data) => {
          await columnOnboardingMutation.mutateAsync(data);
        }}
        isPending={columnOnboardingMutation.isPending}
      />

      <MobileNav role="owner" />
    </div>
  );
}