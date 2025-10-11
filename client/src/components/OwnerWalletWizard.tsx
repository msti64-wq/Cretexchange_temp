import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Building2, CreditCard, Shield, CheckCircle, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Wizard step schemas
const businessInfoSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  businessLicense: z.string().optional(),
  taxId: z.string().optional(),
  businessAddress: z.string().min(1, "Business address is required"),
  businessPhone: z.string().min(1, "Business phone is required"),
});

const fundingSourceSchema = z.object({
  sourceType: z.enum(['ach', 'credit_card'], {
    required_error: "Please select a funding source type"
  }),
  // ACH fields
  bankName: z.string().optional(),
  accountHolderName: z.string().optional(),
  routingNumber: z.string().optional(),
  accountNumber: z.string().optional(),
  // Credit card fields
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  expiryMonth: z.string().optional(),
  expiryYear: z.string().optional(),
  cvv: z.string().optional(),
}).refine((data) => {
  if (data.sourceType === 'ach') {
    return data.bankName && data.accountHolderName && data.routingNumber && data.accountNumber;
  }
  if (data.sourceType === 'credit_card') {
    return data.cardholderName && data.cardNumber && data.expiryMonth && data.expiryYear && data.cvv;
  }
  return true;
}, {
  message: "Please fill in all required fields for the selected funding source type"
});

const walletPreferencesSchema = z.object({
  lowBalanceThreshold: z.string().min(1, "Low balance threshold is required"),
  autoTopupEnabled: z.boolean(),
  autoTopupAmount: z.string().optional(),
});

const termsSchema = z.object({
  agreedToColumnTerms: z.boolean().refine(val => val === true, "You must agree to Column terms"),
  agreedToPlatformTerms: z.boolean().refine(val => val === true, "You must agree to platform terms"),
});

const WIZARD_STEPS = [
  { id: 'welcome', title: 'Welcome', description: 'Column Wallet Setup' },
  { id: 'business', title: 'Business Info', description: 'Verify your business details' },
  { id: 'funding', title: 'Funding Source', description: 'Add a payment method' },
  { id: 'preferences', title: 'Wallet Preferences', description: 'Configure your wallet' },
  { id: 'terms', title: 'Terms & Agreements', description: 'Review and accept terms' },
  { id: 'complete', title: 'Complete', description: 'Your wallet is ready!' }
];

interface OwnerWalletWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function OwnerWalletWizard({ onComplete, onCancel, isOpen }: OwnerWalletWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardData, setWizardData] = useState<any>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const businessForm = useForm({
    resolver: zodResolver(businessInfoSchema),
    defaultValues: {
      companyName: "",
      businessLicense: "",
      taxId: "",
      businessAddress: "",
      businessPhone: "",
    }
  });

  const fundingForm = useForm({
    resolver: zodResolver(fundingSourceSchema),
    defaultValues: {
      sourceType: 'ach' as const,
      bankName: "",
      accountHolderName: "",
      routingNumber: "",
      accountNumber: "",
      cardholderName: "",
      cardNumber: "",
      expiryMonth: "",
      expiryYear: "",
      cvv: "",
    }
  });

  const preferencesForm = useForm({
    resolver: zodResolver(walletPreferencesSchema),
    defaultValues: {
      lowBalanceThreshold: "100",
      autoTopupEnabled: false,
      autoTopupAmount: "500",
    }
  });

  const termsForm = useForm({
    resolver: zodResolver(termsSchema),
    defaultValues: {
      agreedToColumnTerms: false,
      agreedToPlatformTerms: false,
    }
  });

  const setupWalletMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/owners/setup-wallet", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Wallet Setup Complete",
        description: "Your Column wallet has been successfully configured!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/wallet'] });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to set up wallet. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNext = async () => {
    const step = WIZARD_STEPS[currentStep];
    let isValid = true;
    let stepData = {};

    try {
      switch (step.id) {
        case 'welcome':
          // No validation needed
          break;
        case 'business':
          stepData = await businessForm.trigger() ? businessForm.getValues() : {};
          isValid = await businessForm.trigger();
          break;
        case 'funding':
          stepData = await fundingForm.trigger() ? fundingForm.getValues() : {};
          isValid = await fundingForm.trigger();
          break;
        case 'preferences':
          stepData = await preferencesForm.trigger() ? preferencesForm.getValues() : {};
          isValid = await preferencesForm.trigger();
          break;
        case 'terms':
          stepData = await termsForm.trigger() ? termsForm.getValues() : {};
          isValid = await termsForm.trigger();
          if (isValid) {
            // Final step - submit all data
            const completeData = { ...wizardData, ...stepData };
            setupWalletMutation.mutate(completeData);
            return;
          }
          break;
      }

      if (isValid) {
        setWizardData((prev: any) => ({ ...prev, ...stepData }));
        setCurrentStep((prev: number) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
      }
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev: number) => Math.max(prev - 1, 0));
  };

  const currentStepData = WIZARD_STEPS[currentStep];
  const progress = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Wallet className="h-6 w-6 text-blue-600" />
              <CardTitle>Column Wallet Setup</CardTitle>
            </div>
            <Badge variant="outline">
              Step {currentStep + 1} of {WIZARD_STEPS.length}
            </Badge>
          </div>
          <Progress value={progress} className="w-full" />
          <div className="text-sm text-muted-foreground mt-2">
            {currentStepData.description}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Welcome Step */}
          {currentStep === 0 && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Wallet className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold">Welcome to Column Banking</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                We'll help you set up your Column wallet for secure payment processing. 
                This will enable you to receive payments from drivers and manage your business finances.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <Shield className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <h4 className="font-medium">Secure</h4>
                  <p className="text-sm text-muted-foreground">Bank-grade security</p>
                </div>
                <div className="text-center">
                  <Building2 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <h4 className="font-medium">Business Ready</h4>
                  <p className="text-sm text-muted-foreground">Built for businesses</p>
                </div>
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <h4 className="font-medium">Compliant</h4>
                  <p className="text-sm text-muted-foreground">Fully regulated</p>
                </div>
              </div>
            </div>
          )}

          {/* Business Info Step */}
          {currentStep === 1 && (
            <Form {...businessForm}>
              <form className="space-y-4">
                <FormField
                  control={businessForm.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Your business name" {...field} data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={businessForm.control}
                  name="businessAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Address *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Full business address" {...field} data-testid="input-business-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={businessForm.control}
                    name="businessPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Phone *</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} data-testid="input-business-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={businessForm.control}
                    name="taxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax ID (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="XX-XXXXXXX" {...field} data-testid="input-tax-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={businessForm.control}
                  name="businessLicense"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business License (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="License number" {...field} data-testid="input-business-license" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          )}

          {/* Funding Source Step */}
          {currentStep === 2 && (
            <Form {...fundingForm}>
              <form className="space-y-4">
                <FormField
                  control={fundingForm.control}
                  name="sourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Funding Source Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-funding-type">
                            <SelectValue placeholder="Select funding source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ach">Bank Account (ACH)</SelectItem>
                          <SelectItem value="credit_card">Credit Card</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(fundingForm.watch("sourceType") as "ach" | "credit_card") === "ach" && (
                  <div className="space-y-4">
                    <FormField
                      control={fundingForm.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Bank of America" {...field} data-testid="input-bank-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={fundingForm.control}
                      name="accountHolderName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Holder Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" {...field} data-testid="input-account-holder" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={fundingForm.control}
                        name="routingNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Routing Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="123456789" {...field} data-testid="input-routing-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={fundingForm.control}
                        name="accountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Number *</FormLabel>
                            <FormControl>
                              <PasswordInput placeholder="1234567890" {...field} data-testid="input-account-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {(fundingForm.watch("sourceType") as "ach" | "credit_card") === "credit_card" && (
                  <div className="space-y-4">
                    <FormField
                      control={fundingForm.control}
                      name="cardholderName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cardholder Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" {...field} data-testid="input-cardholder-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={fundingForm.control}
                      name="cardNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Card Number *</FormLabel>
                          <FormControl>
                            <Input placeholder="1234 5678 9012 3456" {...field} data-testid="input-card-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={fundingForm.control}
                        name="expiryMonth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Month *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-expiry-month">
                                  <SelectValue placeholder="MM" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Array.from({ length: 12 }, (_, i) => (
                                  <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>
                                    {String(i + 1).padStart(2, '0')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={fundingForm.control}
                        name="expiryYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Year *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-expiry-year">
                                  <SelectValue placeholder="YYYY" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Array.from({ length: 10 }, (_, i) => {
                                  const year = new Date().getFullYear() + i;
                                  return (
                                    <SelectItem key={year} value={String(year)}>
                                      {year}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={fundingForm.control}
                        name="cvv"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CVV *</FormLabel>
                            <FormControl>
                              <Input placeholder="123" {...field} data-testid="input-cvv" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </form>
            </Form>
          )}

          {/* Wallet Preferences Step */}
          {currentStep === 3 && (
            <Form {...preferencesForm}>
              <form className="space-y-4">
                <FormField
                  control={preferencesForm.control}
                  name="lowBalanceThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Low Balance Alert Threshold *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="100" 
                          type="number" 
                          {...field} 
                          data-testid="input-low-balance-threshold"
                        />
                      </FormControl>
                      <p className="text-sm text-muted-foreground">
                        You'll receive an alert when your wallet balance falls below this amount.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={preferencesForm.control}
                  name="autoTopupEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-auto-topup"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Enable Auto Top-up</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Automatically add funds when balance is low
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {preferencesForm.watch("autoTopupEnabled") && (
                  <FormField
                    control={preferencesForm.control}
                    name="autoTopupAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Auto Top-up Amount *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="500" 
                            type="number" 
                            {...field} 
                            data-testid="input-auto-topup-amount"
                          />
                        </FormControl>
                        <p className="text-sm text-muted-foreground">
                          Amount to add when auto top-up is triggered.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </form>
            </Form>
          )}

          {/* Terms Step */}
          {currentStep === 4 && (
            <Form {...termsForm}>
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Important Legal Agreements</h4>
                  <p className="text-sm text-muted-foreground">
                    Please review and accept the following terms to complete your wallet setup.
                  </p>
                </div>

                <FormField
                  control={termsForm.control}
                  name="agreedToColumnTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-column-terms"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>I agree to Column's Terms of Service and Privacy Policy *</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          By checking this box, you agree to Column's banking terms and conditions.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={termsForm.control}
                  name="agreedToPlatformTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-platform-terms"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>I agree to WashOut Pro's Platform Terms *</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          By checking this box, you agree to our platform's payment processing terms.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm text-amber-800">
                      Your wallet will be activated once Column verifies your business information. 
                      This typically takes 1-2 business days.
                    </p>
                  </div>
                </div>
              </div>
            </Form>
          )}

          {/* Complete Step */}
          {currentStep === 5 && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold">Wallet Setup Complete!</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your Column wallet has been successfully configured. You can now start managing 
                your business finances and processing payments from drivers.
              </p>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">What's Next?</h4>
                <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
                  <li>Your account is being verified by Column</li>
                  <li>You'll receive an email once verification is complete</li>
                  <li>Start adding washout locations to your account</li>
                  <li>Begin accepting payments from drivers</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex justify-between p-6 bg-gray-50">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? onCancel : handlePrevious}
            disabled={setupWalletMutation.isPending}
            data-testid="button-wizard-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {currentStep === 0 ? 'Cancel' : 'Previous'}
          </Button>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={setupWalletMutation.isPending}
              data-testid="button-wizard-next"
            >
              {currentStep === WIZARD_STEPS.length - 2 ? 'Complete Setup' : 'Next'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={onComplete}
              data-testid="button-wizard-finish"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}