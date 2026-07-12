export type DriverPayoutStatus =
  | "payouts_disabled"
  | "loading"
  | "not_started"
  | "setup_started"
  | "action_required"
  | "payout_ready"
  | "status_unavailable"
  | "account_conflict";

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
  onboardingComplete?: boolean | null;
  status?: "not_started" | "setup_started" | "action_required" | "payout_ready" | "payouts_ready" | "status_unavailable" | "account_conflict";
  isVerified?: boolean | null;
  payoutsEnabled?: boolean | null;
  chargesEnabled?: boolean | null;
  payouts_enabled?: boolean | null;
  charges_enabled?: boolean | null;
  details_submitted?: boolean | null;
  detailsSubmitted?: boolean | null;
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
  statusLabel: "Payouts Disabled" | "Loading" | "Not Started" | "Resume Onboarding" | "Action Required" | "Payouts Ready" | "Status Unavailable" | "Account Conflict";
  primaryAction: DriverPayoutActionState;
  secondaryActions: DriverPayoutActionState[];
  featureAvailable: boolean;
  message: string;
}

export function getDriverPayoutStatus(requirements?: DriverStripeRequirements | null): DriverPayoutStatus {
  if (!requirements) {
    return "status_unavailable";
  }

  if (requirements?.status) {
    return requirements.status === "payouts_ready" ? "payout_ready" : requirements.status;
  }

  if (!requirements?.hasAccount && !requirements?.stripeConnectAccountId && !requirements?.accountId) {
    return "not_started";
  }

  const payoutsEnabled = requirements.payoutsEnabled ?? requirements.payouts_enabled;

  if (requirements.onboardingComplete || requirements.isVerified || payoutsEnabled) {
    return "payout_ready";
  }

  const detailsSubmitted = requirements.detailsSubmitted ?? requirements.details_submitted;
  if (detailsSubmitted === false) {
    return "setup_started";
  }

  return "action_required";
}

export function getDriverPayoutStatusLabel(status: DriverPayoutStatus): DriverPayoutSettingsState["statusLabel"] {
  switch (status) {
    case "payout_ready":
      return "Payouts Ready";
    case "action_required":
      return "Action Required";
    case "setup_started":
      return "Resume Onboarding";
    case "payouts_disabled":
      return "Payouts Disabled";
    case "loading":
      return "Loading";
    case "status_unavailable":
      return "Status Unavailable";
    case "account_conflict":
      return "Account Conflict";
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

  if (params.featureLoading) {
    return {
      status: "loading",
      statusLabel: "Loading",
      featureAvailable: true,
      primaryAction: {
        action: "view_stripe_status",
        label: "View Payout Status",
        disabled: true,
        visible: false,
      },
      secondaryActions: [],
      message: "Checking Stripe payout status.",
    };
  }

  const status = getDriverPayoutStatus(params.requirements);

  if (status === "payout_ready") {
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

  if (status === "status_unavailable" || status === "account_conflict") {
    return {
      status,
      statusLabel: getDriverPayoutStatusLabel(status),
      featureAvailable: true,
      primaryAction: {
        action: "view_stripe_status",
        label: "View Payout Status",
        disabled: Boolean(params.featureLoading || params.isBusy),
        visible: true,
      },
      secondaryActions: [],
      message: status === "status_unavailable"
        ? "Stripe payout status is temporarily unavailable. Your existing account has not been changed."
        : "Conflicting Stripe account information requires support review before payout setup can continue.",
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
