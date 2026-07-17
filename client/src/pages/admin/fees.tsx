import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";
import { formatCurrency } from "@/lib/utils";

type Metric = { count: number; driverIncentiveCents: number | null; platformFeeCents: number | null; facilityChargeCents: number | null };
type Summary = { openCanonicalObligations: Metric; generatedAt: string };
type Obligation = { obligationReference?: string; activityReference?: string; frozenDriverIncentiveCents?: number; frozenPlatformFeeCents?: number; facilityChargeCents?: number; status?: string; batchState?: string; approved?: boolean };
type FeeLedger = { amountCents: number; periodStart: string; periodEnd: string; status: string };

const money = (value: number | null | undefined) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? formatCurrency(value / 100) : "—";

function SourceState({ loading, error, empty, children }: { loading: boolean; error: boolean; empty: boolean; children: ReactNode }) {
  const { t } = useLanguage();
  if (loading) return <p role="status" aria-live="polite">{t("common.loading")}</p>;
  if (error) return <p role="alert">{t("financialVisibility.unavailable")}</p>;
  if (empty) return <p className="text-sm text-muted-foreground">{t("financialVisibility.empty")}</p>;
  return <>{children}</>;
}

export default function AdminFees() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allowed = isPlatformOperationsRole(user?.role);
  const summary = useQuery<Summary>({ queryKey: ["/api/admin/financial-workspace/summary"], enabled: allowed });
  const unbatched = useQuery<{ items: Obligation[] }>({ queryKey: ["/api/admin/financial-obligations/unbatched", "fees"], enabled: allowed });
  const ledger = useQuery<FeeLedger[]>({ queryKey: ["/api/admin/fees/ledger?status=pending"], retry: false, enabled: allowed });
  if (!allowed) return <div className="min-h-screen bg-background p-4" role="alert">{t("legacyFinancial.accessRequired")}</div>;
  const canonical = Array.isArray(unbatched.data?.items) ? unbatched.data.items : [];
  const historical = ledger.data || [];
  return <div className="min-h-screen bg-background pb-20"><header className="gradient-bg p-4 text-white shadow-lg"><div className="flex gap-3"><FileText className="h-5 w-5" aria-hidden="true" /><div><h1 className="text-lg font-semibold">{t("financialVisibility.fees.title")}</h1><p className="text-sm text-white/80">{t("financialVisibility.fees.description")}</p></div></div></header><main className="space-y-4 p-4"><section role="note" className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm"><p>{t("financialVisibility.nonExecuting")}</p><Link href="/financial-workspace" className="mt-2 inline-flex font-medium underline underline-offset-4">{t("legacyFinancial.workspaceLink")}</Link></section><Card><CardHeader><CardTitle>{t("financialVisibility.canonicalFees")}</CardTitle><CardDescription>{t("financialWorkspace.summary.fee")}: {money(summary.data?.openCanonicalObligations.platformFeeCents)}</CardDescription></CardHeader><CardContent><SourceState loading={unbatched.isLoading || summary.isLoading} error={unbatched.isError || summary.isError} empty={canonical.length === 0}><div className="space-y-3">{canonical.map((row, index) => <article key={row.obligationReference || index} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"><span>{row.activityReference || t("financialVisibility.activity")}</span><span>{money(row.frozenPlatformFeeCents)}</span><span>{row.status || "pending"}</span><span>{row.batchState || t("financialWorkspace.unbatched.title")}</span></article>)}</div></SourceState></CardContent></Card><Card><CardHeader><CardTitle>{t("financialVisibility.canonicalIncentives")}</CardTitle><CardDescription>{t("financialWorkspace.summary.driver")}: {money(summary.data?.openCanonicalObligations.driverIncentiveCents)}</CardDescription></CardHeader><CardContent><SourceState loading={unbatched.isLoading || summary.isLoading} error={unbatched.isError || summary.isError} empty={canonical.length === 0}><div className="space-y-3">{canonical.map((row, index) => <article key={`${row.obligationReference || index}-incentive`} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"><span>{row.activityReference || t("financialVisibility.activity")}</span><span>{money(row.frozenDriverIncentiveCents)}</span><span>{row.status || "pending"}</span><span>{row.batchState || t("financialWorkspace.unbatched.title")}</span></article>)}</div></SourceState></CardContent></Card><Card><CardHeader><CardTitle>{t("financialVisibility.historical")}</CardTitle><CardDescription>{t("financialVisibility.historicalFeeExplanation")}</CardDescription></CardHeader><CardContent><SourceState loading={ledger.isLoading} error={ledger.isError} empty={historical.length === 0}><div className="space-y-3">{historical.map((row, index) => <article key={`${row.periodStart}-${index}`} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3"><span>{t("legacyFinancial.record", { number: index + 1 })}</span><span>{money(row.amountCents)}</span><span>{row.periodStart} – {row.periodEnd}</span></article>)}</div></SourceState></CardContent></Card></main><MobileNav role={user?.role} /></div>;
}
