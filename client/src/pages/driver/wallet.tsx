import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { DriverTermsDialog } from "@/components/DriverTermsDialog";
import { ColumnOnboardingDialog } from "@/components/ColumnOnboardingDialog";
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
  Minus
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showColumnOnboarding, setShowColumnOnboarding] = useState(false);
  const [showDebitCardDialog, setShowDebitCardDialog] = useState(false);
  const pageSize = 20;

  // Fetch wallet balance
  const { data: walletBalance, isLoading: balanceLoading, refetch: refetchBalance } = useQuery<WalletBalance>({
    queryKey: ['/api/wallet/balance'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch driver terms status
  const { data: termsStatus, isLoading: termsLoading, isError: termsError } = useQuery<{hasAgreed: boolean; agreedAt: string | null}>({
    queryKey: ['/api/drivers/terms-status'],
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

  // Fetch Column onboarding status
  const { data: columnStatus, isLoading: columnLoading, refetch: refetchColumnStatus } = useQuery<ColumnOnboardingStatus>({
    queryKey: ['/api/column/status'],
  });

  // Fetch user profile for debit card pre-population
  const { data: userProfile } = useQuery<any>({
    queryKey: ['/api/profile'],
  });

  // Withdrawal mutation
  const withdrawalMutation = useMutation({
    mutationFn: async (amount: number) => {
      return await apiRequest("POST", "/api/wallet/withdraw", { amount });
    },
    onSuccess: () => {
      toast({
        title: "Withdrawal Requested",
        description: "Your withdrawal request has been submitted and will be processed within 1-2 business days.",
      });
      setWithdrawalAmount("");
      refetchBalance();
      refetchTransactions();
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to process withdrawal request",
        variant: "destructive",
      });
    },
  });

  // Column onboarding mutation
  const columnOnboardingMutation = useMutation({
    mutationFn: async (data: any) => {
      // Transform form data to match API schema
      const requestData = {
        firstName: data.firstName,
        lastName: data.lastName,
        ssn: data.ssn,
        dateOfBirth: data.dateOfBirth,
        email: data.email,
        address: {
          line1: data.addressLine1,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          countryCode: "US",
        },
      };
      return await apiRequest("POST", "/api/column/onboard", requestData);
    },
    onSuccess: () => {
      toast({
        title: "Account Connected! 🎉",
        description: "Your bank account has been successfully connected. You can now request withdrawals.",
      });
      setShowColumnOnboarding(false);
      refetchColumnStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect bank account",
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
        title: "Account Connected! 🎉",
        description: "Your bank account is now ready for withdrawals.",
      });
    }
    
    if (previousIsOnboarded !== null) {
      setPreviousIsOnboarded(currentIsOnboarded);
    } else {
      setPreviousIsOnboarded(currentIsOnboarded);
    }
  }, [columnStatus, toast, previousIsOnboarded]);

  const handleWithdrawal = () => {
    // Handle terms status loading and error states
    if (termsLoading) {
      toast({
        title: "Loading Terms Status",
        description: "Please wait while we verify your account status",
      });
      return;
    }

    if (termsError) {
      toast({
        title: "Terms Status Error",
        description: "Unable to verify terms status. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount < 5) {
      toast({
        title: "Invalid Amount",
        description: "Minimum withdrawal amount is $5.00",
        variant: "destructive",
      });
      return;
    }

    if (amount > (walletBalance?.availableBalance || 0)) {
      toast({
        title: "Insufficient Funds",
        description: "Withdrawal amount exceeds available balance",
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
        title: "Invalid Amount",
        description: "Please enter a valid withdrawal amount of at least $5.00",
        variant: "destructive",
      });
      return;
    }

    if (amount > (walletBalance?.availableBalance || 0)) {
      toast({
        title: "Insufficient Funds",
        description: "Withdrawal amount exceeds available balance",
        variant: "destructive",
      });
      return;
    }

    withdrawalMutation.mutate(amount);
  };

  const refreshAllData = () => {
    refetchBalance();
    refetchTransactions();
    refetchColumnStatus();
    toast({
      title: "Data Refreshed",
      description: "Wallet information has been updated",
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
      <div className="min-h-screen bg-background">
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
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />

      <div className="p-4 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-wallet-title">
                My Wallet
              </h1>
              <p className="text-muted-foreground">Manage your earnings and withdrawals</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAllData}
            className="flex items-center space-x-2"
            data-testid="button-refresh-wallet"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Wallet Balance Card */}
        <StatCard
          title="Wallet Balance"
          subtitle={
            <div className="flex items-center text-green-600 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-1" />
              Available to withdraw
            </div>
          }
        >
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="text-4xl font-bold text-primary mb-2" data-testid="text-available-balance">
                {formatCurrency(walletBalance?.availableBalance || 0)}
              </div>
              <div className="text-muted-foreground">Available Balance</div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-semibold text-amber-600" data-testid="text-pending-balance">
                  {formatCurrency(walletBalance?.pendingBalance || 0)}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-semibold text-green-600" data-testid="text-total-earnings">
                  {formatCurrency(walletBalance?.totalEarnings || 0)}
                </div>
                <div className="text-sm text-muted-foreground">Total Earned</div>
              </div>
            </div>
          </div>
        </StatCard>

        {/* Bank Account Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              Payment Account Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!columnStatus?.isOnboarded ? (
              <div className="text-center py-6">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Setup Required</h3>
                <p className="text-muted-foreground mb-4">
                  Connect your bank account to receive payments
                </p>
                <Button
                  onClick={() => setShowColumnOnboarding(true)}
                  data-testid="button-create-account"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Connect Bank Account
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Account Status</span>
                  <Badge 
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="badge-account-status"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected & Ready
                  </Badge>
                </div>

                {/* Show account connection details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">Bank Account Connected</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">Identity Verified</span>
                  </div>
                  {columnStatus?.accountLast4 && (
                    <div className="flex items-center space-x-2 col-span-2">
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Account ending in {columnStatus.accountLast4}
                      </span>
                    </div>
                  )}
                </div>
                
                <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Your bank account is ready to receive payments
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Withdrawal Request Form */}
        <StatCard
          title="Request Withdrawal"
          subtitle={
            <span className="text-sm text-muted-foreground">
              {!termsStatus?.hasAgreed 
                ? "$1 fee under $10, then 10% • Funds arrive in 1-2 business days"
                : "Funds arrive in 1-2 business days"
              }
            </span>
          }
        >
          <div className="space-y-4">
            {!canWithdraw ? (
              <div className="text-center py-6 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Complete account verification to enable withdrawals</p>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="withdrawal-amount">Withdrawal Amount</Label>
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
                    Minimum withdrawal: $5.00
                  </p>
                </div>

                {withdrawAmount > 0 && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Withdrawal Amount:</span>
                      <span data-testid="text-withdrawal-amount">{formatCurrency(withdrawAmount)}</span>
                    </div>
                    {!termsStatus?.hasAgreed && (
                      <div className="flex justify-between text-sm text-amber-600">
                        <span>Processing Fee ({withdrawAmount < 10 ? '$1 flat fee' : '10%'}):</span>
                        <span data-testid="text-fee-amount">-{formatCurrency(feeAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>You'll Receive:</span>
                      <span className="text-green-600" data-testid="text-net-amount">
                        {formatCurrency(netAmount)}
                      </span>
                    </div>
                  </div>
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
                  Request Withdrawal
                </Button>

                {/* Withdrawal timing and debit card guidance */}
                <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <div className="space-y-2">
                      <p className="font-medium">Bank transfers typically arrive in 1-2 business days</p>
                      <p className="text-sm">
                        <strong>Want faster access?</strong> Request a debit card linked to your account for instant access to your funds at ATMs and stores.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                        onClick={() => setShowDebitCardDialog(true)}
                        disabled={!columnStatus?.isOnboarded}
                        data-testid="button-request-debit-card"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Request Debit Card
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
        </StatCard>

        {/* Transaction History */}
        <StatCard
          title="Transaction History"
          subtitle={
            (transactionsData as any)?.total > 0 ? (
              <span className="text-sm text-muted-foreground">
                {(transactionsData as any).total} total transactions
              </span>
            ) : null
          }
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
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No transactions yet</p>
                <p className="text-sm">Your transaction history will appear here</p>
              </div>
            ) : (
              <>
                {(transactionsData as any).transactions.map((transaction: WalletTransaction, index: number) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`transaction-${index}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center border">
                        {getTransactionIcon(transaction)}
                      </div>
                      <div>
                        <div className="font-medium text-sm" data-testid={`transaction-description-${index}`}>
                          {transaction.description}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(transaction.createdAt)}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge 
                            variant={transaction.status === 'posted' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {transaction.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Balance: {formatCurrency(transaction.balanceAfter)}
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
        </StatCard>
      </div>

      {/* Driver Terms Dialog */}
      <DriverTermsDialog
        open={showTermsDialog}
        onOpenChange={setShowTermsDialog}
        onAccepted={handleTermsAccepted}
        readOnly={false}
      />

      {/* Column Onboarding Dialog */}
      <ColumnOnboardingDialog
        open={showColumnOnboarding}
        onOpenChange={setShowColumnOnboarding}
        onSubmit={async (data) => {
          await columnOnboardingMutation.mutateAsync(data);
        }}
        isPending={columnOnboardingMutation.isPending}
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