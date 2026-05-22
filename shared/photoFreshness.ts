export const PHOTO_REVIEW_MAX_AGE_HOURS = 6;
export const PHOTO_REJECT_MAX_AGE_HOURS = 24;
const PHOTO_FRESHNESS_SKEW_MINUTES = 5;

export type PhotoFreshnessStatus = "fresh" | "review" | "rejected";

export function evaluatePhotoFreshness({
  photoTakenAt,
  uploadedAt,
}: {
  photoTakenAt: Date;
  uploadedAt: Date;
}): {
  status: PhotoFreshnessStatus;
  reason: string;
  ageHours: number | null;
} {
  const takenTime = photoTakenAt.getTime();
  const uploadedTime = uploadedAt.getTime();

  if (!Number.isFinite(takenTime) || !Number.isFinite(uploadedTime)) {
    return {
      status: "rejected",
      ageHours: null,
      reason: "Photo timestamps are invalid. Please re-upload the photo.",
    };
  }

  if (uploadedTime + PHOTO_FRESHNESS_SKEW_MINUTES * 60 * 1000 < takenTime) {
    return {
      status: "rejected",
      ageHours: null,
      reason: "Photo timestamp is in the future. Please re-upload the photo.",
    };
  }

  const ageHours = (uploadedTime - takenTime) / (60 * 60 * 1000);

  if (ageHours > PHOTO_REJECT_MAX_AGE_HOURS) {
    return {
      status: "rejected",
      ageHours,
      reason: "Please take a new photo at the washout site before completing checkout.",
    };
  }

  if (ageHours > PHOTO_REVIEW_MAX_AGE_HOURS) {
    return {
      status: "review",
      ageHours,
      reason: `Photo is ${ageHours.toFixed(1)} hours older than upload. Marked for review.`,
    };
  }

  return {
    status: "fresh",
    ageHours,
    reason: "Photo timestamp is current.",
  };
}
