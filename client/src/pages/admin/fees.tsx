import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";
import { formatCurrency } from "@/lib/utils";

type FeeLedger = { amountCents: number; periodStart: string; periodEnd: string; status: string };

export default function AdminFees() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allowed = isPlatformOperationsRole(user?.role);
  const [filterStatus, setFilterStatus] = useState("pending");
  const ledger = useQuery<FeeLedger[]>({ queryKey: [`/api/admin/fees/ledger?status=${filterStatus}`], retry: false, enabled: allowed });
  const legacyStatus = (value: string | null | undefined) => {
    const knownStatus = typeof value === "string" && ["completed", "pending", "failed", "paid", "past_due", "processing", "cancelled", "approved", "settled"].includes(value)
      ? value
      : null;
    return knownStatus ? t(`legacyFinancial.status.${knownStatus}`) : t("legacyFinancial.unavailable");
  };

  if (!allowed) return <div className="min-h-screen bg-background p-4" role="alert">{t("legacyFinancial.accessRequired")}</div>;
  const rows = ledger.data || [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg p-4 text-white shadow-lg"><div className="flex items-center gap-3"><FileText className="h-5 w-5" aria-hidden="true" /><div><h1 className="text-lg font-semibold">{t("legacyFinancial.fees.title")}</h1><p className="text-sm text-white/80">{t("legacyFinancial.fees.description")}</p></div></div></header>
      <main className="space-y-4 p-4">
        <section role="alert" aria-live="polite" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{t("legacyFinancial.fees.notice")}</p></div><p className="mt-2">{t("legacyFinancial.fees.zeroExplanation")}</p><Link href="/financial-workspace" className="mt-3 inline-flex font-medium underline underline-offset-4">{t("legacyFinancial.workspaceLink")}</Link></section>
        <Card><CardHeader><CardTitle>{t("legacyFinancial.filters")}</CardTitle><CardDescription>{t("legacyFinancial.readOnly")}</CardDescription></CardHeader><CardContent><label className="block max-w-xs text-sm">{t("legacyFinancial.legacyStatus")}<Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">{t("legacyFinancial.status.pending")}</SelectItem><SelectItem value="paid">{t("legacyFinancial.status.paid")}</SelectItem><SelectItem value="failed">{t("legacyFinancial.status.failed")}</SelectItem><SelectItem value="past_due">{t("legacyFinancial.status.past_due")}</SelectItem></SelectContent></Select></label></CardContent></Card>
        <Card><CardHeader><CardTitle>{t("legacyFinancial.fees.records", { count: rows.length })}</CardTitle><CardDescription>{t("legacyFinancial.fees.recordDescription")}</CardDescription></CardHeader><CardContent className="space-y-3">
          {ledger.isLoading ? <p role="status">{t("common.loading")}</p> : ledger.isError ? <p role="alert">{t("legacyFinancial.unavailable")}</p> : rows.length === 0 ? <p className="text-muted-foreground">{t("legacyFinancial.fees.empty")}</p> : rows.map((fee, index) => <article key={index} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.reference")}</p><p className="font-medium">{t("legacyFinancial.record", { number: index + 1 })}</p></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.recordedAmount")}</p><p>{formatCurrency(fee.amountCents / 100)}</p></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.legacyStatus")}</p><Badge variant="outline">{legacyStatus(fee.status)}</Badge></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.period")}</p><p>{fee.periodStart} – {fee.periodEnd}</p></div></article>)}
        </CardContent></Card>
      </main>
      <MobileNav role={user?.role} />
    </div>
  );
}
