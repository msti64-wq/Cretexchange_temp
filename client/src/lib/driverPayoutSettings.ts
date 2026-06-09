export type DriverPayoutStatus =
  | "payouts_disabled"
  | "not_started"
  | "setup_started"
  | "action_required"
  | "payouts_ready";

export type DriverPayoutAction =
  | "connect_bank_account"
  | "resume_stripe_onboarding"
  | "view_stripe_status";

export interface DriverStripeRequirements {
  hasAccount: boolean;
  stripeAccountId?: string | null;
  stripeConnectAccountId?: string | null;
  accountId?: string;
  connectedAccountIdExists?: boolean;
  onboardingComplete?: boolean;
  status?: "not_started" | "setup_started" | "action_required" | "payouts_ready";
  isVerified?: boolean;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  detailsSubmitted?: boolean;
  hasBlockingRequirements?: boolean;
  requirementsCurrentlyDue?: string[];
  requirementsPastDue?: string[];
  currentlyDue?: string[];
  pastDue?: string[];
  externalAccountsCount?: number;
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
  statusLabel: "Payouts Disabled" | "Not Started" | "Resume Onboarding" | "Action Required" | "Payouts Ready";
  primaryAction: DriverPayoutActionState;
  secondaryActions: DriverPayoutActionState[];
  featureAvailable: boolean;
  message: string;
}

export function getDriverPayoutStatus(requirements?: DriverStripeRequirements | null): DriverPayoutStatus {
  if (requirements?.status) {
    return requirements.status;
  }

  if (!requirements?.hasAccount && !requirements?.stripeConnectAccountId && !requirements?.accountId) {
    return "not_started";
  }

  const payoutsEnabled = requirements.payoutsEnabled ?? requirements.payouts_enabled;

  if (requirements.onboardingComplete || requirements.isVerified || payoutsEnabled) {
    return "payouts_ready";
  }

  const detailsSubmitted = requirements.detailsSubmitted ?? requirements.details_submitted;
  if (detailsSubmitted === false) {
    return "setup_started";
  }

  return "action_required";
}

export function getDriverPayoutStatusLabel(status: DriverPayoutStatus): DriverPayoutSettingsState["statusLabel"] {
  switch (status) {
    case "payouts_ready":
      return "Payouts Ready";
    case "action_required":
      return "Action Required";
    case "setup_started":
      return "Resume Onboarding";
    case "payouts_disabled":
      return "Payouts Disabled";
    case "not_started":
    default:
      return "Not Started";
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

  if (status === "payouts_ready") {
    return {
      status,
      statusLabel: "Payouts Ready",
      featureAvailable: true,
      primaryAction: {
        action: "view_stripe_status",
        label: "View Payout Status",
        disabled: Boolean(params.featureLoading || params.isBusy),
        visible: true,
      },
      secondaryActions: [],
      message: "Stripe payouts are ready.",
    };
  }

  if (status === "setup_started" || status === "action_required") {
    return {
      status,
      statusLabel: getDriverPayoutStatusLabel(status),
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
      message: status === "setup_started"
        ? "Stripe account setup has started. Resume onboarding to add bank and verification details."
        : "Stripe needs more information before payouts can be enabled.",
    };
  }

  return {
    status,
    statusLabel: "Not Started",
    featureAvailable: true,
    primaryAction: {
      action: "connect_bank_account",
      label: "Connect Bank Account",
      disabled: actionDisabled,
      visible: true,
    },
    secondaryActions: [],
    message: "Set up Stripe payouts to receive optional owner-funded tips.",
  };
}
