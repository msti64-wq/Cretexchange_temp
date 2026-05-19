import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { useLocation } from "wouter";
import { Wallet, Building2, ArrowLeft, Plus, Check, AlertCircle, CreditCard, Trash2, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { OwnerWalletWizard } from "@/components/OwnerWalletWizard";
import { BankAccountConnect } from "@/components/BankAccountConnect";
import { apiRequest } from "@/lib/queryClient";
import StripeCardSetup from "@/components/StripeCardSetup";

export default function PaymentMethods() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showWalletWizard, setShowWalletWizard] = useState(false);
  const [showCardSetup, setShowCardSetup] = useState(false);
  const queryClient = useQueryClient();

  // Query for wallet status and funding sources
  const { data: walletData, isLoading: isWalletLoading } = useQuery({
    queryKey: ['/api/owners/wallet'],
    refetchInterval: 30000,
  });

  const { data: fundingSources, isLoading: isSourcesLoading } = useQuery({
    queryKey: ['/api/owners/funding-sources'],
    refetchInterval: 30000,
  });

  // Query for owner's payment method (credit card for platform fees)
  const { data: ownerData } = useQuery({
    queryKey: ['/api/owners/profile'],
  });

  const [formData, setFormData] = useState({
    bankName: '',
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
  });

  const addFundingSourceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/funding-sources", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Funding source added successfully",
        description: "Your new payment method is now available for wallet funding." 
      });
      setShowAddForm(false);
      setFormData({
        bankName: '', 
        accountHolderName: '', 
        routingNumber: '', 
        accountNumber: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add funding source", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteFundingSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const response = await apiRequest("DELETE", `/api/owners/funding-sources/${sourceId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Funding source removed successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove funding source", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const setPrimarySourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const response = await apiRequest("PUT", `/api/owners/funding-sources/${sourceId}/set-primary`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Primary funding source updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update primary source", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      sourceType: 'ach',
      bankName: formData.bankName,
      accountHolderName: formData.accountHolderName,
      routingNumber: formData.routingNumber,
      accountNumber: formData.accountNumber,
    };

    addFundingSourceMutation.mutate(data);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const isLoading = isWalletLoading || isSourcesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  // Show wallet setup wizard if wallet is not configured
  if (!walletData || !(walletData as any)?.isConfigured) {
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
                <h1 className="font-semibold text-lg">Wallet Setup Required</h1>
                <p className="text-white/80 text-sm">Configure your wallet</p>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 space-y-6">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-6 text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">Wallet Setup Required</h3>
              <p className="text-muted-foreground mb-4">
                Before you can manage funding sources, you need to set up your business wallet.
                This enables secure payment processing and automatic driver payouts.
              </p>
              <Button 
                onClick={() => setShowWalletWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-setup-wallet"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Set Up Wallet
              </Button>
            </CardContent>
          </Card>
        </main>

        <OwnerWalletWizard
          isOpen={showWalletWizard}
          onComplete={() => {
            setShowWalletWizard(false);
            queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
          }}
          onCancel={() => setShowWalletWizard(false)}
        />

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
              <h1 className="font-semibold text-lg">Payment Methods</h1>
              <p className="text-white/80 text-sm">Manage fees, wallet funding & payouts</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Trial mode banner */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-green-800 dark:text-green-200">Trial Period — No Signup or Monthly Fees</p>
              <p className="text-green-700 dark:text-green-300 mt-1">
                No signup fee. No monthly location fee. Owners are charged a minimum of <strong>$5.00 per completed washout</strong>, billed weekly to the card on file.
              </p>
            </div>
          </div>
        </div>

        {/* 1. Credit Card for Weekly Washout Billing */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Credit Card for Washout Billing</h2>
            <p className="text-sm text-muted-foreground">Required — charged $5.00 per washout, billed weekly</p>
          </div>
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
            <CardContent className="p-4">
              {(ownerData as any)?.stripePaymentMethodId ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CreditCard className="w-8 h-8 text-purple-600" />
                    <div>
                      <div className="font-medium">
                        {(ownerData as any)?.paymentMethod?.brand || 'Card'} ****{(ownerData as any)?.paymentMethod?.last4 || '****'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Active — charged weekly for completed washouts
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCardSetup(true)}
                    data-testid="button-change-card"
                  >
                    Update Card
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 text-purple-600" />
                  <h3 className="font-medium mb-2">No Card on File</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    A credit card is required to add locations and receive washout requests. You will be charged $5.00 per completed washout, billed weekly.
                  </p>
                  <Button
                    onClick={() => setShowCardSetup(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-add-payment-method"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Credit Card
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly billing info */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-medium">How weekly billing works</p>
                  <p>Each Sunday, all washouts completed during the past week are totaled and a single charge is made to your card on file.</p>
                  <p>Example: 10 washouts in a week = <strong>$50.00</strong> charged on Sunday.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Owner Wallet Funding (ACH Only) */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Stripe Wallet Funding</h2>
            <p className="text-sm text-muted-foreground">Add bank accounts (ACH only) to fund your wallet</p>
          </div>
          
          {/* Wallet Status Card */}
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-3">
                  <Wallet className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="text-sm">
                    <h3 className="font-medium text-green-800 dark:text-green-200 mb-1">
                      Stripe Wallet Status
                    </h3>
                    <p className="text-green-700 dark:text-green-300">
                      Balance: ${(walletData as any)?.balance || '0.00'} • Status: {(walletData as any)?.status || 'Active'}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {(walletData as any)?.status || 'Active'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                    What is Wallet Funding Used For?
                  </h3>
                  <p className="text-blue-700 dark:text-blue-300 mb-2">
                    Your Stripe wallet funds are used for:
                  </p>
                  <ul className="text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                    <li>Paying drivers for washout services (via internal transfer)</li>
                    <li>Monthly location fees ($1.00/location) when balance is available</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Accounts List */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Bank Accounts (ACH)</h3>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-add-source"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Source
            </Button>
          </div>

          {(() => {
            // Filter to only show ACH bank accounts (not credit cards)
            const bankAccounts = ((fundingSources as any[]) || []).filter(
              (source: any) => source.sourceType === 'ach' || source.sourceType === 'bank_account'
            );
            
            if (!bankAccounts.length) {
              return (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-medium mb-2">No Bank Accounts Added</h3>
                    <p className="text-muted-foreground mb-4">
                      Add a bank account (ACH) to fund your Stripe wallet
                    </p>
                    <Button onClick={() => setShowAddForm(true)} data-testid="button-add-first-source">
                      Add Your First Bank Account
                    </Button>
                  </CardContent>
                </Card>
              );
            }
            
            return bankAccounts.map((source: any, index: number) => (
              <Card key={source.id} data-testid={`card-funding-source-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Building2 className="w-8 h-8 text-green-600" />
                      <div>
                        <div className="font-medium">
                          {source.bankName} ****{source.accountNumberLast4}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Bank Account (ACH)
                          {source.isVerified && (
                            <span className="text-green-600 ml-2">• Verified</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {source.isPrimary && (
                        <Badge variant="secondary" data-testid={`badge-primary-${index}`}>
                          <Star className="w-3 h-3 mr-1" />
                          Primary
                        </Badge>
                      )}
                      {!source.isPrimary && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPrimarySourceMutation.mutate(source.id)}
                          disabled={setPrimarySourceMutation.isPending}
                          data-testid={`button-set-primary-${index}`}
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteFundingSourceMutation.mutate(source.id)}
                        disabled={deleteFundingSourceMutation.isPending}
                        data-testid={`button-delete-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
        </div>

        {/* Add Funding Source - Financial Connections */}
        {showAddForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Connect Bank Account
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Instantly connect your bank account to fund your wallet. Secure bank-level encryption.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <BankAccountConnect
                userType="owner"
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
                  setShowAddForm(false);
                }}
                buttonText="Connect Bank Account"
                className="w-full"
              />
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>🔒 Instant & Secure:</strong> Connect your bank account securely in seconds using your online banking credentials. Bank-level encryption protects your data.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
                className="w-full"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Wallet Management */}
        {(fundingSources as any[])?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Check className="w-5 h-5 mr-2" />
                Wallet Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Auto Top-up</div>
                    <div className="text-sm text-muted-foreground">
                      {(walletData as any)?.autoTopupEnabled ? 'Enabled' : 'Disabled'} • 
                      Threshold: ${(walletData as any)?.lowBalanceThreshold || '100'}
                      {(walletData as any)?.autoTopupEnabled && ` • Amount: $${(walletData as any)?.autoTopupAmount || '500'}`}
                    </div>
                  </div>
                  <Badge variant={(walletData as any)?.autoTopupEnabled ? 'default' : 'secondary'}>
                    {(walletData as any)?.autoTopupEnabled ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>• Automatic driver payouts are processed weekly</p>
                  <p>• Low balance alerts keep your wallet funded</p>
                  <p>• All transactions are logged for your records</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Driver Payments & Payouts Info */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Driver Payments & Payouts</h2>
            <p className="text-sm text-muted-foreground">How drivers receive payment for washout services</p>
          </div>
          <Card className="border-teal-200 bg-teal-50 dark:bg-teal-950/20">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5" />
                <div className="text-sm">
                  <h3 className="font-medium text-teal-800 dark:text-teal-200 mb-2">
                    Payment Flow
                  </h3>
                  <ul className="text-teal-700 dark:text-teal-300 space-y-1 list-disc list-inside">
                    <li>When you approve a washout, payment is transferred instantly from your Stripe wallet to the driver's Stripe wallet</li>
                    <li>Drivers can request ACH transfer from their wallet to their bank account</li>
                    <li>Drivers can also request a Stripe debit card linked to their wallet for instant access to funds</li>
                  </ul>
                  <p className="text-teal-700 dark:text-teal-300 mt-2 text-xs">
                    Note: Driver payment settings are managed on the driver's account, not shown here.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Wallet className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Powered by Stripe</div>
                <div className="text-sm text-muted-foreground">
                  Secure payment processing and financial services
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Stripe Card Setup Dialog */}
      <Dialog open={showCardSetup} onOpenChange={(open) => {
        // Only allow closing via cancel button, not by clicking outside
        if (!open) {
          // Dialog is trying to close - ignore it
          return;
        }
        setShowCardSetup(open);
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => {
          // Prevent closing when clicking outside
          e.preventDefault();
        }}>
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(90vh-8rem)] pb-4">
            <StripeCardSetup
              onSuccess={() => {
                setShowCardSetup(false);
                queryClient.invalidateQueries({ queryKey: ['/api/owners/profile'] });
                queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
              }}
              onCancel={() => setShowCardSetup(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <MobileNav role="owner" />
    </div>
  );
}
