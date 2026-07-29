import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DriverTermsDialog } from "@/components/DriverTermsDialog";
import { DebitCardRequestDialog } from "@/components/DebitCardRequestDialog";
import { 
  Wallet, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  CreditCard,
  Receipt,
  TrendingUp,
  Banknote,
  Minus,
  User
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useDriverPaymentLifecycle } from "@/hooks/useDriverPaymentLifecycle";
import { DriverLifecycleSummary } from "@/components/driver/DriverLifecycleSummary";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip, DSTableShell } from "@/components/design-system";

interface WalletBalance {
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
}

interface WalletTransaction {
  id: string;
  amount: number;
  direction: 'credit' | 'debit' | 'fee';
  balanceAfter: number;
  sourceType: 'washout' | 'withdrawal' | 'adjustment';
  description: string;
  status: 'pending' | 'posted' | 'failed';
  createdAt: string;
  metadata?: any;
}

interface ColumnOnboardingStatus {
  isOnboarded: boolean;
  entityId?: string | null;
  bankAccountId?: string | null;
  accountLast4?: string | null;
}

export default function DriverWallet() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { language, t } = useLanguage();
  const driverLifecycle = useDriverPaymentLifecycle();
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showDebitCardDialog, setShowDebitCardDialog] = useState(false);
  const pageSize = 20;

  // Check if debit card feature is enabled (requires Stripe Issuing/Treasury)
  const { enabled: issuingEnabled } = useFeatureFlag(FEATURE_FLAGS.ISSUING_ENABLED);

  // Fetch wallet balance
  const { data: walletBalance, isLoading: balanceLoading, refetch: refetchBalance } = useQuery<WalletBalance>({
    queryKey: ['/api/wallet/balance'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch driver terms status
  const { data: termsStatus, isLoading: termsLoading, isError: termsError } = useQuery<{hasAgreed: boolean; agreedAt: string | null}>({
    queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`],
  });

  // Fetch wallet transactions
  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['/api/wallet/transactions', currentPage],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/wallet/transactions?page=${currentPage}&limit=${pageSize}`);
      return await response.json() as {
        transactions: WalletTransaction[];
        total: number;
        totalPages: number;
        currentPage: number;
      };
    },
    placeholderData: (previousData) => previousData,
  });

  // Fetch payment account onboarding status
  const { data: columnStatus, isLoading: columnLoading, refetch: refetchColumnStatus } = useQuery<ColumnOnboardingStatus>({
    queryKey: ['/api/column/status'],
  });

  // Fetch user profile for debit card pre-population
  const { data: userProfile } = useQuery<any>({
    queryKey: ['/api/profile'],
  });

  // Fetch debit card status (only if issuing is enabled)
  const { data: debitCardStatus, refetch: refetchDebitCard } = useQuery<{
    hasCard: boolean;
    card?: {
      id: string;
      cardType: string;
      cardLast4: string;
      cardStatus: string;
      expirationMonth: string;
      expirationYear: string;
      requestedAt: string;
      issuedAt: string | null;
    };
  }>({
    queryKey: ['/api/drivers/debit-card'],
    enabled: issuingEnabled, // Only fetch if feature is enabled
  });

  // Withdrawal mutation
  const withdrawalMutation = useMutation({
    mutationFn: async (amount: number) => {
      return await apiRequest("POST", "/api/wallet/withdraw", { amount });
    },
    onSuccess: () => {
      toast({
        title: t("driver.wallet.withdrawalRequested"),
        description: t("driver.wallet.withdrawalRequestedDescription"),
      });
      setWithdrawalAmount("");
      refetchBalance();
      refetchTransactions();
    },
    onError: (error: any) => {
      toast({
        title: t("driver.wallet.withdrawalFailed"),
        description: error.message || t("driver.wallet.withdrawalFailedDescription"),
        variant: "destructive",
      });
    },
  });


  // Track when account becomes verified to show success message
  const [previousIsOnboarded, setPreviousIsOnboarded] = useState<boolean | null>(null);
  
  useEffect(() => {
    const currentIsOnboarded = columnStatus?.isOnboarded === true;
      
    if (previousIsOnboarded === false && currentIsOnboarded === true) {
      toast({
        title: t("driver.wallet.accountConnected"),
        description: t("driver.wallet.accountConnectedDescription"),
      });
    }
    
    if (previousIsOnboarded !== null) {
      setPreviousIsOnboarded(currentIsOnboarded);
    } else {
      setPreviousIsOnboarded(currentIsOnboarded);
    }
  }, [columnStatus, toast, previousIsOnboarded, t]);

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  const handleWithdrawal = () => {
    // Handle terms status loading and error states
    if (termsLoading) {
      toast({
        title: t("driver.wallet.termsLoading"),
        description: t("driver.wallet.termsLoadingDescription"),
      });
      return;
    }

    if (termsError) {
      toast({
        title: t("driver.wallet.termsError"),
        description: t("driver.wallet.termsErrorDescription"),
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount < 5) {
      toast({
        title: t("driver.wallet.invalidAmount"),
        description: t("driver.wallet.minimumWithdrawal"),
        variant: "destructive",
      });
      return;
    }

    if (amount > (walletBalance?.availableBalance || 0)) {
      toast({
        title: t("driver.wallet.insufficientFunds"),
        description: t("driver.wallet.insufficientFundsDescription"),
        variant: "destructive",
      });
      return;
    }

    // Check if driver has agreed to terms
    if (!termsStatus?.hasAgreed) {
      setShowTermsDialog(true);
      return;
    }

    withdrawalMutation.mutate(amount);
  };

  const handleTermsAccepted = () => {
    // Re-validate amount and balance after terms acceptance
    const amount = parseFloat(withdrawalAmount);
    
    if (isNaN(amount) || amount < 5) {
      toast({
        title: t("driver.wallet.invalidAmount"),
        description: t("driver.wallet.validWithdrawalAmount"),
        variant: "destructive",
      });
      return;
    }

    if (amount > (walletBalance?.availableBalance || 0)) {
      toast({
        title: t("driver.wallet.insufficientFunds"),
        description: t("driver.wallet.insufficientFundsDescription"),
        variant: "destructive",
      });
      return;
    }

    withdrawalMutation.mutate(amount);
  };

  const refreshAllData = () => {
    refetchBalance();
    refetchTransactions();
    driverLifecycle.refresh();
    refetchColumnStatus();
    toast({
      title: t("driver.wallet.refreshed"),
      description: t("driver.wallet.refreshedDescription"),
    });
  };

  // Calculate withdrawal fee and net amount based on tiered structure
  const withdrawAmount = parseFloat(withdrawalAmount) || 0;
  // Under $10.00: $1.00 flat fee, $10.00+: 10% fee
  const feeAmount = withdrawAmount < 10.00 ? 1.00 : withdrawAmount * 0.1;
  const netAmount = withdrawAmount - feeAmount;

  const getTransactionIcon = (transaction: WalletTransaction) => {
    switch (transaction.direction) {
      case 'credit':
        return <ArrowDownLeft className="w-4 h-4 text-green-600" />;
      case 'debit':
        return <ArrowUpRight className="w-4 h-4 text-red-600" />;
      case 'fee':
        return <Minus className="w-4 h-4 text-amber-600" />;
      default:
        return <Receipt className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTransactionColor = (transaction: WalletTransaction) => {
    switch (transaction.direction) {
      case 'credit':
        return 'text-green-600';
      case 'debit':
        return 'text-red-600';
      case 'fee':
        return 'text-amber-600';
      default:
        return 'text-gray-600';
    }
  };

  const canWithdraw = columnStatus?.isOnboarded === true;

  if (balanceLoading || columnLoading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <DriverHeader />
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background pb-20 text-foreground">
      <DriverHeader />

      <div className="p-4 space-y-6">
        {/* Page Header */}
        <DSSectionHeader
          title={t("driver.wallet.title")}
          description={t("driver.wallet.description")}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAllData}
              className="flex items-center space-x-2"
              data-testid="button-refresh-wallet"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t("common.retry")}</span>
            </Button>
          }
        />

        <DriverLifecycleSummary lifecycle={driverLifecycle.lifecycle} isLoading={driverLifecycle.isLoading} paymentError={driverLifecycle.paymentError} onViewActivity={() => setLocation('/activity')} variant="wallet" />
        <div className="grid grid-cols-1 gap-3">
          <DSKpiCard label={t("driver.wallet.balance")} value={formatCurrency(walletBalance?.availableBalance || 0)} detail={t("driver.wallet.balanceDetail")} accentTone="success" data-testid="text-available-balance" />
        </div>

        {/* Bank Account Status */}
        <DSCard padding="lg">
          <DSSectionHeader
            title={t("driver.wallet.paymentAccountStatus")}
            eyebrow={<CreditCard className="inline-block h-4 w-4 align-[-2px]" />}
          />
          <div className="mt-4">
            {!columnStatus?.isOnboarded ? (
              <div className="text-center py-6">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">{t("driver.wallet.paymentSetupRequired")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("driver.wallet.paymentSetupDescription")}
                </p>
                <Button
                  onClick={() => window.location.href = '/driver/profile'}
                  data-testid="button-go-to-profile"
                >
                  <User className="w-4 h-4 mr-2" />
                  {t("driver.wallet.goToProfile")}
                </Button>
                <p className="text-xs text-muted-foreground mt-3">
                  {t("driver.wallet.paymentSetupHelp")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("driver.wallet.accountStatus")}</span>
                  <DSStatusChip tone="success" data-testid="badge-account-status">
                    {t("driver.wallet.connectedReady")}
                  </DSStatusChip>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">{t("driver.wallet.bankAccountConnected")}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">{t("driver.wallet.identityVerified")}</span>
                  </div>
                  {columnStatus?.accountLast4 && (
                    <div className="flex items-center space-x-2 col-span-2">
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {t("driver.wallet.accountEnding", { last4: columnStatus.accountLast4 })}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    <p className="text-sm text-foreground/85">
                      {t("driver.wallet.accountReadyForPayments")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DSCard>

        {/* Withdrawal Request Form */}
        <DSCard padding="lg">
          <DSSectionHeader
            title={t("driver.wallet.requestWithdrawal")}
            description={
              !termsStatus?.hasAgreed 
                ? t("driver.wallet.withdrawalFeeDescription")
                : t("driver.wallet.withdrawalDescription")
            }
          />
          <div className="mt-4 space-y-4">
            {!canWithdraw ? (
              <div className="text-center py-6 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t("driver.wallet.completeVerification")}</p>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="withdrawal-amount">{t("driver.wallet.withdrawalAmount")}</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="withdrawal-amount"
                      type="number"
                      placeholder="0.00"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      className="pl-10"
                      min="5"
                      step="0.01"
                      data-testid="input-withdrawal-amount"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("driver.wallet.minimumWithdrawal")}
                  </p>
                </div>

                {withdrawAmount > 0 && (
                  <DSCard padding="sm" elevated={false} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t("driver.wallet.withdrawalAmount")}</span>
                      <span data-testid="text-withdrawal-amount">{formatCurrency(withdrawAmount)}</span>
                    </div>
                    {!termsStatus?.hasAgreed && (
                      <div className="flex justify-between text-sm text-amber-600">
                        <span>{t("driver.wallet.processingFee", { fee: withdrawAmount < 10 ? "$1" : "10%" })}</span>
                        <span data-testid="text-fee-amount">-{formatCurrency(feeAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>{t("driver.wallet.youWillReceive")}</span>
                      <span className="text-green-600" data-testid="text-net-amount">
                        {formatCurrency(netAmount)}
                      </span>
                    </div>
                  </DSCard>
                )}

                <Button
                  onClick={handleWithdrawal}
                  disabled={
                    withdrawalMutation.isPending ||
                    termsLoading ||
                    !withdrawalAmount ||
                    parseFloat(withdrawalAmount) < 5 ||
                    parseFloat(withdrawalAmount) > (walletBalance?.availableBalance || 0)
                  }
                  className="w-full"
                  data-testid="button-submit-withdrawal"
                >
                  {withdrawalMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Banknote className="w-4 h-4 mr-2" />
                  )}
                  {t("driver.wallet.requestWithdrawal")}
                </Button>

                <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium text-foreground/90">
                        {t("driver.wallet.withdrawalArrival")}
                      </p>
                      
                      {issuingEnabled && debitCardStatus?.hasCard ? (
                        <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">
                                Debit Card {debitCardStatus.card?.cardStatus === 'active' ? 'Active' : 'Requested'}
                              </p>
                              <p className="text-sm text-foreground/75">
                                {debitCardStatus.card?.cardType === 'virtual' ? 'Virtual' : 'Physical'} Card •••• {debitCardStatus.card?.cardLast4}
                              </p>
                              <p className="mt-1 text-xs text-foreground/65">
                                Expires {debitCardStatus.card?.expirationMonth}/{debitCardStatus.card?.expirationYear}
                              </p>
                            </div>
                            <DSStatusChip tone="success">{debitCardStatus.card?.cardStatus}</DSStatusChip>
                          </div>
                        </div>
                      ) : issuingEnabled ? (
                        <>
                          <p className="text-sm text-foreground/85">
                            <strong>Need instant access?</strong> Request a debit card linked to your wallet for immediate access to your funds at ATMs and stores.
                          </p>
                          <p className="text-xs text-foreground/65 mt-1">
                            Physical cards typically arrive within 7-10 business days at your registered address.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 border-border bg-background/60 hover:bg-background"
                            onClick={() => setShowDebitCardDialog(true)}
                            data-testid="button-request-debit-card"
                          >
                            <CreditCard className="w-4 h-4 mr-2" />
                            Request Debit Card
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </DSCard>

        {/* Debit Card Section - Only show if Stripe Issuing is enabled */}
        {issuingEnabled && (
          <DSCard padding="lg">
            <DSSectionHeader
              title="Debit Card"
              description="Instant access to your wallet funds"
              eyebrow={<CreditCard className="inline-block h-4 w-4 align-[-2px]" />}
            />
            <div className="space-y-4">
              {debitCardStatus?.hasCard ? (
                <DSCard padding="md" elevated={false}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        Debit Card {debitCardStatus.card?.cardStatus === 'active' ? 'Active' : 'Requested'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {debitCardStatus.card?.cardType === 'virtual' ? 'Virtual' : 'Physical'} Card •••• {debitCardStatus.card?.cardLast4}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expires {debitCardStatus.card?.expirationMonth}/{debitCardStatus.card?.expirationYear}
                      </p>
                    </div>
                    <DSStatusChip tone={debitCardStatus.card?.cardStatus === 'active' ? 'success' : 'warning'}>
                      {debitCardStatus.card?.cardStatus}
                    </DSStatusChip>
                  </div>
                </DSCard>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-2">Get Instant Access to Your Funds</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Request a debit card linked to your wallet for immediate access to your funds at ATMs and stores.
                  </p>
                  <div className="rounded-2xl border border-border/70 bg-card/90 p-3 mb-4">
                    <div className="space-y-1 text-sm text-foreground/85">
                      <p><strong>Virtual Card:</strong> $0.01 • Instant delivery</p>
                      <p><strong>Physical Card:</strong> $30.00 • 2-day shipping</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowDebitCardDialog(true)}
                    data-testid="button-request-debit-card"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Request Debit Card
                  </Button>
                </div>
              )}
            </div>
          </DSCard>
        )}

        {/* Transaction History */}
        <DSTableShell
          title={t("driver.wallet.transactionHistory")}
          description={(transactionsData as any)?.total > 0 ? t("driver.wallet.totalTransactions", { count: (transactionsData as any).total }) : undefined}
        >
          <div className="space-y-3">
            {transactionsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-3 p-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))
            ) : !(transactionsData as any)?.transactions?.length ? (
                <div className="text-center py-8 text-foreground/75">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t("driver.wallet.noTransactions")}</p>
                  <p className="text-sm">{t("driver.wallet.noTransactionsDescription")}</p>
                </div>
              ) : (
                <>
                {(transactionsData as any).transactions.map((transaction: WalletTransaction, index: number) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-border hover:bg-card"
                    data-testid={`transaction-${index}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full border border-border/70 bg-background/60 flex items-center justify-center">
                        {getTransactionIcon(transaction)}
                      </div>
                      <div>
                        <div className="font-medium text-sm" data-testid={`transaction-description-${index}`}>
                          {transaction.description}
                        </div>
                        <div className="text-xs text-foreground/65">
                          {formatDateTime(transaction.createdAt)}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <DSStatusChip tone={transaction.status === 'posted' ? 'success' : 'neutral'} className="text-xs">
                            {transaction.status}
                          </DSStatusChip>
                          <span className="text-xs text-foreground/65">
                            {t("driver.wallet.transactionBalance", { amount: formatCurrency(transaction.balanceAfter) })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${getTransactionColor(transaction)}`} data-testid={`transaction-amount-${index}`}>
                        {transaction.direction === 'credit' ? '+' : '-'}
                        {formatCurrency(Math.abs(transaction.amount))}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {(transactionsData as any)?.totalPages > 1 && (
                  <div className="flex justify-center space-x-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="flex items-center px-3 text-sm">
                      Page {currentPage} of {(transactionsData as any).totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min((transactionsData as any).totalPages, currentPage + 1))}
                      disabled={currentPage === (transactionsData as any).totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DSTableShell>
      </div>

      {/* Driver Terms Dialog */}
      <DriverTermsDialog
        open={showTermsDialog}
        onOpenChange={setShowTermsDialog}
        onAccepted={handleTermsAccepted}
        readOnly={false}
      />

      {/* Debit Card Request Dialog */}
      <DebitCardRequestDialog
        open={showDebitCardDialog}
        onOpenChange={setShowDebitCardDialog}
        driverName={userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : ""}
        driverAddress={{
          street: userProfile?.street,
          city: userProfile?.city,
          state: userProfile?.state,
          zip: userProfile?.zip,
        }}
      />

      <MobileNav />
    </div>
  );
}
