// Canonical persisted Owner-review lifecycle state. Legacy display helpers below
// intentionally recognize older aliases, but new server queries must use this
// single persisted value so summary cards and review queues cannot diverge.
export const WASHOUT_CANONICAL_PENDING_STATUS = "pending" as const;

export const WASHOUT_PENDING_APPROVAL_STATUSES = new Set([
  WASHOUT_CANONICAL_PENDING_STATUS,
  "submitted",
  "pending_owner_approval",
  "pending_photo_approval",
  "photo_pending",
  "awaiting_approval",
  "awaiting_owner_approval",
  "awaiting_photo_approval",
]);

export const WASHOUT_APPROVED_STATUSES = new Set([
  "verified",
  "approved",
  "completed",
  "paid",
  "settled",
]);

export const WASHOUT_REJECTED_STATUSES = new Set([
  "rejected",
  "declined",
  "cancelled",
  "canceled",
]);

export const WASHOUT_OWNER_BILLING_STATUSES = new Set([
  "verified",
  "approved",
  "completed",
]);

function normalizeStatusValue(status?: string | null): string {
  return String(status ?? "").trim().toLowerCase();
}

export function isPendingWashoutApproval(status?: string | null): boolean {
  return WASHOUT_PENDING_APPROVAL_STATUSES.has(normalizeStatusValue(status));
}

export function isApprovedWashout(status?: string | null): boolean {
  return WASHOUT_APPROVED_STATUSES.has(normalizeStatusValue(status));
}

export function isRejectedWashout(status?: string | null): boolean {
  return WASHOUT_REJECTED_STATUSES.has(normalizeStatusValue(status));
}

export function isBillableWashoutForOwnerBilling(activity: { status?: string | null }): boolean {
  return WASHOUT_OWNER_BILLING_STATUSES.has(normalizeStatusValue(activity.status));
}

export function getWashoutApprovalDisplayStatus(status?: string | null): string {
  if (isApprovedWashout(status)) {
    return "Approved & Paid";
  }

  if (isRejectedWashout(status)) {
    return "Rejected";
  }

  if (isPendingWashoutApproval(status)) {
    return "Pending Review";
  }

  return String(status ?? "Pending Review");
}

export function getWashoutApprovalTransitionLabel(status?: string | null): string {
  if (isApprovedWashout(status)) {
    return "approved";
  }

  if (isRejectedWashout(status)) {
    return "rejected";
  }

  return "pending approval";
}

export function filterPendingWashoutApprovals<T extends { status?: string | null }>(activities: T[]): T[] {
  return activities.filter((activity) => isPendingWashoutApproval(activity.status));
}
