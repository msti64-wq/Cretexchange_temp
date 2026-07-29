export type OwnerTermsReadinessState = "loading" | "accepted" | "required" | "unavailable" | "error";

export interface OwnerTermsStatus {
  hasAgreed?: boolean | null;
  acceptedLanguage?: "en" | "es" | null;
}

/**
 * Presentation-only state for the existing Owner consent endpoints. This is
 * deliberately independent of Facility approval, location authorization, and
 * every financial-readiness signal.
 */
export function resolveOwnerTermsReadiness({
  status,
  isLoading,
  isError,
  errorCode,
}: {
  status?: OwnerTermsStatus | null;
  isLoading: boolean;
  isError: boolean;
  errorCode?: string;
}): OwnerTermsReadinessState {
  if (isLoading) return "loading";
  if (isError) return errorCode === "TERMS_LEDGER_UNAVAILABLE" ? "unavailable" : "error";
  return status?.hasAgreed === true ? "accepted" : "required";
}
