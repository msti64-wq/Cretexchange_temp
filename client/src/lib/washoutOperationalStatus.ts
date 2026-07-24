import {
  isApprovedWashout,
  isPendingWashoutApproval,
  isRejectedWashout,
} from "@shared/washoutApproval";

export type WashoutOperationalAudience = "driver" | "owner" | "admin";
export type WashoutOperationalState = "pending_review" | "verified" | "rejected" | "incomplete" | "requires_review";

export interface WashoutOperationalStatus {
  state: WashoutOperationalState;
  tone: "success" | "warning" | "danger" | "info";
  labelKey: string;
  detailKey: string;
  nextActionKey: string;
  rejectionReason: string | null;
  requiresOwnerAction: boolean;
  requiresAdminAttention: boolean;
}

const INCOMPLETE_PRESENTATION_STATUSES = new Set([
  "incomplete",
  "draft",
  "upload_failed",
  "submission_failed",
]);

const REVIEW_PRESENTATION_STATUSES = new Set([
  "needs_review",
  "under_review",
  "delayed",
  "exception",
  "awaiting_information",
]);

function normalize(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function nextActionKey(state: WashoutOperationalState, audience: WashoutOperationalAudience): string {
  return `washout.recovery.${state}.${audience}`;
}

/**
 * Converts the persisted activity contract and recognized legacy presentation
 * aliases into user-facing operational guidance. This intentionally never
 * consumes payment, wallet, payout, Stripe, or settlement data.
 */
export function resolveWashoutOperationalStatus(input: {
  status?: string | null;
  rejectionReason?: string | null;
  audience: WashoutOperationalAudience;
}): WashoutOperationalStatus {
  const status = normalize(input.status);
  const rejectionReason = typeof input.rejectionReason === "string" && input.rejectionReason.trim()
    ? input.rejectionReason.trim()
    : null;

  if (isApprovedWashout(status)) {
    return {
      state: "verified",
      tone: "success",
      labelKey: "washout.status.verified",
      detailKey: "washout.status.verifiedDetail",
      nextActionKey: nextActionKey("verified", input.audience),
      rejectionReason: null,
      requiresOwnerAction: false,
      requiresAdminAttention: false,
    };
  }

  if (isRejectedWashout(status)) {
    return {
      state: "rejected",
      tone: "danger",
      labelKey: "washout.status.rejected",
      detailKey: "washout.status.rejectedDetail",
      nextActionKey: nextActionKey("rejected", input.audience),
      rejectionReason,
      requiresOwnerAction: false,
      requiresAdminAttention: true,
    };
  }

  if (INCOMPLETE_PRESENTATION_STATUSES.has(status)) {
    return {
      state: "incomplete",
      tone: "warning",
      labelKey: "washout.status.incomplete",
      detailKey: "washout.status.incompleteDetail",
      nextActionKey: nextActionKey("incomplete", input.audience),
      rejectionReason: null,
      requiresOwnerAction: false,
      requiresAdminAttention: false,
    };
  }

  if (REVIEW_PRESENTATION_STATUSES.has(status) || !status) {
    return {
      state: "requires_review",
      tone: "info",
      labelKey: "washout.status.requiresReview",
      detailKey: "washout.status.requiresReviewDetail",
      nextActionKey: nextActionKey("requires_review", input.audience),
      rejectionReason: null,
      requiresOwnerAction: false,
      requiresAdminAttention: true,
    };
  }

  if (isPendingWashoutApproval(status)) {
    return {
      state: "pending_review",
      tone: "warning",
      labelKey: "washout.status.pendingReview",
      detailKey: "washout.status.pendingReviewDetail",
      nextActionKey: nextActionKey("pending_review", input.audience),
      rejectionReason: null,
      requiresOwnerAction: true,
      requiresAdminAttention: false,
    };
  }

  return {
    state: "requires_review",
    tone: "info",
    labelKey: "washout.status.requiresReview",
    detailKey: "washout.status.requiresReviewDetail",
    nextActionKey: nextActionKey("requires_review", input.audience),
    rejectionReason: null,
    requiresOwnerAction: false,
    requiresAdminAttention: true,
  };
}
