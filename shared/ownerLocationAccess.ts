import { resolveOwnerMembershipState } from "./ownerMembership";

export interface OwnerLocationAccessState {
  profileCompleted: boolean;
  paymentMethodOnFile: boolean;
  locationSetupOverride: boolean;
  canManageLocations: boolean;
  blockingMessage?: string;
}

export interface DriverLocationVisibilityState {
  visibleToDrivers: boolean;
  exclusionReason?: string;
  ownerMembershipStatus?: string;
}

export function isOwnerProfileComplete(owner: {
  profileCompleted?: boolean | null;
  companyName?: string | null;
  businessLicense?: string | null;
  taxId?: string | null;
} | null | undefined, user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null): boolean {
  if (owner?.profileCompleted) {
    return true;
  }

  if (!owner || !user) {
    return false;
  }

  return Boolean(
    user.firstName?.trim() &&
    user.lastName?.trim() &&
    user.email?.trim() &&
    user.phone?.trim() &&
    user.street?.trim() &&
    user.city?.trim() &&
    user.state?.trim() &&
    user.zip?.trim() &&
    owner.companyName?.trim() &&
    owner.businessLicense?.trim() &&
    owner.taxId?.trim()
  );
}

export function resolveOwnerLocationAccessState(owner: {
  profileCompleted?: boolean | null;
  locationSetupOverride?: boolean | null;
  stripePaymentMethodId?: string | null;
  companyName?: string | null;
  businessLicense?: string | null;
  taxId?: string | null;
} | null | undefined, user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null): OwnerLocationAccessState {
  const profileCompleted = isOwnerProfileComplete(owner, user);
  const paymentMethodOnFile = Boolean(owner?.stripePaymentMethodId);
  const locationSetupOverride = Boolean(owner?.locationSetupOverride);

  if (locationSetupOverride) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      canManageLocations: true,
    };
  }

  if (profileCompleted && paymentMethodOnFile) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      canManageLocations: true,
    };
  }

  if (!profileCompleted && !paymentMethodOnFile) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      canManageLocations: false,
      blockingMessage: "To set up washout locations, please complete your owner profile and add a payment method.",
    };
  }

  if (!profileCompleted) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      canManageLocations: false,
      blockingMessage: "Please complete your owner profile before setting up washout locations.",
    };
  }

  return {
    profileCompleted,
    paymentMethodOnFile,
    locationSetupOverride,
    canManageLocations: false,
    blockingMessage: "Please add a payment method before setting up washout locations.",
  };
}

export function resolveDriverLocationVisibilityState(location: {
  id?: string | null;
  ownerId?: string | null;
  name?: string | null;
  isActive?: boolean | null;
  isVisible?: boolean | null;
}, owner: {
  id?: string | null;
  membershipStatus?: string | null;
  isApproved?: boolean | null;
  membershipPaymentMethod?: string | null;
  subscriptionStatus?: string | null;
  walletStatus?: string | null;
} | null | undefined): DriverLocationVisibilityState {
  if (!location.isActive) {
    return {
      visibleToDrivers: false,
      exclusionReason: "location_inactive",
      ownerMembershipStatus: owner?.membershipStatus || (owner?.isApproved ? "active" : "pending_review"),
    };
  }

  if (!location.isVisible) {
    return {
      visibleToDrivers: false,
      exclusionReason: "location_hidden",
      ownerMembershipStatus: owner?.membershipStatus || (owner?.isApproved ? "active" : "pending_review"),
    };
  }

  if (!owner) {
    return {
      visibleToDrivers: false,
      exclusionReason: "owner_missing",
    };
  }

  const ownerLocationAccess = resolveOwnerMembershipState(owner);

  if (!ownerLocationAccess.dashboardAccessAllowed) {
    return {
      visibleToDrivers: false,
      exclusionReason: `owner_${ownerLocationAccess.membershipStatus}`,
      ownerMembershipStatus: ownerLocationAccess.membershipStatus,
    };
  }

  return {
    visibleToDrivers: true,
    ownerMembershipStatus: ownerLocationAccess.membershipStatus,
  };
}
