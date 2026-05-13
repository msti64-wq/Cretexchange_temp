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
 * Uses Stripe Financial Connections for instant, secure bank verification
 * Works for both drivers (payouts) and owners (wallet funding)
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

      // Step 1: Create Financial Connections session
      const endpoint = userType === 'driver' 
        ? '/api/drivers/bank-connect/session'
        : '/api/owners/bank-connect/session';

      const sessionResponse = await apiRequest('POST', endpoint, {});
      const sessionData = await sessionResponse.json();

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
      const completeEndpoint = userType === 'driver'
        ? '/api/drivers/bank-connect/complete'
        : '/api/owners/bank-connect/complete';

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
