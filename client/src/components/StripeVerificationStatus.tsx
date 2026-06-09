import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, AlertTriangle, ExternalLink, Shield, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface StripeVerificationStatusProps {
  userRole: 'driver' | 'owner';
  purpose?: 'owner-payments' | 'driver-tip-payouts';
}

interface StripeRequirements {
  hasAccount: boolean;
  accountId?: string;
  type?: string;
  requirements?: {
    currently_due: string[];
    currently_due_readable: string[];
    eventually_due: string[];
    eventually_due_readable: string[];
    past_due: string[];
    past_due_readable: string[];
    current_deadline: number | null;
  };
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  isVerified?: boolean;
  needsFullSsn?: boolean;
  needsIdDocument?: boolean;
  hasBlockingRequirements?: boolean;
  message?: string;
}

export default function StripeVerificationStatus({ userRole, purpose = 'owner-payments' }: StripeVerificationStatusProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  
  const endpoint = userRole === 'driver' 
    ? '/api/drivers/stripe-requirements' 
    : '/api/owners/stripe-requirements';
  
  const onboardingEndpoint = userRole === 'driver'
    ? '/api/drivers/stripe-onboarding'
    : '/api/owners/stripe-onboarding';

  const { data: requirements, isLoading, error, refetch } = useQuery<StripeRequirements>({
    queryKey: [endpoint],
    refetchInterval: (query) => query.state.fetchFailureCount >= 3 ? false : 30000,
  });

  const startOnboardingMutation = useMutation({
    mutationFn: async () => {
      setOnboardingError(null);
      const response = await apiRequest('GET', onboardingEndpoint);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.onboardingUrl) {
        setIsRedirecting(true);
        window.location.href = data.onboardingUrl;
      } else if (data.onboardingComplete) {
        refetch();
      }
    },
    onError: (error: Error) => {
      setOnboardingError(error.message || 'Failed to start Stripe setup');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Checking verification status...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to check verification status. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!requirements?.hasAccount) {
    const canStartDriverPayoutSetup = purpose === 'driver-tip-payouts' && userRole === 'driver';

    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>
          {purpose === 'driver-tip-payouts' && userRole === 'driver'
            ? 'Optional Tip Payouts Not Set Up'
            : 'Payment Account Not Set Up'}
        </AlertTitle>
        <AlertDescription>
          <div className="space-y-3">
            <p>
              {canStartDriverPayoutSetup
                ? "Your optional tip payout setup hasn't been created yet."
                : 'Your payment account hasn\'t been created yet. Complete your profile to set up payments.'}
            </p>
            {canStartDriverPayoutSetup && (
              <Button
                onClick={() => startOnboardingMutation.mutate()}
                disabled={startOnboardingMutation.isPending || isRedirecting}
                data-testid="button-setup-driver-stripe-payments"
              >
                {(startOnboardingMutation.isPending || isRedirecting) ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Set Up Stripe Payments
                  </>
                )}
              </Button>
            )}
            {onboardingError && (
              <p className="text-sm text-destructive" data-testid="text-stripe-onboarding-error">
                {onboardingError}
              </p>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const { isVerified, hasBlockingRequirements, needsFullSsn, needsIdDocument } = requirements;

  if (isVerified) {
    return (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800 dark:text-green-200">
          {purpose === 'driver-tip-payouts' && userRole === 'driver' ? 'Tip Payouts Ready' : 'Account Verified'}
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          {purpose === 'driver-tip-payouts' && userRole === 'driver'
            ? 'Your optional tip payout setup is verified and ready to receive owner-funded tips.'
            : `Your payment account is fully verified and ready to ${userRole === 'driver' ? 'receive payments' : 'process transactions'}.`}
        </AlertDescription>
      </Alert>
    );
  }

  const allRequirements = [
    ...(requirements.requirements?.currently_due_readable || []),
    ...(requirements.requirements?.past_due_readable || []),
  ];
  const uniqueRequirements = Array.from(new Set(allRequirements));

  const isPastDue = (requirements.requirements?.past_due?.length || 0) > 0;

  return (
    <Card className={isPastDue ? 'border-red-300 dark:border-red-700' : 'border-yellow-300 dark:border-yellow-700'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPastDue ? (
              <XCircle className="h-5 w-5 text-red-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            <CardTitle className="text-lg">
              {purpose === 'driver-tip-payouts' && userRole === 'driver'
                ? (isPastDue ? 'Tip Payout Verification Required' : 'Complete Tip Payout Setup')
                : (isPastDue ? 'Verification Required' : 'Complete Verification')}
            </CardTitle>
          </div>
          <Badge variant={isPastDue ? 'destructive' : 'secondary'}>
            {purpose === 'driver-tip-payouts' && userRole === 'driver'
              ? (isPastDue ? 'Action Required' : 'Optional')
              : (isPastDue ? 'Action Required' : 'Pending')}
          </Badge>
        </div>
        <CardDescription>
          {purpose === 'driver-tip-payouts' && userRole === 'driver'
            ? (isPastDue
              ? 'Your optional tip payout setup is missing required information and cannot receive owner-funded tips until resolved.'
              : 'This optional setup is only needed if you want to receive owner-funded tips. Washouts and lottery entries do not require it.')
            : (isPastDue
              ? 'Your payment account is missing required information and cannot process payments until resolved.'
              : 'Complete verification to enable full payment functionality.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {uniqueRequirements.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Missing Information:</p>
            <ul className="list-disc list-inside space-y-1 text-sm" data-testid="requirements-list">
              {uniqueRequirements.map((req, index) => (
                <li key={index} className="text-foreground">{req}</li>
              ))}
            </ul>
          </div>
        )}

        {(needsFullSsn || needsIdDocument) && (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
              {purpose === 'driver-tip-payouts' && userRole === 'driver'
                ? 'This optional setup is only needed if you want to receive owner-funded tips.'
                : needsFullSsn && needsIdDocument 
                  ? 'You will need to provide your full Social Security Number and photo ID for verification.'
                  : needsFullSsn 
                    ? 'You will need to provide your full Social Security Number for verification.'
                    : 'You will need to upload a photo ID (driver\'s license or passport) for verification.'}
              {' '}This information is securely collected by Stripe and never stored on our servers.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={() => startOnboardingMutation.mutate()}
            disabled={startOnboardingMutation.isPending || isRedirecting}
            className="flex-1"
            variant={isPastDue ? 'destructive' : 'default'}
            data-testid="button-complete-verification"
          >
            {(startOnboardingMutation.isPending || isRedirecting) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Redirecting to Stripe...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                {purpose === 'driver-tip-payouts' && userRole === 'driver'
                  ? 'Set Up Tip Payouts'
                  : 'Complete Verification'}
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            data-testid="button-refresh-status"
          >
            Refresh Status
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          You will be redirected to Stripe's secure website to complete the setup.
          After completing the process, you'll be returned to this page automatically.
        </p>
      </CardContent>
    </Card>
  );
}
