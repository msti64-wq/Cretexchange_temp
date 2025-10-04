import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { Crown, Check, CreditCard, ArrowLeft, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Safe Stripe.js loader with proper error handling
let stripePromise: Promise<any> | null = null;
let stripeLoadError: string | null = null;

const initializeStripe = async () => {
  // Return early if already initialized or errored
  if (stripePromise || stripeLoadError) {
    return;
  }

  if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
    console.log('Development mode: Stripe UI disabled - using mock payment flow');
    return;
  }

  try {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
    
    // Test if the promise resolves successfully
    await stripePromise;
  } catch (error) {
    console.error('Failed to load Stripe.js:', error);
    stripeLoadError = error instanceof Error ? error.message : 'Failed to load payment processor';
    stripePromise = null;
  }
};

const SubscribeForm = ({ clientSecret, paymentIntentId, onSuccess }: { 
  clientSecret: string; 
  paymentIntentId: string;
  onSuccess: (paymentIntentId: string) => void 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    if (!stripe || !elements) {
      setPaymentError("Payment system is not ready. Please try again.");
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/owner/subscribe`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setPaymentError(error.message || "Payment failed. Please try again.");
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast({
          title: "Payment Successful",
          description: "Activating your membership...",
        });
        onSuccess(paymentIntent.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setPaymentError(errorMessage);
      toast({
        title: "Payment Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete your $1,500 membership payment to activate your account
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {paymentError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{paymentError}</p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            <Button
              type="submit"
              className="w-full py-6 text-lg font-semibold"
              disabled={!stripe || isProcessing}
              data-testid="button-complete-payment"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {isProcessing ? "Processing Payment..." : "Pay $1,500 & Activate"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};

export default function OwnerSubscribe() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeError, setStripeError] = useState<string | null>(null);

  // Initialize Stripe safely on component mount
  useEffect(() => {
    const loadStripe = async () => {
      try {
        await initializeStripe();
        
        if (stripeLoadError) {
          setStripeError(stripeLoadError);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize payment system';
        setStripeError(errorMessage);
        console.error('Stripe initialization error:', error);
      } finally {
        setStripeLoading(false);
      }
    };

    loadStripe();
  }, []);

  // Create payment intent for membership
  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/owners/create-membership-payment");
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
    },
    onError: (error: any) => {
      toast({
        title: "Payment Setup Failed",
        description: error.message || "Failed to initialize payment",
        variant: "destructive",
      });
    },
  });

  // Activate subscription after successful payment
  const activateMembershipMutation = useMutation({
    mutationFn: async (paymentIntentId: string) => {
      const response = await apiRequest("POST", "/api/owners/subscribe", {
        paymentIntentId
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Membership Activated!",
        description: "Welcome to WashOut Pro. Redirecting to dashboard...",
      });
      setTimeout(() => setLocation('/owner/dashboard'), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Activation Failed",
        description: error.message || "Payment received but activation failed. Please contact support.",
        variant: "destructive",
      });
    },
  });

  const handleStartPayment = () => {
    createPaymentMutation.mutate();
  };

  const handlePaymentSuccess = (confirmedPaymentIntentId: string) => {
    activateMembershipMutation.mutate(confirmedPaymentIntentId);
  };

  const plans = [
    {
      id: "annual",
      name: "Platform Membership",
      price: 1500,
      period: "one-time",
      features: [
        "Unlimited washout locations",
        "Real-time driver tracking",
        "Photo verification for washouts",
        "Automated payment processing",
        "Priority customer support",
        "Analytics & reporting dashboard",
        "API access",
        "White-label options"
      ],
      popular: true,
      description: "$100/month per location + one-time $1,500 membership fee"
    }
  ];

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
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Platform Membership</h1>
              <p className="text-white/80 text-sm">Join WashOut Pro</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {!clientSecret ? (
          <>
            {/* Plan Selection */}
            <div className="space-y-4">
              {plans.map((plan) => (
                <Card 
                  key={plan.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedPlan === plan.id ? 'ring-2 ring-primary' : ''
                  } ${plan.popular ? 'border-primary' : ''}`}
                  onClick={() => setSelectedPlan(plan.id as "monthly" | "annual")}
                  data-testid={`card-plan-${plan.id}`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        {plan.name}
                        {plan.popular && (
                          <Badge className="ml-2" data-testid="badge-popular">Popular</Badge>
                        )}
                      </CardTitle>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-primary" data-testid={`text-price-${plan.id}`}>
                          ${plan.price}
                        </div>
                        <div className="text-sm text-muted-foreground">{plan.period}</div>
                      </div>
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground mt-2 px-1">{plan.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Subscribe Button */}
            <Button
              onClick={handleStartPayment}
              className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              disabled={createPaymentMutation.isPending}
              data-testid="button-start-subscription"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {createPaymentMutation.isPending ? "Setting up payment..." : "Continue to Payment"}
            </Button>

            {/* Features Summary */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg mb-4">What you get:</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Unlimited locations
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Driver tracking
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Photo verification
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Payment processing
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Analytics dashboard
                  </div>
                  <div className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    24/7 support
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Details */}
            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                <p>• No setup fees • Cancel anytime</p>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Payment Form */
          stripeLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground">Loading payment system...</p>
                </div>
              </CardContent>
            </Card>
          ) : stripeError ? (
            <Card>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center justify-center space-x-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      <p className="font-medium text-yellow-700 dark:text-yellow-300">Payment System Unavailable</p>
                    </div>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">{stripeError}</p>
                    <div className="space-y-2">
                      <Button 
                        onClick={() => window.location.reload()} 
                        variant="outline" 
                        size="sm"
                        data-testid="button-retry-stripe"
                      >
                        Try Again
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Please contact support if this issue persists.
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => setLocation('/')} 
                    variant="ghost"
                    data-testid="button-back-to-dashboard"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : stripePromise && paymentIntentId ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <SubscribeForm 
                clientSecret={clientSecret} 
                paymentIntentId={paymentIntentId}
                onSuccess={handlePaymentSuccess}
              />
            </Elements>
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-blue-700 dark:text-blue-300 font-medium mb-2">
                      Payment Setup Required
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Setting up payment... Please wait.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        )}
      </main>

      <MobileNav role="owner" />
    </div>
  );
}
