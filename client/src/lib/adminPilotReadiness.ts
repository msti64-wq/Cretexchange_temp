import {
  resolveDriverAccountReadiness,
  resolveFacilityReadinessChecklist,
} from "@/lib/pilotOnboarding";

export interface AdminPilotDriverEntry {
  users?: Record<string, unknown> | null;
  drivers?: Record<string, unknown> | null;
}

export interface AdminPilotOwnerEntry {
  users?: Record<string, unknown> | null;
  owners?: Record<string, unknown> | null;
}

export interface AdminPilotLocation {
  ownerId?: unknown;
  isActive?: unknown;
  isVisible?: unknown;
  operatingHours?: unknown;
}

export interface AdminPilotTrustSignals {
  pending?: number | null;
  exceptions?: number | null;
  olderThan24h?: number | null;
}

export interface AdminPilotSupportMessage {
  status?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function knownCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Builds a read-only pilot-operations view from existing admin projections.
 * It does not create a new readiness state, infer financial readiness, or
 * change any participant lifecycle.
 */
export function buildAdminPilotReadiness({
  drivers,
  owners,
  locations,
  trust,
  supportMessages,
}: {
  drivers?: AdminPilotDriverEntry[] | null;
  owners?: AdminPilotOwnerEntry[] | null;
  locations?: AdminPilotLocation[] | null;
  trust?: AdminPilotTrustSignals | null;
  supportMessages?: AdminPilotSupportMessage[] | null;
}) {
  const driversAvailable = Array.isArray(drivers);
  const ownersAvailable = Array.isArray(owners);
  const locationsAvailable = Array.isArray(locations);
  const driverTermsAvailable = driversAvailable && drivers.every((entry) => asBoolean(asRecord(entry.drivers).hasAgreedToTerms) !== null);

  const driverReadiness = driverTermsAvailable
    ? drivers!.map((entry) => {
      const user = asRecord(entry.users);
      const driver = asRecord(entry.drivers);
      return resolveDriverAccountReadiness({
        user: {
          firstName: typeof user.firstName === "string" ? user.firstName : null,
          lastName: typeof user.lastName === "string" ? user.lastName : null,
          phone: typeof user.phone === "string" ? user.phone : null,
          street: typeof user.street === "string" ? user.street : null,
          city: typeof user.city === "string" ? user.city : null,
          state: typeof user.state === "string" ? user.state : null,
          zip: typeof user.zip === "string" ? user.zip : null,
          roleData: {
            employerName: typeof driver.employerName === "string" ? driver.employerName : null,
            truckNumber: typeof driver.truckNumber === "string" ? driver.truckNumber : null,
          },
        },
        termsAccepted: asBoolean(driver.hasAgreedToTerms),
      });
    })
    : null;

  const locationsByOwner = new Map<string, AdminPilotLocation[]>();
  if (locationsAvailable) {
    for (const location of locations) {
      const ownerId = asId(location.ownerId);
      if (!ownerId) continue;
      const ownerLocations = locationsByOwner.get(ownerId) || [];
      ownerLocations.push(location);
      locationsByOwner.set(ownerId, ownerLocations);
    }
  }

  const facilityReadiness = ownersAvailable && locationsAvailable
    ? owners!.map((entry) => {
      const user = asRecord(entry.users);
      const owner = asRecord(entry.owners);
      const ownerId = asId(owner.id);
      return resolveFacilityReadinessChecklist({
        owner: {
          isApproved: asBoolean(owner.isApproved),
          profileCompleted: asBoolean(owner.profileCompleted),
          companyName: typeof owner.companyName === "string" ? owner.companyName : null,
          businessLicense: typeof owner.businessLicense === "string" ? owner.businessLicense : null,
          taxId: typeof owner.taxId === "string" ? owner.taxId : null,
        },
        user: {
          firstName: typeof user.firstName === "string" ? user.firstName : null,
          lastName: typeof user.lastName === "string" ? user.lastName : null,
          email: typeof user.email === "string" ? user.email : null,
          phone: typeof user.phone === "string" ? user.phone : null,
          street: typeof user.street === "string" ? user.street : null,
          city: typeof user.city === "string" ? user.city : null,
          state: typeof user.state === "string" ? user.state : null,
          zip: typeof user.zip === "string" ? user.zip : null,
        },
        locations: (ownerId ? locationsByOwner.get(ownerId) : [])?.map((location) => ({
          isActive: asBoolean(location.isActive),
          isVisible: asBoolean(location.isVisible),
          operatingHours: typeof location.operatingHours === "string" ? location.operatingHours : null,
        })),
      });
    })
    : null;

  const activeSupportMessages = Array.isArray(supportMessages)
    ? supportMessages.filter((message) => message.status !== "resolved").length
    : null;
  const unreadSupportMessages = Array.isArray(supportMessages)
    ? supportMessages.filter((message) => message.status === "unread").length
    : null;

  const driversReady = driverReadiness ? driverReadiness.filter((readiness) => readiness.ready).length : null;
  const facilitiesReady = facilityReadiness ? facilityReadiness.filter((readiness) => readiness.marketplaceReady).length : null;
  const pendingReviewOver24h = knownCount(trust?.olderThan24h);
  const reviewExceptions = knownCount(trust?.exceptions);
  const pendingReview = knownCount(trust?.pending);
  const blockers = [
    driverReadiness ? driverReadiness.filter((readiness) => !readiness.ready).length : null,
    facilityReadiness ? facilityReadiness.filter((readiness) => !readiness.marketplaceReady).length : null,
    pendingReviewOver24h,
    reviewExceptions,
    unreadSupportMessages,
  ];
  const knownBlockers = blockers.filter((value): value is number => value !== null);

  return {
    driversTotal: driversAvailable ? drivers!.length : null,
    driversReady,
    driversNeedingOnboarding: driverReadiness ? driverReadiness.filter((readiness) => !readiness.ready).length : null,
    facilitiesTotal: ownersAvailable ? owners!.length : null,
    facilitiesReady,
    facilitiesNeedingReadiness: facilityReadiness ? facilityReadiness.filter((readiness) => !readiness.marketplaceReady).length : null,
    pendingReview,
    pendingReviewOver24h,
    reviewExceptions,
    activeSupportMessages,
    unreadSupportMessages,
    sourcesAvailable: {
      driverReadiness: Boolean(driverTermsAvailable),
      facilityReadiness: ownersAvailable && locationsAvailable,
      verification: pendingReview !== null && pendingReviewOver24h !== null && reviewExceptions !== null,
      support: activeSupportMessages !== null && unreadSupportMessages !== null,
    },
    currentSignal: knownBlockers.length === 0
      ? "unavailable" as const
      : knownBlockers.some((value) => value > 0)
        ? "attention" as const
        : "clear" as const,
  };
}
