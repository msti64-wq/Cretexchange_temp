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
import { useLanguage } from "@/lib/i18n";

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

function getTranslatedPayoutStatusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case "payouts_ready":
      return t("driver.payout.payoutsReady");
    case "action_required":
      return t("driver.payout.actionRequired");
    case "setup_started":
      return t("driver.payout.resumeOnboarding");
    case "payouts_disabled":
      return t("driver.payout.payoutsDisabled");
    case "not_started":
    default:
      return t("driver.payout.notStarted");
  }
}

function getTranslatedPayoutMessage(status: string, featureEnabled: boolean, t: (key: string) => string) {
  if (!featureEnabled) return t("driver.payout.disabledMessage");
  if (status === "payouts_ready") return t("driver.payout.readyMessage");
  if (status === "setup_started") return t("driver.payout.startedMessage");
  if (status === "action_required") return t("driver.payout.actionRequiredMessage");
  return t("driver.payout.notStartedMessage");
}

function getTranslatedPayoutActionLabel(action: DriverPayoutAction, t: (key: string) => string) {
  switch (action) {
    case "resume_stripe_onboarding":
      return t("driver.payout.resumeStripeOnboarding");
    case "view_stripe_status":
      return t("driver.payout.viewPayoutStatus");
    case "connect_bank_account":
    default:
      return t("driver.payout.connectBankAccount");
  }
}

export function DriverPayoutSettings({
  featureEnabled,
  featureLoading = false,
  onStatusRefresh,
}: DriverPayoutSettingsProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
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
      title: t("driver.payout.setupFailed"),
      description: t("driver.payout.linkMissing"),
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
        title: t("driver.payout.setupFailed"),
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
        title: t("driver.payout.setupFailed"),
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
  const statusLabel = getTranslatedPayoutStatusLabel(state.status, t);
  const statusMessage = getTranslatedPayoutMessage(state.status, state.featureAvailable, t);

  return (
    <Card data-testid="card-driver-payout-settings">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("driver.payout.stripePayouts")}
          </CardTitle>
          <Badge variant={getStatusBadgeVariant(state.status)} data-testid="text-driver-stripe-payout-status">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
          {statusIcon}
          <div className="space-y-1">
            <p className="text-sm font-medium">{statusLabel}</p>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
            {requirementsError && featureEnabled && (
              <p className="text-sm text-destructive">
                {t("driver.payout.statusLoadFailed")}
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
              <span className="font-medium text-foreground">{t("driver.payout.connectedAccountExists")} </span>
              <span data-testid="text-driver-stripe-connected-account-exists">
                {connectedAccountIdExists ? t("common.yes") : t("common.no")}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t("driver.payout.onboardingComplete")} </span>
              <span data-testid="text-driver-stripe-onboarding-complete">
                {onboardingComplete ? t("common.yes") : t("common.no")}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t("driver.payout.payoutsEnabled")} </span>
              <span data-testid="text-driver-stripe-payouts-enabled">
                {payoutsEnabled ? t("common.yes") : t("common.no")}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t("driver.payout.chargesEnabled")} </span>
              <span data-testid="text-driver-stripe-charges-enabled">
                {chargesEnabled ? t("common.yes") : t("common.no")}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="font-medium text-foreground">{t("driver.payout.currentlyDue")} </span>
              <span data-testid="text-driver-stripe-currently-due">
                {currentlyDue.length > 0 ? currentlyDue.join(", ") : t("common.none")}
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
                  {t("driver.payout.redirecting")}
                </>
              ) : state.primaryAction.action === "view_stripe_status" ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {getTranslatedPayoutActionLabel(state.primaryAction.action, t)}
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {getTranslatedPayoutActionLabel(state.primaryAction.action, t)}
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
                {getTranslatedPayoutActionLabel(action.action, t)}
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
