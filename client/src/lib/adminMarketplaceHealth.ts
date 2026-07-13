export interface MarketplaceHealthLocation {
  id?: unknown;
  isActive?: unknown;
  isVisible?: unknown;
  city?: unknown;
  state?: unknown;
}

export interface MarketplaceHealthActivity {
  washoutStatus?: unknown;
  locationId?: unknown;
}

function normalizedId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id || null;
}

function normalizedLabel(value: unknown): string | null {
  const label = typeof value === "string" ? value.trim() : "";
  return label || null;
}

function uniqueRegionLabels(regions: Map<string, string>) {
  return Array.from(regions.values())
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ label }));
}

/**
 * Aggregates only facility configuration and already-range-filtered verified activity.
 * “Ready” means active and visible configuration; it does not infer capacity,
 * compliance, payment, settlement, or any other unsupported readiness state.
 */
export function buildAdminMarketplaceHealth(
  locations: MarketplaceHealthLocation[] | null | undefined,
  activities: MarketplaceHealthActivity[] | null | undefined,
) {
  const locationsAvailable = Array.isArray(locations);
  const activitiesAvailable = Array.isArray(activities);
  const locationById = new Map<string, { ready: boolean; city: string | null; state: string | null }>();
  const cityRegions = new Map<string, string>();
  const stateRegions = new Map<string, string>();

  let activeLocations = 0;
  let visibleLocations = 0;
  let readyLocations = 0;

  if (locationsAvailable) {
    for (const location of locations) {
      const id = normalizedId(location.id);
      const active = location.isActive === true;
      const visible = location.isVisible === true;
      const ready = active && visible;
      const city = normalizedLabel(location.city);
      const state = normalizedLabel(location.state);
      if (active) activeLocations += 1;
      if (visible) visibleLocations += 1;
      if (ready) {
        readyLocations += 1;
        if (city && !cityRegions.has(city.toLocaleLowerCase())) cityRegions.set(city.toLocaleLowerCase(), city);
        if (state && !stateRegions.has(state.toLocaleLowerCase())) stateRegions.set(state.toLocaleLowerCase(), state);
      }
      if (id) locationById.set(id, { ready, city, state });
    }
  }

  const verifiedLocationIds = new Set<string>();
  if (activitiesAvailable) {
    for (const activity of activities) {
      if (String(activity.washoutStatus || "").toLowerCase() !== "verified") continue;
      const locationId = normalizedId(activity.locationId);
      if (locationId) verifiedLocationIds.add(locationId);
    }
  }

  const utilizedReadyLocationIds = new Set(
    Array.from(verifiedLocationIds).filter((locationId) => locationById.get(locationId)?.ready),
  );
  const totalLocations = locationsAvailable ? locations.length : null;
  const readinessPercentage = totalLocations && totalLocations > 0
    ? Math.round((readyLocations / totalLocations) * 100)
    : null;
  const utilizationPercentage = activitiesAvailable && readyLocations > 0
    ? Math.round((utilizedReadyLocationIds.size / readyLocations) * 100)
    : null;

  return {
    totalLocations,
    activeLocations: locationsAvailable ? activeLocations : null,
    visibleLocations: locationsAvailable ? visibleLocations : null,
    driverAccessibleLocations: locationsAvailable ? readyLocations : null,
    locationsNeedingConfiguration: locationsAvailable ? locations.length - readyLocations : null,
    marketplaceReadinessPercentage: readinessPercentage,
    verifiedParticipatingLocations: activitiesAvailable && locationsAvailable ? verifiedLocationIds.size : null,
    utilizedReadyLocations: activitiesAvailable && locationsAvailable ? utilizedReadyLocationIds.size : null,
    readyLocationsWithoutVerifiedActivity: activitiesAvailable && locationsAvailable
      ? Math.max(0, readyLocations - utilizedReadyLocationIds.size)
      : null,
    readyLocationUtilizationPercentage: activitiesAvailable && locationsAvailable ? utilizationPercentage : null,
    cityCoverage: locationsAvailable ? cityRegions.size : null,
    stateCoverage: locationsAvailable ? stateRegions.size : null,
    cityRegions: locationsAvailable ? uniqueRegionLabels(cityRegions) : [],
    stateRegions: locationsAvailable ? uniqueRegionLabels(stateRegions) : [],
  };
}
