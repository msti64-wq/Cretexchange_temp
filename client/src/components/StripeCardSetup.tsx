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
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: "Card setup failed",
          description: error.message,
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

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
        <PaymentElement />
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
  const { toast } = useToast();

  useEffect(() => {
    // Create Setup Intent when component mounts
    apiRequest("POST", "/api/owners/create-setup-intent")
      .then((res) => res.json())
      .then((data) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          throw new Error('No client secret returned');
        }
      })
      .catch((error) => {
        toast({
          title: "Failed to initialize card setup",
          description: error.message,
          variant: "destructive",
        });
      });
  }, []);

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

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
