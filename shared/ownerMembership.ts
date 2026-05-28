export type OwnerMembershipStatus =
  | "active"
  | "waived"
  | "pending_review"
  | "expired"
  | "suspended";

export interface OwnerMembershipState {
  membershipStatus: OwnerMembershipStatus;
  dashboardAccessAllowed: boolean;
  accountStatusMessage?: string;
}

export function resolveOwnerMembershipState(owner: {
  membershipStatus?: string | null;
  isApproved?: boolean | null;
  membershipPaymentMethod?: string | null;
  subscriptionStatus?: string | null;
  walletStatus?: string | null;
}): OwnerMembershipState {
  const storedStatus = owner.membershipStatus;

  if (storedStatus === "waived") {
    return {
      membershipStatus: "waived",
      dashboardAccessAllowed: true,
    };
  }

  if (storedStatus === "active") {
    return {
      membershipStatus: "active",
      dashboardAccessAllowed: true,
    };
  }

  if (storedStatus === "expired") {
    return {
      membershipStatus: "expired",
      dashboardAccessAllowed: false,
      accountStatusMessage: "Your account is currently expired. Please contact an administrator to review your status.",
    };
  }

  if (storedStatus === "suspended") {
    return {
      membershipStatus: "suspended",
      dashboardAccessAllowed: false,
      accountStatusMessage: "Your account is currently suspended. Please contact an administrator to review your status.",
    };
  }

  if (storedStatus === "pending_review") {
    return {
      membershipStatus: "pending_review",
      dashboardAccessAllowed: false,
      accountStatusMessage: "Thank you for signing up. Your owner account is currently under review. Most applications are reviewed and approved within 24 hours. You will receive confirmation once your account has been approved.",
    };
  }

  if (owner.membershipPaymentMethod === "waived") {
    return {
      membershipStatus: "waived",
      dashboardAccessAllowed: true,
    };
  }

  if (owner.walletStatus === "suspended") {
    return {
      membershipStatus: "suspended",
      dashboardAccessAllowed: false,
      accountStatusMessage: "Your account is currently suspended. Please contact an administrator to review your status.",
    };
  }

  if (owner.subscriptionStatus === "past_due") {
    return {
      membershipStatus: "expired",
      dashboardAccessAllowed: false,
      accountStatusMessage: "Your account is currently expired. Please contact an administrator to review your status.",
    };
  }

  if (owner.isApproved) {
    return {
      membershipStatus: "active",
      dashboardAccessAllowed: true,
    };
  }

  return {
    membershipStatus: "pending_review",
    dashboardAccessAllowed: false,
    accountStatusMessage: "Thank you for signing up. Your owner account is currently under review. Most applications are reviewed and approved within 24 hours. You will receive confirmation once your account has been approved.",
  };
}
