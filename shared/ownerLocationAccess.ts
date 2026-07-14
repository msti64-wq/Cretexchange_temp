export interface OwnerLocationAccessState {
  profileCompleted: boolean;
  approvalCompleted: boolean;
  accessStatus: "operationally_ready" | "profile_incomplete" | "approval_pending" | "membership_blocked" | "access_denied";
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
  isApproved?: boolean | null;
  membershipStatus?: string | null;
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
  const membershipStatus = owner?.membershipStatus || null;
  const membershipBlocked = membershipStatus === "expired" || membershipStatus === "suspended";
  // Location-management approval is explicit administrative approval. Legacy
  // membership labels can still block access where an active policy requires
  // it, but they do not substitute for Facility approval.
  const approvalCompleted = owner?.isApproved === true;

  if (!owner || !user) {
    return {
      profileCompleted,
      approvalCompleted: false,
      accessStatus: "access_denied",
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: "Facility access could not be confirmed. Please sign in again or contact support.",
    };
  }

  if (membershipBlocked) {
    return {
      profileCompleted,
      approvalCompleted,
      accessStatus: "membership_blocked",
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: "Your Facility account is not currently available for location management. Please contact support.",
    };
  }

  if (!approvalCompleted) {
    return {
      profileCompleted,
      approvalCompleted,
      accessStatus: "approval_pending",
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: "Your Facility account is awaiting administrative approval before location management is available.",
    };
  }

  if (!profileCompleted) {
    return {
      profileCompleted,
      approvalCompleted,
      accessStatus: "profile_incomplete",
      missingProfileFields,
      missingProfileFieldLabels,
      canManageLocations: false,
      blockingMessage: `Please complete your Facility profile before setting up locations. Missing: ${missingProfileFieldLabels.join(", ")}.`,
    };
  }

  return {
    profileCompleted,
    approvalCompleted,
    accessStatus: "operationally_ready",
    missingProfileFields,
    missingProfileFieldLabels,
    canManageLocations: true,
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

  const ownerMembershipStatus = owner?.membershipStatus || (owner?.isApproved ? "active" : "pending_review");
  const ownerApproved = owner?.isApproved === true
    || ownerMembershipStatus === "active"
    || ownerMembershipStatus === "waived";

  if (!ownerApproved) {
    return {
      visibleToDrivers: false,
      exclusionReason: `owner_${ownerMembershipStatus}`,
      ownerMembershipStatus,
    };
  }

  return {
    visibleToDrivers: true,
    ownerMembershipStatus,
  };
}
