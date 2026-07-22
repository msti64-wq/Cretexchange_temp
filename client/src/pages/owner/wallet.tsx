import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertTriangle,
  Settings,
  RefreshCw,
  Download,
  DollarSign
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { formatLocalizedCurrency, formatLocalizedDate, translateActivityStatus, useLanguage } from "@/lib/i18n";
import { OwnerColumnOnboardingDialog } from "@/components/OwnerColumnOnboardingDialog";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip, DSTableShell } from "@/components/design-system";

export default function OwnerWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [selectedFundingSource, setSelectedFundingSource] = useState("");
  const [dateRange, setDateRange] = useState<'7days' | '30days' | '90days' | 'all'>('30days');
  const queryClient = useQueryClient();

  // Query for wallet data
  const { data: walletData, isLoading: isWalletLoading } = useQuery<any>({
    queryKey: ['/api/owners/wallet'],
    refetchInterval: 30000,
  });

  // Query for funding sources
  const { data: fundingSources, isLoading: isSourcesLoading } = useQuery<any>({
    queryKey: ['/api/owners/funding-sources'],
    refetchInterval: 30000,
  });

  // Query for transaction history
  const { data: transactions, isLoading: isTransactionsLoading } = useQuery<any>({
    queryKey: ['/api/owners/wallet/transactions', dateRange],
    refetchInterval: 30000,
  });

  // Query for wallet analytics
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery<any>({
    queryKey: ['/api/owners/wallet/analytics', dateRange],
    refetchInterval: 60000,
  });

  // Query for wallet funding feature flag
  const { data: walletFundingFlag } = useQuery<any>({
    queryKey: ['/api/feature-flags/wallet_funding/check'],
    refetchInterval: 60000,
  });

  const isWalletFundingEnabled = walletFundingFlag?.enabled || false;

  const fundWalletMutation = useMutation({
    mutationFn: async (data: { amount: string; fundingSourceId: string }) => {
      const response = await apiRequest("POST", "/api/owners/wallet/fund", data);
      return response.json();
    },
    onSuccess: async (data) => {
      // Check if 3DS/SCA is required
      if (data.requiresAction && data.clientSecret) {
        toast({
          title: "Card verification required",
          description: "Please complete the verification step.",
        });

        // Load Stripe.js if not already loaded
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;
        document.body.appendChild(script);

        script.onload = async () => {
          const stripe = (window as any).Stripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
          
          try {
            // Confirm the payment with 3DS
            const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret);

            if (error) {
              toast({
                title: "Verification failed",
                description: error.message,
                variant: "destructive",
              });
            } else if (paymentIntent?.status === 'succeeded') {
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
            }
          } catch (error: any) {
            toast({
              title: "Payment failed",
              description: error.message,
              variant: "destructive",
            });
          }
        };
      } else if (data.success) {
        // Payment succeeded without 3DS
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
      }
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

  // Financial Connections mutation for instant bank linking
  const linkBankAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/financial-connections/create", {});
      return response.json();
    },
    onSuccess: async (data) => {
      const { clientSecret } = data;
      if (!clientSecret) {
        toast({
          title: "Error",
          description: "Failed to initialize bank linking",
          variant: "destructive",
        });
        return;
      }

      // Load Stripe Financial Connections SDK dynamically
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      document.body.appendChild(script);

      script.onload = async () => {
        const stripe = (window as any).Stripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
        
        try {
          // Launch Financial Connections modal
          const { financialConnectionsSession } = await stripe.collectFinancialConnectionsAccounts({
            clientSecret: clientSecret,
          });

          if (financialConnectionsSession) {
            // Complete the linking on backend
            const completeResponse = await apiRequest("POST", "/api/financial-connections/complete", {
              sessionId: financialConnectionsSession.id
            });
            const result = await completeResponse.json();

            if (result.success) {
              toast({
                title: "Bank account linked!",
                description: "Your bank account has been verified and is ready to use.",
              });
              queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
            }
          }
        } catch (error: any) {
          toast({
            title: "Bank linking failed",
            description: error.message || "Failed to link bank account",
            variant: "destructive",
          });
        }
      };
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start bank linking",
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
              <h1 className="font-semibold text-lg">{t("owner.wallet.title")}</h1>
              <p className="text-white/80 text-sm">{t("owner.wallet.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <DSSectionHeader
          eyebrow={t("owner.wallet.title")}
          title={t("owner.wallet.overview")}
          description={t("owner.wallet.overviewDescription")}
          actions={
            <div className="flex items-center gap-2">
              <DSStatusChip tone={(walletData as any)?.status === "active" ? "success" : "neutral"}>
                {(walletData as any)?.status || 'Active'}
              </DSStatusChip>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsDialog(true)}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4 mr-2" />
                {t("owner.wallet.settings")}
              </Button>
            </div>
          }
        />

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
                    <h3 className="font-semibold text-orange-900 dark:text-orange-100">{t("owner.wallet.lowBalance")}</h3>
                    <p className="text-sm text-orange-700 dark:text-orange-200 mt-1">
                      {t("owner.wallet.currentBalance")} ({formatLocalizedCurrency(balance, language)}) {formatLocalizedCurrency(threshold, language)}.
                      {(walletData as any)?.autoTopupEnabled ? (
                        <span className="font-medium"> Auto top-up is enabled.</span>
                      ) : (
                        <span className="font-medium"> Please fund your wallet to continue service.</span>
                      )}
                    </p>
                    {!(walletData as any)?.autoTopupEnabled && isWalletFundingEnabled && (
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
          <DSCard
            padding="lg"
            elevated
            className="text-white"
            style={{
              backgroundImage: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-blue-100 text-sm">{t("owner.wallet.currentBalance")}</p>
                  <h2 className="text-3xl font-bold" data-testid="text-wallet-balance">
                    {formatLocalizedCurrency((walletData as any)?.balance || 0, language)}
                  </h2>
                </div>
                <Wallet className="w-8 h-8 text-blue-200" />
              </div>
              <div className="flex items-center justify-between">
                <DSStatusChip tone="info">
                  {(walletData as any)?.status || 'Active'}
                </DSStatusChip>
                {isWalletFundingEnabled ? (
                  <Button
                    onClick={handleFundButtonClick}
                    size="sm"
                    className="bg-white text-blue-600 hover:bg-blue-50"
                    data-testid="button-fund-wallet"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Fund
                  </Button>
                ) : (
                  <Button
                    disabled
                    size="sm"
                    className="bg-gray-300 text-gray-500 cursor-not-allowed"
                    data-testid="button-fund-wallet-disabled"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Fund
                  </Button>
                )}
              </div>
            </div>
          </DSCard>

          <DSCard padding="lg">
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("owner.wallet.autoTopup")}</span>
                  <DSStatusChip tone={(walletData as any)?.autoTopupEnabled ? "success" : "neutral"}>
                    {(walletData as any)?.autoTopupEnabled ? t("common.enabled") : t("common.disabled")}
                  </DSStatusChip>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("owner.wallet.lowBalance")}</span>
                  <span className="text-sm font-medium">
                    ${(walletData as any)?.lowBalanceThreshold || 100}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("owner.wallet.fundingSources")}</span>
                  <span className="text-sm font-medium">
                    {(fundingSources as any[])?.length || 0} connected
                  </span>
                </div>
                {isWalletFundingEnabled && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => linkBankAccountMutation.mutate()}
                    disabled={linkBankAccountMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-link-bank"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    {linkBankAccountMutation.isPending ? 'Connecting...' : 'Link Bank Account Instantly'}
                  </Button>
                )}
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
            </div>
          </DSCard>
        </div>

        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DSKpiCard label={t("owner.wallet.totalFunded")} value={formatLocalizedCurrency((analytics as any)?.totalFunded || 0, language)} accentTone="success" />
            <DSKpiCard label={t("owner.wallet.totalSpent")} value={formatLocalizedCurrency((analytics as any)?.totalSpent || 0, language)} accentTone="danger" />
            <DSKpiCard label={t("owner.wallet.averageMonthly")} value={formatLocalizedCurrency((analytics as any)?.avgMonthlySpend || 0, language)} accentTone="info" />
            <DSKpiCard label={t("owner.wallet.transactions")} value={(analytics as any)?.transactionCount || 0} accentTone="accent" />
          </div>
        )}

        {/* Low Balance Warning */}
        {(walletData as any)?.balance && 
         parseFloat((walletData as any).balance) < parseFloat((walletData as any)?.lowBalanceThreshold || '100') && (
          <DSCard className="border-amber-200 bg-amber-50 dark:bg-amber-950/20" padding="md">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Low Wallet Balance
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t("owner.wallet.currentBalance")} {formatLocalizedCurrency(parseFloat((walletData as any)?.lowBalanceThreshold || 100), language)}.
                    Consider funding your wallet to avoid payment delays.
                  </p>
                </div>
              </div>
          </DSCard>
        )}

        {/* Transaction History */}
        <DSTableShell
          title={t("owner.wallet.transactionHistory")}
          description={t("owner.wallet.transactionHistoryDescription")}
          actions={
            <div className="flex items-center space-x-2">
              <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
                <SelectTrigger className="w-32" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">{t("owner.wallet.lastDays", { count: 7 })}</SelectItem>
                  <SelectItem value="30days">{t("owner.wallet.lastDays", { count: 30 })}</SelectItem>
                  <SelectItem value="90days">{t("owner.wallet.lastDays", { count: 90 })}</SelectItem>
                  <SelectItem value="all">{t("owner.wallet.allTime")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" data-testid="button-export">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          }
        >
          <div className="p-6">
            {!(transactions as any[])?.length ? (
              <div className="text-center py-8">
                <RefreshCw className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">{t("owner.wallet.noTransactions")}</h3>
                <p className="text-muted-foreground">
                  No transactions found for the selected time period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {((transactions as any[]) || []).map((transaction: any, index: number) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-3"
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
                          {formatLocalizedDate(transaction.createdAt, language, { dateStyle: "medium", timeStyle: "short" })} •
                          <DSStatusChip tone="neutral" className="ml-2">
                            {translateActivityStatus(transaction.status, t)}
                          </DSStatusChip>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className={`text-right ${getTransactionColor(transaction.transactionType)}`}>
                        <div className="font-semibold">
                          {transaction.transactionType === 'funding' ? '+' : '-'}
                          {formatLocalizedCurrency(transaction.amount, language)}
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
          </div>
        </DSTableShell>
      </main>

      {/* Fund Wallet Dialog */}
      <Dialog open={showFundDialog} onOpenChange={setShowFundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("owner.wallet.fundWallet")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Test Mode Banner */}
            {!(walletData as any)?.stripeTreasuryAccountId && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">{t("owner.wallet.testMode")}</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Stripe Treasury is not available in sandbox. This will simulate wallet funding for testing purposes only.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <Label htmlFor="amount">{t("common.amount")}</Label>
              <Input
                id="amount"
                type="number"
                placeholder={t("owner.wallet.enterAmount")}
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                data-testid="input-fund-amount"
              />
            </div>
            
            {(walletData as any)?.stripeTreasuryAccountId && (
              <div>
                <Label htmlFor="fundingSource">{t("owner.wallet.fundingSources")}</Label>
                <Select value={selectedFundingSource} onValueChange={setSelectedFundingSource}>
                  <SelectTrigger data-testid="select-funding-source">
                    <SelectValue placeholder={t("owner.wallet.selectFundingSource")} />
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
                  ? t("owner.wallet.processing")
                  : (walletData as any)?.stripeTreasuryAccountId 
                    ? t("owner.wallet.fundWallet")
                    : "Simulate Funding (Test)"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowFundDialog(false)}
                data-testid="button-cancel-fund"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("owner.wallet.settings")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="threshold">{t("owner.wallet.lowBalanceThreshold")}</Label>
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
              <Label htmlFor="autoTopup">{t("owner.wallet.enableAutoTopup")}</Label>
            </div>
            {settingsData.autoTopupEnabled && (
              <div>
                <Label htmlFor="topupAmount">{t("owner.wallet.autoTopupAmount")}</Label>
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
                {updateWalletSettingsMutation.isPending ? t("common.saving") : t("owner.wallet.saveSettings")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettingsDialog(false)}
                data-testid="button-cancel-settings"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment account onboarding dialog */}
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
