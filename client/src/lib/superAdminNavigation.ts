export type SuperAdminHubId = "users-locations" | "financials";

export function canAccessSuperAdminNavigationHub(role: string | null | undefined): boolean {
  return role === "super_admin";
}

export type SuperAdminHubDestination = {
  id: string;
  path: string;
  titleKey: string;
  descriptionKey: string;
};

export const SUPERADMIN_HUB_PATHS: Record<SuperAdminHubId, string> = {
  "users-locations": "/admin/users-locations",
  financials: "/admin/financials",
};

export const SUPERADMIN_HUB_DESTINATIONS: Record<SuperAdminHubId, SuperAdminHubDestination[]> = {
  "users-locations": [
    { id: "users", path: "/users", titleKey: "superadminHub.users", descriptionKey: "superadminHub.usersDescription" },
    { id: "drivers", path: "/users?role=driver", titleKey: "superadminHub.drivers", descriptionKey: "superadminHub.driversDescription" },
    { id: "owners", path: "/users?role=owner", titleKey: "superadminHub.owners", descriptionKey: "superadminHub.ownersDescription" },
    { id: "facilities", path: "/locations", titleKey: "superadminHub.facilities", descriptionKey: "superadminHub.facilitiesDescription" },
    { id: "geofences", path: "/admin/facility-geofence-controls", titleKey: "superadminHub.geofences", descriptionKey: "superadminHub.geofencesDescription" },
  ],
  financials: [
    { id: "unit-economics", path: "/unit-economics", titleKey: "superadminHub.unitEconomics", descriptionKey: "superadminHub.unitEconomicsDescription" },
    { id: "fees", path: "/fees", titleKey: "superadminHub.fees", descriptionKey: "superadminHub.feesDescription" },
    { id: "payments", path: "/payments", titleKey: "superadminHub.payments", descriptionKey: "superadminHub.paymentsDescription" },
    { id: "financial-workspace", path: "/financial-workspace", titleKey: "superadminHub.financialWorkspace", descriptionKey: "superadminHub.financialWorkspaceDescription" },
    { id: "financial-operations", path: "/admin/financial-operations", titleKey: "superadminHub.financialOperations", descriptionKey: "superadminHub.financialOperationsDescription" },
    { id: "settlements", path: "/reconciliation", titleKey: "superadminHub.settlements", descriptionKey: "superadminHub.settlementsDescription" },
    { id: "billing-audit", path: "/billing-audit-report", titleKey: "superadminHub.billingAudit", descriptionKey: "superadminHub.billingAuditDescription" },
    { id: "subscriptions", path: "/subscriptions", titleKey: "superadminHub.subscriptions", descriptionKey: "superadminHub.subscriptionsDescription" },
    { id: "service-accounts", path: "/service-accounts", titleKey: "superadminHub.serviceAccounts", descriptionKey: "superadminHub.serviceAccountsDescription" },
    { id: "billing-settings", path: "/billing-settings", titleKey: "superadminHub.billingSettings", descriptionKey: "superadminHub.billingSettingsDescription" },
  ],
};

const USERS_AND_LOCATIONS_CHILDREN = [
  "/users",
  "/locations",
  "/admin/facility-geofence-controls",
];

const FINANCIAL_CHILDREN = [
  "/unit-economics",
  "/fees",
  "/payments",
  "/financial-workspace",
  "/admin/financial-operations",
  "/batch-payments",
  "/reconciliation",
  "/subscriptions",
  "/billing-settings",
  "/billing",
  "/billing-audit-report",
  "/service-accounts",
];

function normalizedPath(location: string): string {
  return location.split(/[?#]/, 1)[0] || "/";
}

function matchesRoute(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

export function getSuperAdminHubForPath(location: string): SuperAdminHubId | null {
  const path = normalizedPath(location);
  if (path === SUPERADMIN_HUB_PATHS["users-locations"] || USERS_AND_LOCATIONS_CHILDREN.some((route) => matchesRoute(path, route))) {
    return "users-locations";
  }
  if (path === SUPERADMIN_HUB_PATHS.financials || FINANCIAL_CHILDREN.some((route) => matchesRoute(path, route))) {
    return "financials";
  }
  return null;
}

export function getSuperAdminHubReturnPath(location: string): string | null {
  const path = normalizedPath(location);
  const hub = getSuperAdminHubForPath(path);
  if (!hub || path === SUPERADMIN_HUB_PATHS[hub]) return null;
  return SUPERADMIN_HUB_PATHS[hub];
}

export function resolveAdminUserRoleFilter(search: string): "all" | "driver" | "owner" | "admin" | "super_admin" {
  const role = new URLSearchParams(search).get("role");
  return role === "driver" || role === "owner" || role === "admin" || role === "super_admin" ? role : "all";
}
