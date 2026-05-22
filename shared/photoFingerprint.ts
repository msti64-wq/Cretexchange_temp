export const PHOTO_FINGERPRINT_GRID_SIZE = 8;
export const PHOTO_DUPLICATE_LOOKBACK_DAYS = 90;
export const PHOTO_DUPLICATE_HAMMING_THRESHOLD = 10;

export interface PhotoFingerprintCandidate {
  photoId: string;
  activityId: string;
  driverId: string;
  driverName: string;
  locationId: string;
  locationName: string;
  priorUploadedAt: string;
  imageFingerprint: string;
}

export interface PhotoDuplicateMatch extends PhotoFingerprintCandidate {
  confidence: number;
  hashDistance: number;
}

export function normalizePhotoFingerprint(fingerprint: string | null | undefined): string | null {
  const normalized = fingerprint?.trim().toLowerCase() || null;
  return normalized && /^[0-9a-f]+$/i.test(normalized) ? normalized : null;
}

export function buildAverageHashFromGrayscaleValues(values: number[]): string {
  if (values.length !== PHOTO_FINGERPRINT_GRID_SIZE * PHOTO_FINGERPRINT_GRID_SIZE) {
    throw new Error(
      `Expected ${PHOTO_FINGERPRINT_GRID_SIZE * PHOTO_FINGERPRINT_GRID_SIZE} grayscale values.`,
    );
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const bits = values.map((value) => (value > average ? "1" : "0")).join("");
  const hexChunks = bits.match(/.{1,4}/g) || [];

  return hexChunks
    .map((chunk) => Number.parseInt(chunk, 2).toString(16))
    .join("")
    .padStart(values.length / 4, "0");
}

export function calculatePhotoFingerprintHammingDistance(
  firstFingerprint: string,
  secondFingerprint: string,
): number | null {
  const first = normalizePhotoFingerprint(firstFingerprint);
  const second = normalizePhotoFingerprint(secondFingerprint);

  if (!first || !second || first.length !== second.length) {
    return null;
  }

  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstNibble = Number.parseInt(first[index], 16);
    const secondNibble = Number.parseInt(second[index], 16);
    if (Number.isNaN(firstNibble) || Number.isNaN(secondNibble)) {
      return null;
    }
    distance += ((firstNibble ^ secondNibble).toString(2).match(/1/g) || []).length;
  }

  return distance;
}

export function calculatePhotoFingerprintConfidence(
  hashDistance: number,
  fingerprintLength = PHOTO_FINGERPRINT_GRID_SIZE * PHOTO_FINGERPRINT_GRID_SIZE,
): number {
  const similarity = Math.max(0, 1 - hashDistance / fingerprintLength);
  return Math.round(similarity * 100);
}

export function findLikelyDuplicatePhotoMatches(
  currentFingerprint: string | null | undefined,
  candidates: PhotoFingerprintCandidate[],
  limit = 3,
): PhotoDuplicateMatch[] {
  const normalizedCurrentFingerprint = normalizePhotoFingerprint(currentFingerprint);
  if (!normalizedCurrentFingerprint) {
    return [];
  }

  return candidates
    .map((candidate) => {
      const normalizedCandidateFingerprint = normalizePhotoFingerprint(candidate.imageFingerprint);
      if (!normalizedCandidateFingerprint) {
        return null;
      }

      const hashDistance = calculatePhotoFingerprintHammingDistance(
        normalizedCurrentFingerprint,
        normalizedCandidateFingerprint,
      );
      if (hashDistance == null || hashDistance > PHOTO_DUPLICATE_HAMMING_THRESHOLD) {
        return null;
      }

      return {
        ...candidate,
        imageFingerprint: normalizedCandidateFingerprint,
        confidence: calculatePhotoFingerprintConfidence(hashDistance),
        hashDistance,
      };
    })
    .filter((match): match is PhotoDuplicateMatch => match !== null)
    .sort((first, second) => {
      if (first.hashDistance !== second.hashDistance) {
        return first.hashDistance - second.hashDistance;
      }
      return second.confidence - first.confidence;
    })
    .slice(0, limit);
}
