export type OwnerFacilitySelection =
  | { state: "selected"; facilityId: string; source: "url" | "stored" | "single" }
  | { state: "required"; facilityId: null; source: null }
  | { state: "invalid"; facilityId: null; source: "url" }
  | { state: "empty"; facilityId: null; source: null };

export type OwnerFacilityUrlSelection = {
  present: boolean;
  facilityId: string | null;
};

export function ownerFacilitySelectionStorageKey(ownerUserId: string) {
  return `cretexchange.owner.${ownerUserId}.facility-intelligence.facility`;
}

export function ownerFacilityIntelligencePath(facilityId: string) {
  const query = new URLSearchParams({ facilityId });
  return `/intelligence?${query.toString()}`;
}

export function parseOwnerFacilityUrlSelection(path: string): OwnerFacilityUrlSelection {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const present = params.has("facilityId");
  const value = params.get("facilityId")?.trim() || null;
  return { present, facilityId: value };
}

export function resolveOwnerFacilitySelection(input: {
  facilityIds: string[];
  urlSelection: OwnerFacilityUrlSelection;
  storedFacilityId?: string | null;
}): OwnerFacilitySelection {
  const ownedFacilityIds = new Set(input.facilityIds);

  if (ownedFacilityIds.size === 0) {
    return { state: "empty", facilityId: null, source: null };
  }

  if (input.urlSelection.present) {
    if (input.urlSelection.facilityId && ownedFacilityIds.has(input.urlSelection.facilityId)) {
      return { state: "selected", facilityId: input.urlSelection.facilityId, source: "url" };
    }
    return { state: "invalid", facilityId: null, source: "url" };
  }

  if (input.storedFacilityId && ownedFacilityIds.has(input.storedFacilityId)) {
    return { state: "selected", facilityId: input.storedFacilityId, source: "stored" };
  }

  if (ownedFacilityIds.size === 1) {
    return { state: "selected", facilityId: input.facilityIds[0], source: "single" };
  }

  return { state: "required", facilityId: null, source: null };
}
