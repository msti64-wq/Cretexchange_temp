export type FinancialWorkspaceBatchState = "draft" | "ready_for_review" | "approved" | "cancelled";

export type FinancialWorkspaceAction = "move_to_review" | "approve" | "cancel";

export type FinancialBatchProjection = {
  id: string;
  reference: string;
  facilityReference: string | null;
  state: FinancialWorkspaceBatchState;
  period: { start: string; end: string; timezone: string; cadence: string };
  revision: number;
  obligationCount: number;
  frozenDriverIncentiveCents: number;
  frozenPlatformFeeCents: number;
  frozenFacilityChargeCents: number;
  exceptionCount: number;
  nextActions: string[];
  lifecycle: {
    reviewedAt: string | null;
    approvedAt: string | null;
    cancelledAt: string | null;
    reviewActorReference: string | null;
    approvalActorReference: string | null;
    cancellationActorReference: string | null;
  };
};

export type FinancialDiscoveryResponse = {
  items: Array<Record<string, unknown>>;
  pagination?: { total?: number };
};

const stateLabels: Record<FinancialWorkspaceBatchState, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  cancelled: "Cancelled",
};

const stateActions: Record<FinancialWorkspaceBatchState, FinancialWorkspaceAction[]> = {
  draft: ["move_to_review", "cancel"],
  ready_for_review: ["approve", "cancel"],
  approved: ["cancel"],
  cancelled: [],
};

const actionLabels: Record<FinancialWorkspaceAction, string> = {
  move_to_review: "Move to Review",
  approve: "Approve",
  cancel: "Cancel",
};

export function workspaceBatchStateLabel(state: FinancialWorkspaceBatchState | string | null | undefined): string {
  return state && state in stateLabels ? stateLabels[state as FinancialWorkspaceBatchState] : "Unavailable";
}

export function workspaceBatchActions(state: FinancialWorkspaceBatchState | string | null | undefined): FinancialWorkspaceAction[] {
  return state && state in stateActions ? stateActions[state as FinancialWorkspaceBatchState] : [];
}

export function workspaceActionLabel(action: FinancialWorkspaceAction): string {
  return actionLabels[action];
}

export function formatFinancialWorkspaceCents(value: unknown, locale = "en-US", unavailable = "Unavailable"): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return unavailable;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(value / 100);
}

export function formatFinancialWorkspaceAge(value: unknown, unavailable = "Unavailable", locale = "en-US"): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return unavailable;
  const seconds = Math.floor(value);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (seconds < 60) return formatter.format(0, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return formatter.format(-days, "day");
}

export function formatFinancialWorkspaceTimestamp(value: unknown, locale = "en-US", unavailable = "Unavailable"): string {
  if (typeof value !== "string") return unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function batchStateDescription(state: FinancialWorkspaceBatchState | string | null | undefined): string {
  switch (state) {
    case "draft": return "Frozen draft awaiting review.";
    case "ready_for_review": return "Frozen draft available for separate approval.";
    case "approved": return "Approved. Not executed, charged, paid, or settled.";
    case "cancelled": return "Historical record. No reopen or edit action is available.";
    default: return "Batch state is unavailable.";
  }
}

export function financialWorkspaceAuditEventLabel(eventType: unknown): string {
  switch (eventType) {
    case "draft_created": return "Created";
    case "ready_for_review": return "Ready for Review";
    case "approved": return "Approved";
    case "cancelled": return "Cancelled";
    case "membership_released": return "Membership Released";
    default: return "Unavailable";
  }
}

export function isPlatformOperationsRole(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

export function extractFinancialWorkspaceItems(value: unknown): Array<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as FinancialDiscoveryResponse).items)) return null;
  return (value as FinancialDiscoveryResponse).items;
}

export function normalizeFinancialWorkspaceReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : null;
}

export function normalizeFinancialWorkspacePeriodAnchor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

export type FinancialWorkspaceErrorKind = "reference" | "forbidden" | "state" | "conflict" | "reason" | "unavailable" | "generic";

export function financialWorkspaceErrorKind(error: unknown, manualReference = false): FinancialWorkspaceErrorKind {
  if (manualReference) return "reference";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|403|access required|authentication required/.test(message)) return "forbidden";
  if (/state|concurrently|already approved|already cancelled/.test(message)) return "state";
  if (/409|duplicate|conflict|exception/.test(message)) return "conflict";
  if (/reason|required|invalid request/.test(message)) return "reason";
  if (/503|unavailable/.test(message)) return "unavailable";
  return "generic";
}
