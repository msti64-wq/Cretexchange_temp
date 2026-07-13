export type PlatformGrowthRange = "today" | "last_7_days" | "last_30_days" | "current_month";

export interface AdminGrowthUser {
  id: string;
  role: string | null | undefined;
  createdAt: string | Date | null | undefined;
  isActive?: boolean | null;
  ownerApproved?: boolean | null;
}

export interface AdminGrowthLocation {
  id: string;
  isActive?: boolean | null;
  isVisible?: boolean | null;
}

export interface RegistrationBucket {
  label: string;
  drivers: number;
  owners: number;
}

export function getPlatformGrowthRange(range: PlatformGrowthRange, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "last_7_days") start.setDate(start.getDate() - 6);
  if (range === "last_30_days") start.setDate(start.getDate() - 29);
  if (range === "current_month") start.setDate(1);

  return { start, end: now };
}

function isInRange(value: string | Date | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function toDayKey(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function toDayLabel(value: Date) {
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildRegistrationBuckets(
  users: AdminGrowthUser[],
  range: PlatformGrowthRange,
  now = new Date(),
): RegistrationBucket[] {
  const { start, end } = getPlatformGrowthRange(range, now);
  const buckets = new Map<string, RegistrationBucket>();

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    buckets.set(toDayKey(cursor), { label: toDayLabel(cursor), drivers: 0, owners: 0 });
  }

  for (const user of users) {
    if (!isInRange(user.createdAt, start, end) || (user.role !== "driver" && user.role !== "owner")) continue;
    const createdAt = new Date(user.createdAt!);
    const bucket = buckets.get(toDayKey(createdAt));
    if (bucket) bucket[user.role === "driver" ? "drivers" : "owners"] += 1;
  }

  return Array.from(buckets.values());
}

export function buildAdminPlatformGrowth(
  users: AdminGrowthUser[],
  locations: AdminGrowthLocation[],
  range: PlatformGrowthRange,
  now = new Date(),
) {
  const { start, end } = getPlatformGrowthRange(range, now);
  const drivers = users.filter((user) => user.role === "driver");
  const owners = users.filter((user) => user.role === "owner");

  return {
    totalUsers: users.length,
    totalDrivers: drivers.length,
    totalOwners: owners.length,
    totalLocations: locations.length,
    activeDrivers: drivers.filter((driver) => driver.isActive === true).length,
    activeOwners: owners.filter((owner) => owner.isActive === true).length,
    inactiveDriverAccounts: drivers.filter((driver) => driver.isActive === false).length,
    inactiveOwnerAccounts: owners.filter((owner) => owner.isActive === false).length,
    activeLocations: locations.filter((location) => location.isActive === true).length,
    visibleLocations: locations.filter((location) => location.isVisible === true).length,
    pendingOwnerApprovals: owners.filter((owner) => owner.ownerApproved !== true).length,
    newDrivers: drivers.filter((driver) => isInRange(driver.createdAt, start, end)).length,
    newOwners: owners.filter((owner) => isInRange(owner.createdAt, start, end)).length,
    registrationBuckets: buildRegistrationBuckets(users, range, now),
  };
}
