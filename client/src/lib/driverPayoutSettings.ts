export type DriverPayoutStatus =
  | "payouts_disabled"
  | "not_connected"
  | "setup_incomplete"
  | "connected";

export type DriverPayoutAction =
  | "connect_bank_account"
  | "resume_stripe_onboarding"
  | "view_stripe_status";

export interface DriverStripeRequirements {
  hasAccount: boolean;
  isVerified?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  hasBlockingRequirements?: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
  };
}

export interface DriverPayoutActionState {
  action: DriverPayoutAction;
  label: string;
  disabled: boolean;
  visible: boolean;
}

export interface DriverPayoutSettingsState {
  status: DriverPayoutStatus;
  statusLabel: "Payouts Disabled" | "Not Connected" | "Setup Incomplete" | "Stripe Connected";
  primaryAction: DriverPayoutActionState;
  secondaryActions: DriverPayoutActionState[];
  featureAvailable: boolean;
  message: string;
}

export function getDriverPayoutStatus(requirements?: DriverStripeRequirements | null): DriverPayoutStatus {
  if (!requirements?.hasAccount) {
    return "not_connected";
  }

  const currentlyDue = requirements.requirements?.currently_due ?? [];
  const pastDue = requirements.requirements?.past_due ?? [];

  if (
    requirements.isVerified ||
    (requirements.payouts_enabled && !requirements.hasBlockingRequirements && currentlyDue.length === 0 && pastDue.length === 0)
  ) {
    return "connected";
  }

  return "setup_incomplete";
}

export function getDriverPayoutStatusLabel(status: DriverPayoutStatus): DriverPayoutSettingsState["statusLabel"] {
  switch (status) {
    case "connected":
      return "Stripe Connected";
    case "setup_incomplete":
      return "Setup Incomplete";
    case "payouts_disabled":
      return "Payouts Disabled";
    case "not_connected":
    default:
      return "Not Connected";
  }
}

export function resolveDriverPayoutSettingsState(params: {
  featureEnabled: boolean;
  featureLoading?: boolean;
  requirements?: DriverStripeRequirements | null;
  isBusy?: boolean;
}): DriverPayoutSettingsState {
  const status = getDriverPayoutStatus(params.requirements);
  const actionDisabled = Boolean(params.featureLoading || params.isBusy || !params.featureEnabled);

  if (!params.featureEnabled) {
    return {
      status: "payouts_disabled",
      statusLabel: "Payouts Disabled",
      featureAvailable: false,
      primaryAction: {
        action: "connect_bank_account",
        label: "Connect Bank Account",
        disabled: true,
        visible: false,
      },
      secondaryActions: [],
      message: "Stripe payouts are not enabled yet.",
    };
  }

  if (status === "connected") {
    return {
      status,
      statusLabel: "Stripe Connected",
      featureAvailable: true,
      primaryAction: {
        action: "view_stripe_status",
        label: "View Payout Status",
        disabled: Boolean(params.featureLoading || params.isBusy),
        visible: true,
      },
      secondaryActions: [],
      message: "Stripe connected.",
    };
  }

  if (status === "setup_incomplete") {
    return {
      status,
      statusLabel: "Setup Incomplete",
      featureAvailable: true,
      primaryAction: {
        action: "resume_stripe_onboarding",
        label: "Resume Stripe Onboarding",
        disabled: actionDisabled,
        visible: true,
      },
      secondaryActions: [
        {
          action: "view_stripe_status",
          label: "View Payout Status",
          disabled: Boolean(params.featureLoading || params.isBusy),
          visible: true,
        },
      ],
      message: "Stripe setup incomplete.",
    };
  }

  return {
    status,
    statusLabel: "Not Connected",
    featureAvailable: true,
    primaryAction: {
      action: "connect_bank_account",
      label: "Connect Bank Account",
      disabled: actionDisabled,
      visible: true,
    },
    secondaryActions: [],
    message: "Stripe not connected.",
  };
}
