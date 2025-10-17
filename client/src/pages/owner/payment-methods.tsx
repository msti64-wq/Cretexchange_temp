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
import { apiRequest } from "@/lib/queryClient";

export default function PaymentMethods() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showWalletWizard, setShowWalletWizard] = useState(false);
  const [sourceType, setSourceType] = useState<'ach' | 'credit_card'>('ach');
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

  const [formData, setFormData] = useState({
    // ACH fields
    bankName: '',
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    // Credit card fields
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
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
        bankName: '', accountHolderName: '', routingNumber: '', accountNumber: '',
        cardholderName: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '',
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
      sourceType,
      ...(sourceType === 'ach' ? {
        bankName: formData.bankName,
        accountHolderName: formData.accountHolderName,
        routingNumber: formData.routingNumber,
        accountNumber: formData.accountNumber,
      } : {
        cardholderName: formData.cardholderName,
        cardNumber: formData.cardNumber,
        expiryMonth: formData.expiryMonth,
        expiryYear: formData.expiryYear,
        cvv: formData.cvv,
      })
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
                <p className="text-white/80 text-sm">Configure your Column wallet</p>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 space-y-6">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-6 text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">Column Wallet Setup Required</h3>
              <p className="text-muted-foreground mb-4">
                Before you can manage funding sources, you need to set up your Column business wallet.
                This enables secure payment processing and automatic driver payouts.
              </p>
              <Button 
                onClick={() => setShowWalletWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-setup-wallet"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Set Up Column Wallet
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
              <h1 className="font-semibold text-lg">Funding Sources</h1>
              <p className="text-white/80 text-sm">Manage wallet funding methods</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Wallet Status Card */}
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-3">
                <Wallet className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <h3 className="font-medium text-green-800 dark:text-green-200 mb-1">
                    Column Wallet Status
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
                  Wallet Funding & Auto Top-up
                </h3>
                <p className="text-blue-700 dark:text-blue-300">
                  Add funding sources to manually fund your wallet or enable automatic top-up when balance is low.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Funding Sources */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Funding Sources</h2>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-add-source"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Source
            </Button>
          </div>

          {!(fundingSources as any[])?.length ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">No Funding Sources Added</h3>
                <p className="text-muted-foreground mb-4">
                  Add a bank account or credit card to fund your wallet and enable automatic top-up
                </p>
                <Button onClick={() => setShowAddForm(true)} data-testid="button-add-first-source">
                  Add Your First Funding Source
                </Button>
              </CardContent>
            </Card>
          ) : (
            ((fundingSources as any[]) || []).map((source: any, index: number) => (
              <Card key={source.id} data-testid={`card-funding-source-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {source.sourceType === 'credit_card' ? (
                        <CreditCard className="w-8 h-8 text-blue-600" />
                      ) : (
                        <Building2 className="w-8 h-8 text-green-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          {source.sourceType === 'credit_card' ? (
                            `${source.cardBrand || 'Card'} ****${source.cardLast4}`
                          ) : (
                            `${source.bankName} ****${source.accountNumberLast4}`
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {source.sourceType === 'credit_card' ? 
                            'Credit Card' :
                            'Bank Account (ACH)'
                          }
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
            ))
          )}
        </div>

        {/* Add Funding Source Form */}
        {showAddForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Add Funding Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Source Type Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant={sourceType === 'ach' ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setSourceType('ach')}
                    data-testid="button-ach-type"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Bank Account (ACH)
                  </Button>
                  <Button
                    type="button"
                    variant={sourceType === 'credit_card' ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setSourceType('credit_card')}
                    data-testid="button-card-type"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Credit Card
                  </Button>
                </div>

                {/* ACH Form */}
                {sourceType === 'ach' && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="bankName">Bank Name</Label>
                      <Input
                        id="bankName"
                        value={formData.bankName}
                        onChange={(e) => handleInputChange('bankName', e.target.value)}
                        placeholder="Chase Bank"
                        required
                        data-testid="input-bank-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="accountHolderName">Account Holder Name</Label>
                      <Input
                        id="accountHolderName"
                        value={formData.accountHolderName}
                        onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
                        placeholder="John Doe"
                        required
                        data-testid="input-account-holder-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input
                        id="routingNumber"
                        value={formData.routingNumber}
                        onChange={(e) => handleInputChange('routingNumber', e.target.value)}
                        placeholder="021000021"
                        maxLength={9}
                        required
                        data-testid="input-routing-number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <PasswordInput
                        id="accountNumber"
                        value={formData.accountNumber}
                        onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                        placeholder="1234567890"
                        required
                        data-testid="input-account-number"
                      />
                    </div>
                  </div>
                )}

                {/* Credit Card Form */}
                {sourceType === 'credit_card' && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardholderName">Cardholder Name</Label>
                      <Input
                        id="cardholderName"
                        value={formData.cardholderName}
                        onChange={(e) => handleInputChange('cardholderName', e.target.value)}
                        placeholder="John Doe"
                        required
                        data-testid="input-cardholder-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cardNumber">Card Number</Label>
                      <Input
                        id="cardNumber"
                        value={formData.cardNumber}
                        onChange={(e) => handleInputChange('cardNumber', e.target.value)}
                        placeholder="1234 5678 9012 3456"
                        required
                        data-testid="input-card-number"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="expiryMonth">Month</Label>
                        <Input
                          id="expiryMonth"
                          value={formData.expiryMonth}
                          onChange={(e) => handleInputChange('expiryMonth', e.target.value)}
                          placeholder="MM"
                          maxLength={2}
                          required
                          data-testid="input-expiry-month"
                        />
                      </div>
                      <div>
                        <Label htmlFor="expiryYear">Year</Label>
                        <Input
                          id="expiryYear"
                          value={formData.expiryYear}
                          onChange={(e) => handleInputChange('expiryYear', e.target.value)}
                          placeholder="YY"
                          maxLength={2}
                          required
                          data-testid="input-expiry-year"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cvv">CVV</Label>
                        <Input
                          id="cvv"
                          value={formData.cvv}
                          onChange={(e) => handleInputChange('cvv', e.target.value)}
                          placeholder="123"
                          maxLength={4}
                          required
                          data-testid="input-cvv"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    type="submit"
                    disabled={addFundingSourceMutation.isPending}
                    data-testid="button-save-source"
                  >
                    {addFundingSourceMutation.isPending ? "Adding..." : "Add Funding Source"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddForm(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
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

      <MobileNav role="owner" />
    </div>
  );
}