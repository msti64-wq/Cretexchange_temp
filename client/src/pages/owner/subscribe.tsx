import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MobileNav } from "@/components/MobileNav";
import { Crown, Check, CreditCard, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe only if public key is available
let stripePromise: Promise<any> | null = null;
if (import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
} else {
  console.warn('VITE_STRIPE_PUBLIC_KEY not found - Stripe UI will be disabled');
}

const SubscribeForm = ({ clientSecret, onSuccess }: { clientSecret: string; onSuccess: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin,
      },
      redirect: 'if_required',
    });

    setIsProcessing(false);

    if (error) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Subscription Activated",
        description: "Your subscription has been activated successfully!",
      });
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || isProcessing}
        data-testid="button-subscribe"
      >
        {isProcessing ? "Processing..." : "Subscribe Now"}
      </Button>
    </form>
  );
};

export default function OwnerSubscribe() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("monthly");
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/owners/subscribe");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        toast({
          title: "Already Subscribed",
          description: data.message || "You already have an active subscription.",
        });
        setLocation('/');
      }
    },
    onError: (error) => {
      toast({
        title: "Subscription Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubscribe = () => {
    subscribeMutation.mutate();
  };

  const handleSubscriptionSuccess = () => {
    setLocation('/');
  };

  const plans = [
    {
      id: "monthly",
      name: "Monthly",
      price: 29,
      period: "month",
      features: [
        "Unlimited locations",
        "Real-time driver tracking",
        "Photo verification",
        "Payment processing",
        "Customer support",
        "Analytics dashboard"
      ],
      popular: false,
    },
    {
      id: "annual",
      name: "Annual",
      price: 299,
      period: "year",
      originalPrice: 348,
      savings: 49,
      features: [
        "All monthly features",
        "Priority support",
        "Advanced analytics",
        "Custom reporting",
        "API access",
        "White-label options"
      ],
      popular: true,
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
              <h1 className="font-semibold text-lg">Choose Your Plan</h1>
              <p className="text-white/80 text-sm">Upgrade to unlock all features</p>
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
                        <div className="text-sm text-muted-foreground">per {plan.period}</div>
                        {plan.originalPrice && (
                          <div className="text-sm text-muted-foreground">
                            <span className="line-through">${plan.originalPrice}</span>
                            <span className="text-green-600 ml-2">Save ${plan.savings}</span>
                          </div>
                        )}
                      </div>
                    </div>
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
              onClick={handleSubscribe}
              className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              disabled={subscribeMutation.isPending}
              data-testid="button-start-subscription"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              {subscribeMutation.isPending ? "Setting up..." : "Start Subscription"}
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
                <p>• No setup fees • Cancel anytime • 30-day money-back guarantee</p>
                <p className="mt-2">• 10% processing fee per transaction</p>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Payment Form or Development Mode */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                {clientSecret === 'dev_client_secret' ? 'Development Mode' : 'Complete Your Subscription'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clientSecret === 'dev_client_secret' ? (
                <div className="text-center space-y-4">
                  <p className="text-green-600 font-medium">
                    Your subscription has been activated in development mode!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    In production, this would require payment processing through Stripe.
                  </p>
                  <Button 
                    onClick={handleSubscriptionSuccess} 
                    className="w-full"
                    data-testid="button-dev-continue"
                  >
                    Continue to Dashboard
                  </Button>
                </div>
              ) : stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <SubscribeForm 
                    clientSecret={clientSecret} 
                    onSuccess={handleSubscriptionSuccess}
                  />
                </Elements>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-yellow-600 font-medium">
                    Stripe is not configured
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Payment processing is disabled in development mode.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <MobileNav role="owner" />
    </div>
  );
}
