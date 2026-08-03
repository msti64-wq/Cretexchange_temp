export type OwnerFacilityIntelligenceWindow = "30" | "90";

const OWNER_FACILITY_INTELLIGENCE_SCOPE = "owner-facility-intelligence";
export const OWNER_FACILITY_INTELLIGENCE_TIMEOUT_MS = 15_000;

export class OwnerFacilityIntelligenceTimeoutError extends Error {
  constructor() {
    super("Owner Facility Intelligence request timed out");
    this.name = "OwnerFacilityIntelligenceTimeoutError";
  }
}

export function isOwnerFacilityIntelligenceTimeoutError(error: unknown) {
  return error instanceof OwnerFacilityIntelligenceTimeoutError;
}

export async function withOwnerFacilityIntelligenceTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
  timeoutMs = OWNER_FACILITY_INTELLIGENCE_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await request(controller.signal);
  } catch (error) {
    if (timedOut) throw new OwnerFacilityIntelligenceTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export function ownerFacilityIntelligenceQueryPrefix(locationId: string) {
  return [OWNER_FACILITY_INTELLIGENCE_SCOPE, locationId] as const;
}

export function ownerFacilityIntelligenceQueryKey(locationId: string, range: OwnerFacilityIntelligenceWindow) {
  return [...ownerFacilityIntelligenceQueryPrefix(locationId), range] as const;
}

export function ownerFacilityIntelligenceRequest(
  locationId: string,
  range: OwnerFacilityIntelligenceWindow,
  end = new Date(),
) {
  const start = new Date(end.getTime() - Number(range) * 86_400_000);
  return `/api/owners/facilities/${locationId}/intelligence/dashboard?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
}
