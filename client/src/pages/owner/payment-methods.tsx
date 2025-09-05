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

  // Check if owner has agreed to terms
  const { data: termsStatus } = useQuery({
    queryKey: ['/api/owners/terms-status'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/owners/payment-methods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
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
                  {hasAgreedToTerms || termsStatus?.hasAgreed ? (
                    <Button variant="outline" size="sm" data-testid="button-terms" className="text-green-700 border-green-200">
                      ✓ Terms Reviewed
                    </Button>
                  ) : (
                    <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold" size="sm" data-testid="button-terms">
                      ⚠️ Must Read Terms
                    </Button>
                  )}
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
                      <div className="space-y-4 text-xs leading-relaxed max-h-96 overflow-y-auto">
                        <div className="text-center">
                          <h3 className="font-bold text-lg mb-2">WashOut Pro Terms and Conditions</h3>
                          <p className="font-semibold">Agreement</p>
                          <p className="font-medium">Effective Date: September 5, 2025</p>
                        </div>
                        
                        <div className="space-y-3">
                          <p>
                            This Terms and Conditions Agreement ("Agreement") is entered into by and between WashOut
                            Pro, LLC ("WashOut Pro," "we," or "our") and each rock crushing yard operator ("Owner,"
                            "you," or "your").
                          </p>
                          
                          <p>
                            By clicking "I Agree," enrolling in, and using the WashOut Pro system, you acknowledge that
                            you have read, understood, and agree to be bound by the following terms:
                          </p>
                          
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold mb-2">1. Subscription and Account</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>1.1 Subscription Fee:</strong> Each published location is subject to a monthly subscription fee as communicated to you by WashOut Pro.</p>
                                <p><strong>1.2 Payment Method:</strong> You must provide and maintain a valid payment method (credit account, ACH, or linked bank account) for automatic withdrawals. Subscription fees will be billed monthly.</p>
                                <p><strong>1.3 Authorization:</strong> By agreeing to this Agreement, you authorize WashOut Pro to automatically withdraw subscription fees, service charges, and other applicable fees from your designated account.</p>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold mb-2">2. Payments to Drivers</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>2.1 Payment Obligation:</strong> Owners are responsible for compensating participating concrete truck drivers for washout services in the minimum amount of $10.00 per washout (or higher, as determined by you within the app).</p>
                                <p><strong>2.2 Payment Schedule:</strong> Payments to drivers will be processed on a weekly basis.</p>
                                <p><strong>2.3 Service Fee:</strong> For each payment made to a driver, WashOut Pro will assess a 10% service charge to the Owner, billed in addition to the driver's compensation. Drivers shall receive the full washout payment without any deduction for service fees.</p>
                                <div className="bg-muted/50 p-2 rounded italic">
                                  Example: If a driver is paid $10.00, the Owner will be billed $11.00 ($10.00 driver payment + $1.00 service fee).
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold mb-2">3. System Participation</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>3.1 Eligibility:</strong> Only approved owners with active accounts may use the WashOut Pro platform.</p>
                                <p><strong>3.2 Compliance:</strong> Owners agree to comply with all applicable laws, safety standards, and environmental regulations related to washout services.</p>
                                <p><strong>3.3 Account Suspension:</strong> WashOut Pro reserves the right to suspend or terminate access to the system for non-payment, misuse, or violation of this Agreement.</p>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold mb-2">4. Disclaimers and Liability</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>4.1 Independent Contractors:</strong> Drivers participating in WashOut Pro are independent contractors, not employees, agents, or representatives of WashOut Pro.</p>
                                <p><strong>4.2 Limitation of Liability:</strong> WashOut Pro is not responsible for disputes, damages, or claims arising out of washout services performed by drivers.</p>
                                <p><strong>4.3 Indemnification:</strong> You agree to indemnify and hold harmless WashOut Pro, its affiliates, and representatives from any claims, damages, or expenses resulting from your participation in the system.</p>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold mb-2">5. Termination</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>5.1 By Owner:</strong> You may terminate your participation at any time by providing thirty (30) days written notice to WashOut Pro.</p>
                                <p><strong>5.2 By WashOut Pro:</strong> WashOut Pro may terminate this Agreement immediately for failure to pay, fraudulent activity, or material breach of terms.</p>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold mb-2">6. Miscellaneous</h4>
                              <div className="space-y-2 ml-4">
                                <p><strong>6.1 Governing Law:</strong> This Agreement shall be governed by the laws of the United States.</p>
                                <p><strong>6.2 Entire Agreement:</strong> This Agreement constitutes the full understanding between the parties and supersedes any prior agreements.</p>
                                <p><strong>6.3 Amendments:</strong> WashOut Pro may update these Terms and Conditions with notice to participating Owners. Continued use of the system constitutes acceptance of updated terms.</p>
                              </div>
                            </div>
                          </div>
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