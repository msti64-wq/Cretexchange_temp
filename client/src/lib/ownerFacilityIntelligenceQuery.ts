export type OwnerFacilityIntelligenceWindow = "30" | "90";

const OWNER_FACILITY_INTELLIGENCE_SCOPE = "owner-facility-intelligence";

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
