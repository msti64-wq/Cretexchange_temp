import { useState, useEffect } from "react";
import { useStripe, useElements, PaymentElement, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface CardSetupFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function CardSetupForm({ onSuccess, onCancel }: CardSetupFormProps) {
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

    try {
      // Confirm the setup with Stripe
      console.log('🔄 Confirming setup intent...');
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        console.error('❌ Stripe confirmSetup error:', {
          type: error.type,
          code: error.code,
          message: error.message,
          decline_code: (error as any).decline_code,
          param: error.param,
        });
        
        // Map decline codes to user-friendly messages
        const declineMessages: Record<string, string> = {
          'insufficient_funds': 'Card has insufficient funds. Please use a different card.',
          'card_declined': 'Card was declined by your bank. Please contact your bank or try a different card.',
          'do_not_honor': 'Bank declined this transaction. Please contact your bank or try a different card.',
          'expired_card': 'Card has expired. Please use a valid card.',
          'incorrect_cvc': 'Security code (CVV) is incorrect. Please check and try again.',
          'incorrect_number': 'Card number is incorrect. Please check and try again.',
          'invalid_expiry_month': 'Expiration month is invalid.',
          'invalid_expiry_year': 'Expiration year is invalid.',
          'generic_decline': 'Card was declined. Please contact your bank or try a different card.',
          'fraudulent': 'Transaction flagged as potentially fraudulent. Please contact your bank.',
          'lost_card': 'Card reported lost. Please use a different card.',
          'stolen_card': 'Card reported stolen. Please use a different card.',
        };
        
        // Provide more specific error messages based on error type
        let errorDescription = error.message || 'Unknown error occurred';
        const declineCode = (error as any).decline_code;
        
        if (declineCode && declineMessages[declineCode]) {
          errorDescription = declineMessages[declineCode];
        } else if (error.type === 'card_error') {
          errorDescription = error.message || 'Card was declined. Please try a different card.';
        } else if (error.type === 'validation_error') {
          errorDescription = `Invalid card details: ${error.message}`;
        } else if (error.type === 'api_error') {
          errorDescription = 'Connection error. Please check your internet and try again.';
        }
        
        toast({
          title: "Card setup failed",
          description: errorDescription,
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      console.log('✅ Setup intent confirmed:', setupIntent?.id);

      if (setupIntent && setupIntent.payment_method) {
        // Save the payment method ID to our backend
        const response = await apiRequest("POST", "/api/owners/save-payment-method", {
          paymentMethodId: setupIntent.payment_method,
        });

        const data = await response.json();

        if (response.ok) {
          toast({
            title: "Card added successfully",
            description: "Your credit card has been saved for platform fees.",
          });
          onSuccess();
        } else {
          throw new Error(data.message || 'Failed to save payment method');
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to add card",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div data-testid="stripe-payment-element">
        <PaymentElement 
          onLoadError={(event) => {
            console.error('💥 Stripe Elements onLoadError - Full event:', event);
            console.error('💥 Error object:', event.error);
            console.error('💥 Error type:', event.error?.type);
            console.error('💥 Error code:', event.error?.code);
            console.error('💥 Error message:', event.error?.message);
            console.error('💥 Error decline_code:', event.error?.decline_code);
            
            const errorMsg = event.error?.message || 'Failed to load payment form. Please check your internet connection and try again.';
            toast({
              title: "Payment Form Error",
              description: errorMsg,
              variant: "destructive",
            });
          }}
          onReady={() => {
            console.log('✅ Stripe PaymentElement is ready');
          }}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          data-testid="button-cancel-card"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          data-testid="button-save-card"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Save Card'
          )}
        </Button>
      </div>
    </form>
  );
}

export default function StripeCardSetup({ onSuccess, onCancel }: CardSetupFormProps) {
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    console.log('🔄 StripeCardSetup: Component mounted, creating setup intent...');
    
    // Create Setup Intent when component mounts
    apiRequest("POST", "/api/owners/create-setup-intent")
      .then((res) => {
        console.log('✅ Setup intent response received:', res.status);
        return res.json();
      })
      .then((data) => {
        console.log('📦 Setup intent data:', { hasClientSecret: !!data.clientSecret });
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          console.log('✅ Client secret set, Stripe form should render');
        } else {
          throw new Error('No client secret returned');
        }
      })
      .catch((error) => {
        console.error('❌ Error creating setup intent:', error);
        const errorMessage = error.message || 'Failed to initialize card setup';
        setError(errorMessage);
        toast({
          title: "Failed to initialize card setup",
          description: errorMessage,
          variant: "destructive",
        });
      });
  }, [toast]);

  console.log('🎨 StripeCardSetup: Rendering with state:', { hasError: !!error, hasClientSecret: !!clientSecret });

  if (error) {
    console.log('❌ Rendering error state:', error);
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-destructive font-semibold">{error}</p>
        <Button onClick={onCancel} variant="outline">
          Close
        </Button>
      </div>
    );
  }

  if (!clientSecret) {
    console.log('⏳ Rendering loading state');
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Initializing payment form...</span>
        </div>
      </div>
    );
  }

  console.log('✅ Rendering Stripe Elements form');
  return (
    <Elements 
      stripe={stripePromise} 
      options={{ 
        clientSecret,
        appearance: {
          theme: 'stripe',
        },
      }}
    >
      <CardSetupForm onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}

// Listen for Stripe errors globally
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.message?.includes('stripe') || event.message?.includes('payment')) {
      console.error('🚨 Global Stripe error caught:', event);
    }
  });
}
