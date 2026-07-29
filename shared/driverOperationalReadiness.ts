export const DRIVER_OPERATIONAL_READINESS_REASON_CODES = [
  "driver_role_required",
  "driver_profile_required",
  "driver_profile_not_owned",
  "driver_profile_incomplete",
  "current_terms_required",
  "terms_ledger_unavailable",
  "active_material_required",
  "active_material_invalid",
  "active_material_retired",
] as const;

export type DriverOperationalReadinessReasonCode = typeof DRIVER_OPERATIONAL_READINESS_REASON_CODES[number];

export const DRIVER_PROFILE_REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "street",
  "city",
  "state",
  "zip",
  "employerName",
  "truckNumber",
] as const;

export type DriverProfileRequiredField = typeof DRIVER_PROFILE_REQUIRED_FIELDS[number];

export interface DriverOperationalReadinessUser {
  id?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface DriverOperationalReadinessProfile {
  userId?: string | null;
  employerName?: string | null;
  truckNumber?: string | null;
  activeMaterialSlug?: string | null;
}

export interface DriverOperationalReadinessMaterial {
  slug?: string | null;
  isActive?: boolean | null;
  retiredAt?: Date | string | null;
}

export interface DriverOperationalReadinessInput {
  user?: DriverOperationalReadinessUser | null;
  profile?: DriverOperationalReadinessProfile | null;
  termsAccepted?: boolean | null;
  termsLedgerAvailable?: boolean | null;
  activeMaterial?: DriverOperationalReadinessMaterial | null;
}

export interface DriverOperationalReadinessReason {
  code: DriverOperationalReadinessReasonCode;
  missingProfileFields?: DriverProfileRequiredField[];
}

function hasRequiredValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveDriverProfileReadiness({
  user,
  profile,
}: Pick<DriverOperationalReadinessInput, "user" | "profile">) {
  const values: Record<DriverProfileRequiredField, unknown> = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    email: user?.email,
    phone: user?.phone,
    street: user?.street,
    city: user?.city,
    state: user?.state,
    zip: user?.zip,
    employerName: profile?.employerName,
    truckNumber: profile?.truckNumber,
  };
  const missingProfileFields = DRIVER_PROFILE_REQUIRED_FIELDS.filter((field) => !hasRequiredValue(values[field]));

  return {
    complete: missingProfileFields.length === 0,
    missingProfileFields,
  };
}

export function resolveDriverOperationalReadiness({
  user,
  profile,
  termsAccepted,
  termsLedgerAvailable: termsLedgerAvailableInput,
  activeMaterial,
}: DriverOperationalReadinessInput) {
  const reasons: DriverOperationalReadinessReason[] = [];
  const roleAllowed = user?.role === "driver";
  const profileExists = Boolean(profile);
  const profileOwned = Boolean(profile && user?.id && profile.userId === user.id);
  const profileReadiness = resolveDriverProfileReadiness({ user, profile });
  const acceptedCurrentTerms = termsAccepted === true;
  const termsLedgerAvailable = termsLedgerAvailableInput !== false;
  const activeMaterialSlug = profile?.activeMaterialSlug?.trim() || null;
  const materialMatchesSelection = Boolean(activeMaterialSlug && activeMaterial?.slug === activeMaterialSlug);
  const activeMaterialState = !activeMaterialSlug
    ? "missing"
    : !materialMatchesSelection || !activeMaterial
      ? "invalid"
      : activeMaterial.retiredAt
        ? "retired"
        : activeMaterial.isActive === false
          ? "invalid"
          : "valid";

  if (!roleAllowed) {
    reasons.push({ code: "driver_role_required" });
  } else if (!profileExists) {
    reasons.push({ code: "driver_profile_required" });
  } else if (!profileOwned) {
    reasons.push({ code: "driver_profile_not_owned" });
  } else if (!profileReadiness.complete) {
    reasons.push({
      code: "driver_profile_incomplete",
      missingProfileFields: profileReadiness.missingProfileFields,
    });
  }

  if (roleAllowed && profileExists && profileOwned) {
    if (!termsLedgerAvailable) reasons.push({ code: "terms_ledger_unavailable" });
    else if (!acceptedCurrentTerms) reasons.push({ code: "current_terms_required" });
  }

  if (roleAllowed && profileExists && profileOwned) {
    if (activeMaterialState === "missing") reasons.push({ code: "active_material_required" });
    if (activeMaterialState === "invalid") reasons.push({ code: "active_material_invalid" });
    if (activeMaterialState === "retired") reasons.push({ code: "active_material_retired" });
  }

  return {
    ready: reasons.length === 0,
    roleAllowed,
    profileExists,
    profileOwned,
    profileComplete: profileReadiness.complete,
    missingProfileFields: profileReadiness.missingProfileFields,
    termsAccepted: acceptedCurrentTerms,
    termsLedgerAvailable,
    activeMaterialState,
    reasons,
  };
}
