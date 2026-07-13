export interface PlatformActivityRow {
  washoutStatus?: unknown;
  checkInTime?: unknown;
  driverId?: unknown;
  ownerId?: unknown;
  locationId?: unknown;
  ticketNumber?: unknown;
}

export interface PlatformActivityLocation {
  id?: unknown;
  city?: unknown;
  state?: unknown;
}

export type PlatformActivityRange = "today" | "last_7_days" | "last_30_days";

function normalizedId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id || null;
}

function normalizedLabel(value: unknown): string | null {
  const label = typeof value === "string" ? value.trim() : "";
  return label || null;
}

function sortedCountRows(counts: Map<string, number>) {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * The report API supplies a rolling superset for weekly/monthly requests.
 * This client-side guard makes the Platform Activity view's local calendar
 * boundaries exact without changing shared report semantics used elsewhere.
 */
export function filterAdminPlatformActivityRange(
  activities: PlatformActivityRow[] | null | undefined,
  range: PlatformActivityRange,
  now = new Date(),
): PlatformActivityRow[] | undefined {
  if (!activities) return undefined;

  const start = startOfLocalDay(now);
  if (range === "last_7_days") start.setDate(start.getDate() - 6);
  if (range === "last_30_days") start.setDate(start.getDate() - 29);
  const end = startOfLocalDay(now);
  end.setDate(end.getDate() + 1);

  return activities.filter((activity) => {
    const date = new Date(activity.checkInTime as string | number | Date);
    return !Number.isNaN(date.getTime()) && date >= start && date < end;
  });
}

export function buildAdminPlatformActivity(
  activities: PlatformActivityRow[] | null | undefined,
  locations: PlatformActivityLocation[] | null | undefined,
  totalOwnerCount?: number | null,
) {
  if (!activities) {
    return {
      totalActivities: null,
      verifiedActivities: null,
      pendingActivities: null,
      rejectedActivities: null,
      activeDrivers: null,
      activeOwners: null,
      ownersWithoutActivity: null,
      participatingLocations: null,
      participatingLocationPercentage: null,
      rewardEntries: null,
      rewardDrivers: null,
      activityByCity: [] as Array<{ label: string; count: number }>,
      activityByState: [] as Array<{ label: string; count: number }>,
      verifiedTrend: [] as Array<{ label: string; count: number }>,
    };
  }

  const locationLookup = new Map(
    (locations || [])
      .map((location) => {
        const id = normalizedId(location.id);
        return id ? [id, { city: normalizedLabel(location.city), state: normalizedLabel(location.state) }] as const : null;
      })
      .filter((entry): entry is readonly [string, { city: string | null; state: string | null }] => entry !== null),
  );
  const drivers = new Set<string>();
  const owners = new Set<string>();
  const verifiedLocations = new Set<string>();
  const rewardDrivers = new Set<string>();
  const cityCounts = new Map<string, number>();
  const stateCounts = new Map<string, number>();
  const trendCounts = new Map<string, number>();
  let verifiedActivities = 0;
  let pendingActivities = 0;
  let rejectedActivities = 0;
  let rewardEntries = 0;

  for (const activity of activities) {
    const status = String(activity.washoutStatus || "").toLowerCase();
    const driverId = normalizedId(activity.driverId);
    const ownerId = normalizedId(activity.ownerId);
    const locationId = normalizedId(activity.locationId);
    if (driverId) drivers.add(driverId);
    if (ownerId) owners.add(ownerId);
    if (status === "verified") {
      verifiedActivities += 1;
      if (locationId) {
        verifiedLocations.add(locationId);
        const location = locationLookup.get(locationId);
        if (location?.city) cityCounts.set(location.city, (cityCounts.get(location.city) || 0) + 1);
        if (location?.state) stateCounts.set(location.state, (stateCounts.get(location.state) || 0) + 1);
      }
      const date = new Date(activity.checkInTime as string | number | Date);
      if (!Number.isNaN(date.getTime())) {
        const day = localDateKey(date);
        trendCounts.set(day, (trendCounts.get(day) || 0) + 1);
      }
    }
    if (status === "pending") pendingActivities += 1;
    if (status === "rejected") rejectedActivities += 1;
    if (normalizedLabel(activity.ticketNumber)) {
      rewardEntries += 1;
      if (driverId) rewardDrivers.add(driverId);
    }
  }

  const verifiedTrend = Array.from(trendCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-14)
    .map(([label, count]) => ({ label, count }));
  const ownerCount = typeof totalOwnerCount === "number" && Number.isFinite(totalOwnerCount) && totalOwnerCount >= 0
    ? Math.floor(totalOwnerCount)
    : null;

  return {
    totalActivities: activities.length,
    verifiedActivities,
    pendingActivities,
    rejectedActivities,
    activeDrivers: drivers.size,
    activeOwners: owners.size,
    ownersWithoutActivity: ownerCount === null ? null : Math.max(0, ownerCount - owners.size),
    participatingLocations: verifiedLocations.size,
    participatingLocationPercentage: locations === null || locations === undefined || locations.length === 0
      ? null
      : Math.round((verifiedLocations.size / locations.length) * 100),
    rewardEntries,
    rewardDrivers: rewardDrivers.size,
    activityByCity: sortedCountRows(cityCounts),
    activityByState: sortedCountRows(stateCounts),
    verifiedTrend,
  };
}
