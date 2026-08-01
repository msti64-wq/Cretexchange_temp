import { isOwnerProfileComplete } from "@shared/ownerLocationAccess";
import { resolveDriverProfileReadiness } from "@shared/driverOperationalReadiness";

export type GpsPreflightStatus = "required" | "checking" | "retrying" | "ready" | "permission_denied" | "unavailable";

export const SUBMISSION_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export interface SubmissionConfirmationRecord {
  activityId: string;
  createdAt: number;
}

export interface DriverActivityConfirmationRow {
  id?: string | null;
  status?: string | null;
  washout_activities?: {
    id?: string | null;
    status?: string | null;
  } | null;
}

export function createSubmissionConfirmationRecord(activityId: unknown, createdAt = Date.now()): SubmissionConfirmationRecord | null {
  const normalizedActivityId = typeof activityId === "string" ? activityId.trim() : "";
  if (!normalizedActivityId || !Number.isFinite(createdAt)) return null;

  return { activityId: normalizedActivityId, createdAt };
}

export function getCanonicalActivityStatus(activity: DriverActivityConfirmationRow): "pending" | "verified" | "rejected" | null {
  const rawStatus = activity.washout_activities?.status ?? activity.status;
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";
  return status === "pending" || status === "verified" || status === "rejected" ? status : null;
}

export function resolveSubmittedActivityConfirmation({
  referencedActivityId,
  record,
  activities,
  now = Date.now(),
}: {
  referencedActivityId: string | null;
  record: SubmissionConfirmationRecord | null;
  activities?: DriverActivityConfirmationRow[] | null;
  now?: number;
}): DriverActivityConfirmationRow | null {
  if (!referencedActivityId || !record || record.activityId !== referencedActivityId) return null;
  if (!Number.isFinite(record.createdAt) || now - record.createdAt < 0 || now - record.createdAt > SUBMISSION_CONFIRMATION_TTL_MS) return null;

  const rows = Array.isArray(activities) ? activities : [];
  const activity = rows.find((row) => (row.washout_activities?.id ?? row.id) === referencedActivityId);

  // The Driver activities endpoint is authenticated and ownership-scoped. A
  // confirmation is therefore valid only when its server-confirmed record is
  // present in that query and remains pending review.
  return activity && getCanonicalActivityStatus(activity) === "pending" ? activity : null;
}

export function resolveGpsPreflightStatus(error: unknown): GpsPreflightStatus {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/denied/i.test(message)) return "permission_denied";
  if (message) return "unavailable";
  return "required";
}

export type PhotoUploadRecoveryState = "empty" | "uploading" | "partial_failure" | "failed" | "complete";

export function resolvePhotoUploadRecoveryState({
  successfulCount,
  failedCount,
  isProcessing,
}: {
  successfulCount: number;
  failedCount: number;
  isProcessing: boolean;
}) {
  const successful = Number.isFinite(successfulCount) ? Math.max(0, Math.floor(successfulCount)) : 0;
  const failed = Number.isFinite(failedCount) ? Math.max(0, Math.floor(failedCount)) : 0;

  const state: PhotoUploadRecoveryState = isProcessing
    ? "uploading"
    : failed > 0 && successful > 0
      ? "partial_failure"
      : failed > 0
        ? "failed"
        : successful > 0
          ? "complete"
          : "empty";

  return {
    state,
    successfulCount: successful,
    failedCount: failed,
    totalCount: successful + failed,
    canSubmit: state === "complete",
  };
}

export function resolveDriverCheckInButtonState({
  gpsStatus,
  hasGpsLocation,
  successfulPhotoCount,
  failedPhotoCount,
  isProcessingPhotos,
  isSubmitting,
  hasInvalidPhotoUrls,
}: {
  gpsStatus: GpsPreflightStatus;
  hasGpsLocation: boolean;
  successfulPhotoCount: number;
  failedPhotoCount: number;
  isProcessingPhotos: boolean;
  isSubmitting: boolean;
  hasInvalidPhotoUrls: boolean;
}) {
  const upload = resolvePhotoUploadRecoveryState({
    successfulCount: successfulPhotoCount,
    failedCount: failedPhotoCount,
    isProcessing: isProcessingPhotos,
  });
  const enabled = gpsStatus === "ready"
    && hasGpsLocation
    && upload.canSubmit
    && !isSubmitting
    && !hasInvalidPhotoUrls;

  return { enabled, upload };
}

export interface DriverAccountReadinessInput {
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    roleData?: {
      employerName?: string | null;
      truckNumber?: string | null;
    } | null;
  } | null;
  termsAccepted?: boolean | null;
}

export type DriverAccountReadinessNextStep = "complete_profile" | "accept_terms" | null;

export function resolveDriverAccountReadiness({ user, termsAccepted }: DriverAccountReadinessInput) {
  const profileReadiness = resolveDriverProfileReadiness({
    user,
    profile: user?.roleData ? {
      employerName: user.roleData.employerName,
      truckNumber: user.roleData.truckNumber,
    } : null,
  });
  const profileComplete = profileReadiness.complete;
  const acceptedTerms = termsAccepted === true;

  return {
    profileComplete,
    termsAccepted: acceptedTerms,
    ready: profileComplete && acceptedTerms,
    nextStep: !profileComplete
      ? "complete_profile" as const
      : !acceptedTerms
        ? "accept_terms" as const
        : null,
  };
}

export interface FacilityOperationalReadinessInput {
  owner?: {
    isApproved?: boolean | null;
    profileCompleted?: boolean | null;
    companyName?: string | null;
    businessLicense?: string | null;
    taxId?: string | null;
  } | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  locations?: Array<{
    isActive?: boolean | null;
    isVisible?: boolean | null;
    operatingHours?: string | null;
  }> | null;
}

export type FacilityReadinessStepId = "profile" | "approval" | "location" | "driver_availability" | "operating_hours";

export interface FacilityReadinessStep {
  id: FacilityReadinessStepId;
  complete: boolean;
}

export function resolveFacilityOperationalReadiness({ owner, user, locations = [] }: FacilityOperationalReadinessInput) {
  const rows = Array.isArray(locations) ? locations : [];
  const profileComplete = isOwnerProfileComplete(owner, user);
  const locationWithOperatingInfo = rows.some((location) => Boolean(location.operatingHours?.trim()));
  const driverAvailableLocation = rows.some((location) => location.isActive === true && location.isVisible === true);
  const driverAvailableLocationWithOperatingInfo = rows.some((location) => (
    location.isActive === true
    && location.isVisible === true
    && Boolean(location.operatingHours?.trim())
  ));

  return {
    accountExists: Boolean(owner),
    profileComplete,
    approved: owner?.isApproved === true,
    hasLocation: rows.length > 0,
    hasActiveLocation: rows.some((location) => location.isActive === true),
    hasVisibleLocation: rows.some((location) => location.isVisible === true),
    hasOperatingInfo: locationWithOperatingInfo,
    hasDriverAvailableLocation: driverAvailableLocation,
    hasDriverAvailableLocationWithOperatingInfo: driverAvailableLocationWithOperatingInfo,
    marketplaceReady: profileComplete
      && owner?.isApproved === true
      && driverAvailableLocation
      && driverAvailableLocationWithOperatingInfo,
  };
}

export function resolveFacilityReadinessChecklist(input: FacilityOperationalReadinessInput) {
  const readiness = resolveFacilityOperationalReadiness(input);
  const steps: FacilityReadinessStep[] = [
    { id: "profile", complete: readiness.profileComplete },
    { id: "approval", complete: readiness.approved },
    { id: "location", complete: readiness.hasLocation },
    { id: "driver_availability", complete: readiness.hasDriverAvailableLocation },
    { id: "operating_hours", complete: readiness.hasDriverAvailableLocationWithOperatingInfo },
  ];

  return {
    ...readiness,
    steps,
    nextStep: steps.find((step) => !step.complete)?.id ?? null,
  };
}
