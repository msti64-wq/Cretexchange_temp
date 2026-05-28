export const WASHOUT_PENDING_APPROVAL_STATUSES = new Set([
  "pending",
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
