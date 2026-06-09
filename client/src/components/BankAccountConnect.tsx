import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Link as LinkIcon } from 'lucide-react';

interface BankAccountConnectProps {
  userType: 'driver' | 'owner';
  onSuccess?: () => void;
  onError?: (error: string) => void;
  buttonText?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary';
  className?: string;
}

/**
 * Standardized Bank Account Connection Component
 * Drivers are redirected to Stripe Connect onboarding for payouts.
 * Owners use Stripe Financial Connections for wallet funding.
 */
export function BankAccountConnect({
  userType,
  onSuccess,
  onError,
  buttonText = 'Connect Bank Account',
  buttonVariant = 'default',
  className = '',
}: BankAccountConnectProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);

      // Step 1: Create Financial Connections session or Stripe-hosted onboarding link.
      const endpoint = userType === 'driver'
        ? '/api/drivers/stripe-onboarding'
        : '/api/owners/bank-connect/session';

      const sessionResponse = userType === 'driver'
        ? await apiRequest('GET', endpoint)
        : await apiRequest('POST', endpoint, {});
      const sessionData = await sessionResponse.json();

      if (userType === 'driver') {
        const onboardingUrl = sessionData.url || sessionData.onboardingUrl;
        if (!onboardingUrl) {
          throw new Error(sessionData.message || 'Stripe onboarding link was not returned. Please try again.');
        }

        window.location.href = onboardingUrl;
        return;
      }

      if (!sessionData.clientSecret) {
        throw new Error('Failed to create bank link session');
      }

      // Step 2: Load Stripe.js and launch Financial Connections
      const stripe = await loadStripe();
      if (!stripe) {
        throw new Error('Failed to load Stripe');
      }

      // Step 3: Collect financial account using Financial Connections
      console.log('📱 Launching Financial Connections UI');
      const { financialConnectionsSession, error: fcError } = await stripe.collectFinancialConnectionsAccounts({
        clientSecret: sessionData.clientSecret,
      });

      console.log('🔄 Financial Connections returned:', {
        hasSession: !!financialConnectionsSession,
        sessionId: financialConnectionsSession?.id,
        hasError: !!fcError,
        errorMessage: fcError?.message,
      });

      if (fcError) {
        console.error('❌ Financial Connections error:', fcError);
        throw new Error(fcError.message || 'Bank linking cancelled or failed');
      }

      if (!financialConnectionsSession) {
        console.error('❌ No session returned - user may have cancelled the flow');
        throw new Error('No session returned from Financial Connections - please try again or use manual bank entry');
      }

      // Step 4: Complete the linking on backend
      const completeEndpoint = '/api/owners/bank-connect/complete';

      const completeResponse = await apiRequest('POST', completeEndpoint, {
        sessionId: financialConnectionsSession.id,
      });
      const completeData = await completeResponse.json();

      toast({
        title: 'Bank Account Connected! ✅',
        description: `${completeData.bankName} ****${completeData.last4} is now linked to your account.`,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Bank connection error:', error);
      
      const errorMessage = error.message || 'Failed to connect bank account';
      toast({
        title: 'Connection Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      variant={buttonVariant}
      className={className}
      data-testid={`button-connect-bank-${userType}`}
    >
      {isConnecting ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <LinkIcon className="w-4 h-4 mr-2" />
          {buttonText}
        </>
      )}
    </Button>
  );
}

// Helper function to load Stripe.js
async function loadStripe() {
  const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  
  if (!stripePublicKey) {
    throw new Error('Stripe public key not configured');
  }

  const { loadStripe: loadStripeJS } = await import('@stripe/stripe-js');
  return loadStripeJS(stripePublicKey);
}
