import { resolveWashoutOperationalStatus } from "@/lib/washoutOperationalStatus";

export interface TrustVerificationActivityRow {
  washoutStatus?: unknown;
  rejectionReason?: unknown;
}

export interface AutoApprovalStats {
  pendingCounts?: {
    olderThan24h?: unknown;
    olderThan48h?: unknown;
    olderThan72h?: unknown;
  } | null;
}

function toOperationalCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function buildAdminTrustVerification(
  activities: TrustVerificationActivityRow[] | null | undefined,
  autoApprovalStats: AutoApprovalStats | null | undefined,
) {
  const statusCounts = activities === undefined || activities === null
    ? null
    : activities.reduce(
      (counts, activity) => {
        const status = resolveWashoutOperationalStatus({
          status: typeof activity.washoutStatus === "string" ? activity.washoutStatus : null,
          rejectionReason: typeof activity.rejectionReason === "string" ? activity.rejectionReason : null,
          audience: "admin",
        });
        if (status.state === "verified") counts.verified += 1;
        if (status.state === "pending_review") counts.pending += 1;
        if (status.state === "rejected") counts.rejected += 1;
        // Rejections have their own persisted-status metric. Exceptions are
        // only additional review cases so the dashboard never double-counts.
        if (status.requiresAdminAttention && status.state !== "rejected") counts.exceptions += 1;
        return counts;
      },
      { verified: 0, pending: 0, rejected: 0, exceptions: 0 },
    );

  const pendingCounts = autoApprovalStats?.pendingCounts;

  return {
    verified: statusCounts?.verified ?? null,
    pending: statusCounts?.pending ?? null,
    rejected: statusCounts?.rejected ?? null,
    exceptions: statusCounts?.exceptions ?? null,
    reviewBacklog: statusCounts?.pending ?? null,
    olderThan24h: toOperationalCount(pendingCounts?.olderThan24h),
    olderThan48h: toOperationalCount(pendingCounts?.olderThan48h),
    olderThan72h: toOperationalCount(pendingCounts?.olderThan72h),
    distribution: statusCounts
      ? [
          { label: "Verified", count: statusCounts.verified },
          { label: "Pending", count: statusCounts.pending },
          { label: "Rejected", count: statusCounts.rejected },
          { label: "Review exceptions", count: statusCounts.exceptions },
        ]
      : [],
  };
}
