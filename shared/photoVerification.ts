export type PhotoVerificationStatus =
  | "verified"
  | "warning"
  | "failed"
  | "needs_review";

export const PHOTO_VERIFICATION_RADIUS_MILES = {
  verified: 1,
  warning: 3,
} as const;

export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusMiles = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

export function formatPhotoVerificationStatus(status: PhotoVerificationStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "warning":
      return "Warning";
    case "failed":
      return "Failed";
    case "needs_review":
      return "Needs review";
  }
}

export function evaluatePhotoVerification({
  gpsLatitude,
  gpsLongitude,
  locationLatitude,
  locationLongitude,
}: {
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}): {
  status: PhotoVerificationStatus;
  distanceMiles: number | null;
  reason: string;
} {
  const hasValidGpsCoordinates =
    typeof gpsLatitude === "number" &&
    Number.isFinite(gpsLatitude) &&
    typeof gpsLongitude === "number" &&
    Number.isFinite(gpsLongitude);
  const hasValidLocationCoordinates =
    typeof locationLatitude === "number" &&
    Number.isFinite(locationLatitude) &&
    typeof locationLongitude === "number" &&
    Number.isFinite(locationLongitude);

  if (!hasValidGpsCoordinates || !hasValidLocationCoordinates) {
    return {
      status: "needs_review",
      distanceMiles: null,
      reason: "GPS unavailable or recovery facility coordinates missing.",
    };
  }

  const distanceMiles = calculateDistanceMiles(
    gpsLatitude,
    gpsLongitude,
    locationLatitude,
    locationLongitude,
  );

  if (distanceMiles <= PHOTO_VERIFICATION_RADIUS_MILES.verified) {
    return {
      status: "verified",
      distanceMiles,
      reason: `Within ${PHOTO_VERIFICATION_RADIUS_MILES.verified} mile of the recovery facility.`,
    };
  }

  if (distanceMiles <= PHOTO_VERIFICATION_RADIUS_MILES.warning) {
    return {
      status: "warning",
      distanceMiles,
      reason: `Photo GPS is ${distanceMiles.toFixed(2)} miles from the recovery facility.`,
    };
  }

  return {
    status: "failed",
    distanceMiles,
    reason: `Photo GPS is ${distanceMiles.toFixed(2)} miles from the recovery facility.`,
  };
}
