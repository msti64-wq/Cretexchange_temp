import { ApiRequestError, apiRequest } from "./queryClient";

export type UnitEconomicsReport = {
  foundationReady: boolean;
  month: string;
  migrationRequired?: string;
  profitabilityComplete?: boolean;
  missingProviderCount?: number;
  costs: Array<{
    id: string | null;
    provider: string;
    category: string;
    amountCents: number | null;
    notes: string;
    sourceUrl: string;
    status: "confirmed" | "estimated" | "usage_based" | "unconfirmed" | "free";
    billingCadence: "monthly" | "annual" | "per_transaction" | "per_unit";
    costModel: "fixed" | "variable";
    isRecorded: boolean;
    includedInCalculation: boolean;
  }>;
  assumptions?: {
    feePerValidatedLoadCents: number;
    paymentProcessingPercent: number;
    paymentProcessingFixedCents: number;
    evidenceStorageProvider: string;
    evidenceStorageNotes: string;
  };
  metrics?: {
    validatedLoads: number;
    grossRevenueCents: number;
    fixedCostsCents: number;
    variableCostsCents: number;
    contributionProfitCents: number;
    isFiveDollarFeeProfitable: boolean;
    breakEvenLoads: number | null;
    profitPerValidatedLoadCents: number | null;
  };
};

type DownloadAnchor = { href: string; download: string; click: () => void; remove: () => void; };
type BrowserDownloadEnvironment = { createObjectUrl: (blob: Blob) => string; revokeObjectUrl: (url: string) => void; createAnchor: () => DownloadAnchor; appendAnchor: (anchor: DownloadAnchor) => void; };

export const unitEconomicsReportQueryKey = (month: string) => ["/api/superadmin/unit-economics", month] as const;

export async function fetchUnitEconomicsReport(month: string): Promise<UnitEconomicsReport> {
  const response = await apiRequest("GET", `/api/superadmin/unit-economics?month=${encodeURIComponent(month)}`);
  return response.json() as Promise<UnitEconomicsReport>;
}
export async function fetchUnitEconomicsCsv(month: string): Promise<{ blob: Blob; filename: string }> {
  const response = await apiRequest("GET", `/api/superadmin/unit-economics/export.csv?month=${encodeURIComponent(month)}`);
  return { blob: await response.blob(), filename: `cretexchange-unit-economics-${month}.csv` };
}
export function downloadUnitEconomicsCsv(blob: Blob, filename: string, environment: BrowserDownloadEnvironment = {
  createObjectUrl: (value) => URL.createObjectURL(value), revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  createAnchor: () => document.createElement("a"), appendAnchor: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
}): void {
  const objectUrl = environment.createObjectUrl(blob); const anchor = environment.createAnchor();
  try { anchor.href = objectUrl; anchor.download = filename; environment.appendAnchor(anchor); anchor.click(); }
  finally { anchor.remove(); environment.revokeObjectUrl(objectUrl); }
}
export function unitEconomicsAccessErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (error.details.status === 401) return "Your session has expired. Sign in again to view unit economics.";
  if (error.details.status === 403) return "Superadmin access is required to view unit economics.";
  return null;
}
export function shouldShowUnitEconomicsFoundationWarning(report: UnitEconomicsReport | undefined, requestSucceeded: boolean): boolean {
  return requestSucceeded && report?.foundationReady === false;
}
