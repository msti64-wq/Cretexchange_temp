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
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

export default function PaymentMethods() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
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
        title: t("owner.billing.fundingSourceAdded"),
        description: t("owner.billing.fundingSourceAddedDescription"),
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
        title: t("owner.billing.failedToAddFunding"),
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
      toast({ title: t("owner.billing.fundingSourceRemoved") });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t("owner.billing.failedToRemoveFunding"),
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
      toast({ title: t("owner.billing.primaryUpdated") });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t("owner.billing.failedPrimary"),
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
                <h1 className="font-semibold text-lg">{t("owner.billing.walletSetupRequired")}</h1>
                <p className="text-white/80 text-sm">{t("owner.billing.configureWallet")}</p>
              </div>
            </div>
            <LanguageToggle />
          </div>
        </header>

        <main className="p-4 space-y-6">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-6 text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">{t("owner.billing.walletSetupRequired")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("owner.billing.walletSetupDescription")}
              </p>
              <Button 
                onClick={() => setShowWalletWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-setup-wallet"
              >
                <Wallet className="w-4 h-4 mr-2" />
                {t("owner.billing.setUpWallet")}
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
              <h1 className="font-semibold text-lg">{t("owner.billing.paymentMethods")}</h1>
              <p className="text-white/80 text-sm">{t("owner.billing.manageFees")}</p>
            </div>
          </div>
          <LanguageToggle />
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Billing summary banner */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-green-800 dark:text-green-200">{t("owner.billing.standardWashoutBilling")}</p>
              <p className="text-green-700 dark:text-green-300 mt-1">
                {t("owner.billing.standardWashoutBillingDescription")}
              </p>
            </div>
          </div>
        </div>

        {/* 1. Credit Card for Weekly Washout Billing */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("owner.billing.cardForWashoutBilling")}</h2>
            <p className="text-sm text-muted-foreground">{t("owner.billing.cardRequired")}</p>
          </div>
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
            <CardContent className="p-4">
              {(ownerData as any)?.stripePaymentMethodId ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CreditCard className="w-8 h-8 text-purple-600" />
                    <div>
                      <div className="font-medium">
                        {(ownerData as any)?.paymentMethod?.brand || t("common.card")} ****{(ownerData as any)?.paymentMethod?.last4 || '****'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t("owner.billing.activeCardDescription")}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCardSetup(true)}
                    data-testid="button-change-card"
                  >
                    {t("owner.billing.updateCard")}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 text-purple-600" />
                  <h3 className="font-medium mb-2">{t("owner.billing.noCard")}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("owner.billing.noCardDescription")}
                  </p>
                  <Button
                    onClick={() => setShowCardSetup(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-add-payment-method"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {t("owner.billing.addCreditCard")}
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
                  <p className="font-medium">{t("owner.billing.weeklyHowTitle")}</p>
                  <p>{t("owner.billing.weeklyHowDescription")}</p>
                  <p>{t("owner.billing.weeklyExample")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 3. Owner Wallet Funding (ACH Only) */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("owner.billing.walletFunding")}</h2>
            <p className="text-sm text-muted-foreground">{t("owner.billing.walletFundingDescription")}</p>
          </div>
          
          {/* Wallet Status Card */}
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start space-x-3">
                  <Wallet className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="text-sm">
                    <h3 className="font-medium text-green-800 dark:text-green-200 mb-1">
                      {t("owner.billing.walletStatus")}
                    </h3>
                    <p className="text-green-700 dark:text-green-300">
                      {t("owner.billing.balanceStatus", {
                        balance: `$${(walletData as any)?.balance || "0.00"}`,
                        status: (walletData as any)?.status || t("common.active"),
                      })}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {(walletData as any)?.status || t("common.active")}
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
                    {t("owner.billing.walletFundingUsedFor")}
                  </h3>
                  <p className="text-blue-700 dark:text-blue-300 mb-2">
                    {t("owner.billing.walletFundsUsedFor")}
                  </p>
                  <ul className="text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                    <li>{t("owner.billing.driverPaymentsUse")}</li>
                    <li>{t("owner.billing.locationFeesUse")}</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Accounts List */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t("owner.billing.bankAccounts")}</h3>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-add-source"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("owner.billing.addSource")}
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
                    <h3 className="font-medium mb-2">{t("owner.billing.noBankAccounts")}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t("owner.billing.addBankAccountHelp")}
                    </p>
                    <Button onClick={() => setShowAddForm(true)} data-testid="button-add-first-source">
                      {t("owner.billing.addFirstBankAccount")}
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
                          {t("owner.billing.bankAccountAch")}
                          {source.isVerified && (
                            <span className="text-green-600 ml-2">• {t("owner.billing.verified")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {source.isPrimary && (
                        <Badge variant="secondary" data-testid={`badge-primary-${index}`}>
                          <Star className="w-3 h-3 mr-1" />
                          {t("owner.billing.primary")}
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
                          {t("owner.billing.setPrimary")}
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
                {t("owner.billing.connectBankAccount")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {t("owner.billing.connectBankDescription")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <BankAccountConnect
                userType="owner"
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/owners/funding-sources'] });
                  setShowAddForm(false);
                }}
                buttonText={t("owner.billing.connectBankAccount")}
                className="w-full"
              />
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{t("owner.billing.secureBank")}</strong> {t("owner.billing.secureBankDescription")}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
                className="w-full"
                data-testid="button-cancel"
              >
                {t("common.cancel")}
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
                {t("owner.billing.walletManagement")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{t("owner.billing.autoTopup")}</div>
                    <div className="text-sm text-muted-foreground">
                      {(walletData as any)?.autoTopupEnabled ? t("owner.billing.enabled") : t("owner.billing.disabled")} - 
                      {t("owner.billing.threshold")}: ${(walletData as any)?.lowBalanceThreshold || '100'}
                      {(walletData as any)?.autoTopupEnabled && ` - ${t("owner.billing.amount")}: $${(walletData as any)?.autoTopupAmount || '500'}`}
                    </div>
                  </div>
                  <Badge variant={(walletData as any)?.autoTopupEnabled ? 'default' : 'secondary'}>
                    {(walletData as any)?.autoTopupEnabled ? t("common.active") : t("owner.billing.inactive")}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>• {t("owner.billing.autoPayoutsWeekly")}</p>
                  <p>• {t("owner.billing.lowBalanceAlerts")}</p>
                  <p>• {t("owner.billing.transactionsLogged")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Driver Payments & Payouts Info */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("owner.billing.driverPaymentsPayouts")}</h2>
            <p className="text-sm text-muted-foreground">{t("owner.billing.driverPaymentsDescription")}</p>
          </div>
          <Card className="border-teal-200 bg-teal-50 dark:bg-teal-950/20">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5" />
                <div className="text-sm">
                  <h3 className="font-medium text-teal-800 dark:text-teal-200 mb-2">
                    {t("owner.billing.paymentFlow")}
                  </h3>
                  <ul className="text-teal-700 dark:text-teal-300 space-y-1 list-disc list-inside">
                    <li>{t("owner.billing.paymentFlow1")}</li>
                    <li>{t("owner.billing.paymentFlow2")}</li>
                    <li>{t("owner.billing.paymentFlow3")}</li>
                  </ul>
                  <p className="text-teal-700 dark:text-teal-300 mt-2 text-xs">
                    {t("owner.billing.driverSettingsNote")}
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
                <div className="font-medium">{t("owner.billing.poweredByStripe")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("owner.billing.stripeDescription")}
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
            <DialogTitle>{t("owner.billing.addPaymentMethod")}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(90vh-8rem)] pb-4">
            <StripeCardSetup
              onSuccess={() => {
                setShowCardSetup(false);
                queryClient.invalidateQueries({ queryKey: ['/api/owners/profile'] });
                queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
                void queryClient.refetchQueries({ queryKey: ['/api/auth/user'] });
                queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
                void queryClient.refetchQueries({ queryKey: ['/api/owners/locations'] });
                queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
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
