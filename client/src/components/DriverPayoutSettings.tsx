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
  if (status === "connected") return "default";
  if (status === "setup_incomplete") return "secondary";
  return "outline";
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
    queryKey: ["/api/drivers/stripe-requirements"],
    enabled: featureEnabled,
    refetchInterval: featureEnabled ? 30000 : false,
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
      const sessionResponse = await apiRequest("POST", "/api/drivers/bank-connect/session", {});
      const sessionData = await sessionResponse.json();

      if (sessionData.url || sessionData.onboardingUrl || sessionData.onboardingComplete) {
        return sessionData;
      }

      const onboardingResponse = await apiRequest("GET", "/api/drivers/stripe-onboarding");
      return onboardingResponse.json();
    },
    onSuccess: handleOnboardingResponse,
    onError: (error: Error) => {
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

  const statusIcon = state.status === "connected"
    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
    : <AlertCircle className="h-5 w-5 text-muted-foreground" />;

  const primaryTestId = state.primaryAction.action === "connect_bank_account"
    ? "button-driver-connect-bank-account"
    : state.primaryAction.action === "resume_stripe_onboarding"
      ? "button-driver-resume-stripe-onboarding"
      : "button-driver-view-stripe-status";

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
