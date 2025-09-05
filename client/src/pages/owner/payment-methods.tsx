import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { useLocation } from "wouter";
import { CreditCard, Building2, ArrowLeft, Plus, Check, AlertCircle, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

export default function PaymentMethods() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [paymentType, setPaymentType] = useState<'card' | 'bank'>('card');
  const [showTerms, setShowTerms] = useState(false);
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const queryClient = useQueryClient();

  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['/api/owners/payment-methods'],
    refetchInterval: 30000,
  });

  const [formData, setFormData] = useState({
    // Credit card fields
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvc: '',
    cardholderName: '',
    
    // Bank account fields
    accountNumber: '',
    routingNumber: '',
    accountHolderName: '',
    bankName: '',
  });

  const addPaymentMethodMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/payment-methods", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Payment method added successfully" });
      setShowAddForm(false);
      setFormData({
        cardNumber: '', expiryMonth: '', expiryYear: '', cvc: '', cardholderName: '',
        accountNumber: '', routingNumber: '', accountHolderName: '', bankName: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/payment-methods'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add payment method", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: async (methodId: string) => {
      const response = await apiRequest("DELETE", `/api/owners/payment-methods/${methodId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Payment method removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/payment-methods'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove payment method", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const agreeToTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/owners/agree-to-terms", {});
      return response.json();
    },
    onSuccess: () => {
      setHasAgreedToTerms(true);
      setShowTerms(false);
      toast({ 
        title: "Terms accepted", 
        description: "You can now add payment methods and locations" 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/terms-status'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to record agreement", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      type: paymentType,
      ...(paymentType === 'card' ? {
        cardNumber: formData.cardNumber,
        expiryMonth: formData.expiryMonth,
        expiryYear: formData.expiryYear,
        cvc: formData.cvc,
        cardholderName: formData.cardholderName,
      } : {
        accountNumber: formData.accountNumber,
        routingNumber: formData.routingNumber,
        accountHolderName: formData.accountHolderName,
        bankName: formData.bankName,
      })
    };

    addPaymentMethodMutation.mutate(data);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Payment Methods</h1>
              <p className="text-white/80 text-sm">Manage funding sources</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Automatic Driver Payouts
                </h3>
                <p className="text-blue-700 dark:text-blue-300">
                  Add a payment method to enable automatic weekly withdrawals for driver payouts.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Payment Methods */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Payment Methods</h2>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-add-method"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Method
            </Button>
          </div>

          {!paymentMethods?.length ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">No Payment Methods Added</h3>
                <p className="text-muted-foreground mb-4">
                  Add a credit card or bank account to enable automatic driver payouts
                </p>
                <Button onClick={() => setShowAddForm(true)} data-testid="button-add-first-method">
                  Add Your First Payment Method
                </Button>
              </CardContent>
            </Card>
          ) : (
            paymentMethods.map((method: any, index: number) => (
              <Card key={method.id} data-testid={`card-payment-method-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {method.type === 'card' ? (
                        <CreditCard className="w-8 h-8 text-blue-600" />
                      ) : (
                        <Building2 className="w-8 h-8 text-green-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          {method.type === 'card' ? (
                            `**** **** **** ${method.last4}`
                          ) : (
                            `${method.bankName} ****${method.last4}`
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {method.type === 'card' ? 
                            `Expires ${method.expiryMonth}/${method.expiryYear}` :
                            'Bank Account'
                          }
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {method.isDefault && (
                        <Badge variant="secondary" data-testid="badge-default">
                          Default
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deletePaymentMethodMutation.mutate(method.id)}
                        disabled={deletePaymentMethodMutation.isPending}
                        data-testid={`button-delete-${index}`}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Add Payment Method Form */}
        {showAddForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Add Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Payment Type Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant={paymentType === 'card' ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setPaymentType('card')}
                    data-testid="button-card-type"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Credit Card
                  </Button>
                  <Button
                    type="button"
                    variant={paymentType === 'bank' ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setPaymentType('bank')}
                    data-testid="button-bank-type"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Bank Account
                  </Button>
                </div>

                {/* Credit Card Form */}
                {paymentType === 'card' && (
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
                        <Label htmlFor="cvc">CVC</Label>
                        <Input
                          id="cvc"
                          value={formData.cvc}
                          onChange={(e) => handleInputChange('cvc', e.target.value)}
                          placeholder="123"
                          maxLength={4}
                          required
                          data-testid="input-cvc"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Bank Account Form */}
                {paymentType === 'bank' && (
                  <div className="space-y-4">
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
                      <Input
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

                {/* Form Actions */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    type="submit"
                    disabled={addPaymentMethodMutation.isPending}
                    data-testid="button-save-method"
                  >
                    {addPaymentMethodMutation.isPending ? "Adding..." : "Add Payment Method"}
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

        {/* Payout Settings */}
        {paymentMethods?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Check className="w-5 h-5 mr-2" />
                Automatic Payout Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Weekly Driver Payouts</div>
                    <div className="text-sm text-muted-foreground">
                      Automatically pay drivers every Friday
                    </div>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>• Drivers receive 100% of verified washout amounts</p>
                  <p>• You pay 110% total (100% to drivers + 10% platform fee)</p>
                  <p>• Payments processed using your default payment method</p>
                  <p>• You'll receive email confirmations for all transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Terms and Conditions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">Terms and Conditions</div>
                  <div className="text-sm text-muted-foreground">
                    Review payment terms and platform policies
                  </div>
                </div>
              </div>
              <Dialog open={showTerms} onOpenChange={setShowTerms}>
                <DialogTrigger asChild>
                  <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold" size="sm" data-testid="button-terms">
                    ⚠️ Must Read Terms
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Terms and Conditions - Required Reading</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                        <span className="font-semibold text-yellow-800">Important Notice</span>
                      </div>
                      <p className="text-yellow-700 text-xs">
                        You must read and agree to these terms before adding payment methods or locations.
                      </p>
                    </div>
                    
                    <div className="border rounded-lg p-4 bg-background">
                      <h3 className="font-semibold mb-3">WashOut Pro Platform Terms</h3>
                      <div className="space-y-3 text-xs leading-relaxed">
                        <p className="text-muted-foreground">
                          [Your terms and conditions document will be displayed here once provided]
                        </p>
                        <div className="bg-muted/30 p-3 rounded">
                          <h4 className="font-medium mb-2">Key Points (Placeholder):</h4>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>Platform usage responsibilities</li>
                            <li>Payment processing terms</li>
                            <li>Location owner obligations</li>
                            <li>Liability and insurance requirements</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-xs text-muted-foreground">
                        By clicking "I Agree", you confirm you have read and accept all terms.
                      </p>
                      <Button 
                        onClick={() => agreeToTermsMutation.mutate()}
                        disabled={agreeToTermsMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold"
                        data-testid="button-agree-terms"
                      >
                        {agreeToTermsMutation.isPending ? "Recording..." : "I Agree"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </main>

      <MobileNav role="owner" />
    </div>
  );
}