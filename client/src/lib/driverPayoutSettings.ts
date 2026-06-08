export type DriverPayoutStatus = "not_connected" | "pending_verification" | "active";

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
}

export interface DriverPayoutSettingsState {
  status: DriverPayoutStatus;
  statusLabel: "Not Connected" | "Pending Verification" | "Active";
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
    return "active";
  }

  return "pending_verification";
}

export function getDriverPayoutStatusLabel(status: DriverPayoutStatus): DriverPayoutSettingsState["statusLabel"] {
  switch (status) {
    case "active":
      return "Active";
    case "pending_verification":
      return "Pending Verification";
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
      status,
      statusLabel: getDriverPayoutStatusLabel(status),
      featureAvailable: false,
      primaryAction: {
        action: "connect_bank_account",
        label: "Connect Bank Account",
        disabled: true,
      },
      secondaryActions: [],
      message: "Stripe payouts are not enabled yet.",
    };
  }

  if (status === "active") {
    return {
      status,
      statusLabel: "Active",
      featureAvailable: true,
      primaryAction: {
        action: "view_stripe_status",
        label: "View Stripe Status",
        disabled: Boolean(params.featureLoading || params.isBusy),
      },
      secondaryActions: [],
      message: "Stripe payouts are active and ready for optional owner-funded tips.",
    };
  }

  if (status === "pending_verification") {
    return {
      status,
      statusLabel: "Pending Verification",
      featureAvailable: true,
      primaryAction: {
        action: "resume_stripe_onboarding",
        label: "Resume Stripe Onboarding",
        disabled: actionDisabled,
      },
      secondaryActions: [
        {
          action: "view_stripe_status",
          label: "View Stripe Status",
          disabled: Boolean(params.featureLoading || params.isBusy),
        },
      ],
      message: "Stripe needs more information before optional payouts can be received.",
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
    },
    secondaryActions: [
      {
        action: "view_stripe_status",
        label: "View Stripe Status",
        disabled: Boolean(params.featureLoading || params.isBusy),
      },
    ],
    message: "Connect only if you want to receive optional owner-funded tip payouts.",
  };
}
