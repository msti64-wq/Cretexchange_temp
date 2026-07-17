import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";
import { formatCurrency } from "@/lib/utils";

type LegacyPayment = {
  amount: string | number | null;
  status: string | null;
  createdAt: string | null;
};

function safeDate(value: string | null | undefined, unavailable: string) {
  if (!value) return unavailable;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? unavailable : date.toLocaleDateString();
}

export default function AdminPayments() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allowed = isPlatformOperationsRole(user?.role);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const paymentsUrl = `/api/admin/payments${startDate || endDate ? "?" : ""}${[
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&")}`;
  const { data: payments, isLoading, isError } = useQuery<LegacyPayment[]>({
    queryKey: [paymentsUrl],
    retry: false,
    enabled: allowed,
  });
  const legacyStatus = (value: string | null | undefined) => {
    const knownStatus = typeof value === "string" && ["completed", "pending", "failed", "paid", "past_due", "processing", "cancelled", "approved", "settled"].includes(value)
      ? value
      : null;
    return knownStatus ? t(`legacyFinancial.status.${knownStatus}`) : t("legacyFinancial.unavailable");
  };
  const filteredPayments = (payments || []).filter((payment) => filterStatus === "all" || payment.status === filterStatus);

  if (!allowed) {
    return <div className="min-h-screen bg-background p-4" role="alert">{t("legacyFinancial.accessRequired")}</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg p-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5" aria-hidden="true" />
          <div><h1 className="text-lg font-semibold">{t("legacyFinancial.payments.title")}</h1><p className="text-sm text-white/80">{t("legacyFinancial.payments.description")}</p></div>
        </div>
      </header>
      <main className="space-y-4 p-4">
        <section role="alert" aria-live="polite" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{t("legacyFinancial.payments.notice")}</p></div>
          <Link href="/financial-workspace" className="mt-3 inline-flex font-medium underline underline-offset-4">{t("legacyFinancial.workspaceLink")}</Link>
        </section>
        <Card>
          <CardHeader><CardTitle>{t("legacyFinancial.filters")}</CardTitle><CardDescription>{t("legacyFinancial.readOnly")}</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">{t("legacyFinancial.startDate")}<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="text-sm">{t("legacyFinancial.endDate")}<Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            <label className="text-sm">{t("legacyFinancial.legacyStatus")}<Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("legacyFinancial.allStatuses")}</SelectItem><SelectItem value="completed">{t("legacyFinancial.status.completed")}</SelectItem><SelectItem value="pending">{t("legacyFinancial.status.pending")}</SelectItem><SelectItem value="failed">{t("legacyFinancial.status.failed")}</SelectItem></SelectContent></Select></label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("legacyFinancial.payments.records", { count: filteredPayments.length })}</CardTitle><CardDescription>{t("legacyFinancial.payments.recordDescription")}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p role="status">{t("common.loading")}</p> : isError ? <p role="alert">{t("legacyFinancial.unavailable")}</p> : filteredPayments.length === 0 ? <p className="text-muted-foreground">{t("legacyFinancial.payments.empty")}</p> : filteredPayments.map((payment, index) => (
              <article key={index} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">{t("legacyFinancial.reference")}</p><p className="font-medium">{t("legacyFinancial.record", { number: index + 1 })}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("legacyFinancial.recordedAmount")}</p><p>{formatCurrency(Number(payment.amount || 0))}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("legacyFinancial.legacyStatus")}</p><Badge variant="outline">{legacyStatus(payment.status)}</Badge></div>
                <div><p className="text-xs text-muted-foreground">{t("legacyFinancial.recordedAt")}</p><p>{safeDate(payment.createdAt, t("legacyFinancial.unavailable"))}</p></div>
              </article>
            ))}
          </CardContent>
        </Card>
      </main>
      <MobileNav role={user?.role} />
    </div>
  );
}
