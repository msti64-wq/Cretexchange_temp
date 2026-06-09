import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  type DriverPayoutAction,
  type DriverStripeRequirements,
  resolveDriverPayoutSettingsState,
} from "@/lib/driverPayoutSettings";

interface DriverPayoutSettingsProps {
  featureEnabled: boolean;
  featureLoading?: boolean;
  onStatusRefresh?: () => void;
}

function getStatusBadgeVariant(status: string) {
  if (status === "payouts_ready") return "default";
  if (status === "setup_started" || status === "action_required") return "secondary";
  return "outline";
}

function formatDebugBoolean(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

export function DriverPayoutSettings({
  featureEnabled,
  featureLoading = false,
  onStatusRefresh,
}: DriverPayoutSettingsProps) {
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    data: requirements,
    isLoading: requirementsLoading,
    error: requirementsError,
    refetch,
  } = useQuery<DriverStripeRequirements>({
    queryKey: ["/api/drivers/stripe-status"],
    enabled: featureEnabled,
    refetchInterval: (query) => featureEnabled && query.state.fetchFailureCount < 3 ? 30000 : false,
  });

  const handleOnboardingResponse = (data: any) => {
    const onboardingUrl = data?.url || data?.onboardingUrl;

    if (onboardingUrl) {
      setIsRedirecting(true);
      window.location.href = onboardingUrl;
      return;
    }

    if (data?.onboardingComplete) {
      refetch();
      onStatusRefresh?.();
      return;
    }

    toast({
      title: "Stripe payout setup failed",
      description: "Stripe onboarding link was not returned. Please try again.",
      variant: "destructive",
    });
  };

  const connectBankMutation = useMutation({
    mutationFn: async () => {
      const onboardingResponse = await apiRequest("GET", "/api/drivers/stripe-onboarding");
      return onboardingResponse.json();
    },
    onSuccess: handleOnboardingResponse,
    onError: (error: Error) => {
      void refetch();
      onStatusRefresh?.();
      toast({
        title: "Stripe payout setup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resumeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/drivers/stripe-onboarding");
      return response.json();
    },
    onSuccess: handleOnboardingResponse,
    onError: (error: Error) => {
      void refetch();
      onStatusRefresh?.();
      toast({
        title: "Stripe payout setup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshStatus = async () => {
    await refetch();
    onStatusRefresh?.();
  };

  const isBusy = connectBankMutation.isPending || resumeOnboardingMutation.isPending || isRedirecting;
  const state = resolveDriverPayoutSettingsState({
    featureEnabled,
    featureLoading: featureLoading || requirementsLoading,
    requirements,
    isBusy,
  });

  const runAction = (action: DriverPayoutAction) => {
    if (action === "connect_bank_account") {
      connectBankMutation.mutate();
      return;
    }

    if (action === "resume_stripe_onboarding") {
      resumeOnboardingMutation.mutate();
      return;
    }

    refreshStatus();
  };

  const statusIcon = state.status === "payouts_ready"
    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
    : <AlertCircle className="h-5 w-5 text-muted-foreground" />;

  const primaryTestId = state.primaryAction.action === "connect_bank_account"
    ? "button-driver-connect-bank-account"
    : state.primaryAction.action === "resume_stripe_onboarding"
      ? "button-driver-resume-stripe-onboarding"
      : "button-driver-view-stripe-status";
  const currentlyDue = requirements?.requirementsCurrentlyDue ?? requirements?.currentlyDue ?? requirements?.requirements?.currently_due ?? [];
  const connectedAccountIdExists = requirements?.connectedAccountIdExists ?? Boolean(requirements?.stripeAccountId || requirements?.accountId);
  const onboardingComplete = requirements?.onboardingComplete ?? requirements?.isVerified;
  const payoutsEnabled = requirements?.payoutsEnabled ?? requirements?.payouts_enabled;
  const chargesEnabled = requirements?.chargesEnabled ?? requirements?.charges_enabled;

  return (
    <Card data-testid="card-driver-payout-settings">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Payouts
          </CardTitle>
          <Badge variant={getStatusBadgeVariant(state.status)} data-testid="text-driver-stripe-payout-status">
            {state.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
          {statusIcon}
          <div className="space-y-1">
            <p className="text-sm font-medium">{state.statusLabel}</p>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            {requirementsError && featureEnabled && (
              <p className="text-sm text-destructive">
                Stripe status could not be loaded. Use View Stripe Status to retry.
              </p>
            )}
          </div>
        </div>

        {requirements?.hasAccount && (
          <div
            className="grid gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-2"
            data-testid="debug-driver-stripe-payouts"
          >
            <div>
              <span className="font-medium text-foreground">Connected account exists: </span>
              <span data-testid="text-driver-stripe-connected-account-exists">
                {formatDebugBoolean(connectedAccountIdExists)}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">Onboarding complete: </span>
              <span data-testid="text-driver-stripe-onboarding-complete">
                {formatDebugBoolean(onboardingComplete)}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">Payouts enabled: </span>
              <span data-testid="text-driver-stripe-payouts-enabled">
                {formatDebugBoolean(payoutsEnabled)}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">Charges enabled: </span>
              <span data-testid="text-driver-stripe-charges-enabled">
                {formatDebugBoolean(chargesEnabled)}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="font-medium text-foreground">Currently due: </span>
              <span data-testid="text-driver-stripe-currently-due">
                {currentlyDue.length > 0 ? currentlyDue.join(", ") : "None"}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {state.primaryAction.visible && (
            <Button
              type="button"
              onClick={() => runAction(state.primaryAction.action)}
              disabled={state.primaryAction.disabled}
              className="flex-1"
              data-testid={primaryTestId}
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to Stripe...
                </>
              ) : state.primaryAction.action === "view_stripe_status" ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {state.primaryAction.label}
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {state.primaryAction.label}
                </>
              )}
            </Button>
          )}

          {state.secondaryActions
            .filter((action) => action.visible)
            .map((action) => (
              <Button
                key={action.action}
                type="button"
                variant="outline"
                onClick={() => runAction(action.action)}
                disabled={action.disabled}
                data-testid={action.action === "view_stripe_status"
                  ? "button-driver-view-stripe-status"
                  : "button-driver-resume-stripe-onboarding"}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
