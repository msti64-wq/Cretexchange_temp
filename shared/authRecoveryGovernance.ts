export const AUTH_RECOVERY_SERVICE_TARGETS = {
  routineOwnerDriverBusinessDays: 1,
  privilegedDelayHours: 24,
} as const;

export const FOUNDER_BREAK_GLASS_CUSTODIANS = [
  { role: "founder_break_glass_custodian_one", name: "Jonathan Stiger" },
  { role: "founder_break_glass_custodian_two", name: "Joe Kelly" },
] as const;

export type FounderBreakGlassCustodianRole = typeof FOUNDER_BREAK_GLASS_CUSTODIANS[number]["role"];

export type BreakGlassApprovalInput = Readonly<{
  participatingRoles: readonly FounderBreakGlassCustodianRole[];
  emergencyReason: string;
  subjectApprovedOwnRecovery: boolean;
}>;

export function validateFounderBreakGlassApproval(input: BreakGlassApprovalInput):
  | { valid: true }
  | { valid: false; reason: "both_custodians_required" | "self_approval_forbidden" | "emergency_reason_required" } {
  if (input.subjectApprovedOwnRecovery) return { valid: false, reason: "self_approval_forbidden" };
  const participants = new Set(input.participatingRoles);
  if (!FOUNDER_BREAK_GLASS_CUSTODIANS.every(({ role }) => participants.has(role))) {
    return { valid: false, reason: "both_custodians_required" };
  }
  if (input.emergencyReason.trim().length < 20 || input.emergencyReason.trim().length > 500) {
    return { valid: false, reason: "emergency_reason_required" };
  }
  return { valid: true };
}
