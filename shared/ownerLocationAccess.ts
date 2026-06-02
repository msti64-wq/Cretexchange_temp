import { resolveOwnerMembershipState } from "./ownerMembership";

export interface OwnerLocationAccessState {
  profileCompleted: boolean;
  paymentMethodOnFile: boolean;
  locationSetupOverride: boolean;
  canManageLocations: boolean;
  missingProfileFields: string[];
  missingProfileFieldLabels: string[];
  blockingMessage?: string;
}

export interface DriverLocationVisibilityState {
  visibleToDrivers: boolean;
  exclusionReason?: string;
  ownerMembershipStatus?: string;
}

const OWNER_PROFILE_FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone number",
  street: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP code",
  companyName: "Company name",
  businessLicense: "Business license",
  taxId: "Tax ID",
};

export function getMissingOwnerProfileFields(owner: {
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
} | null): string[] {
  if (owner?.profileCompleted) {
    return [] as string[];
  }

  if (!owner || !user) {
    return [
      "firstName",
      "lastName",
      "email",
      "phone",
      "street",
      "city",
      "state",
      "zip",
      "companyName",
      "businessLicense",
      "taxId",
    ];
  }

  const missingFields = [
    !user.firstName?.trim() ? "firstName" : null,
    !user.lastName?.trim() ? "lastName" : null,
    !user.email?.trim() ? "email" : null,
    !user.phone?.trim() ? "phone" : null,
    !user.street?.trim() ? "street" : null,
    !user.city?.trim() ? "city" : null,
    !user.state?.trim() ? "state" : null,
    !user.zip?.trim() ? "zip" : null,
    !owner.companyName?.trim() ? "companyName" : null,
    !owner.businessLicense?.trim() ? "businessLicense" : null,
    !owner.taxId?.trim() ? "taxId" : null,
  ].filter((field): field is string => Boolean(field));

  return missingFields;
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
  return getMissingOwnerProfileFields(owner, user).length === 0;
}

function formatMissingOwnerProfileFieldLabels(missingFields: string[]): string[] {
  return missingFields.map((field) => OWNER_PROFILE_FIELD_LABELS[field] || field);
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
  const missingProfileFields = getMissingOwnerProfileFields(owner, user);
  const missingProfileFieldLabels = formatMissingOwnerProfileFieldLabels(missingProfileFields);
  const paymentMethodOnFile = Boolean(owner?.stripePaymentMethodId);
  const locationSetupOverride = Boolean(owner?.locationSetupOverride);

  if (locationSetupOverride) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: true,
    };
  }

  if (profileCompleted && paymentMethodOnFile) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: true,
    };
  }

  if (!profileCompleted && !paymentMethodOnFile) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: `To set up washout locations, please complete your owner profile (${missingProfileFieldLabels.join(", ")}) and add a payment method.`,
    };
  }

  if (!profileCompleted) {
    return {
      profileCompleted,
      paymentMethodOnFile,
      locationSetupOverride,
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: `Please complete your owner profile before setting up washout locations. Missing: ${missingProfileFieldLabels.join(", ")}.`,
    };
  }

  return {
    profileCompleted,
    paymentMethodOnFile,
    locationSetupOverride,
    missingProfileFields,
    missingProfileFieldLabels,
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
