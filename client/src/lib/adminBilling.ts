export function canViewOwnerBillingDryRunTool(role?: string | null): boolean {
  return role === "super_admin";
}
