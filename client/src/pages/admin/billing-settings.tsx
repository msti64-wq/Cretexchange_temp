import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileNav } from "@/components/MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { isPlatformOperationsRole } from "@/lib/adminFinancialWorkspace";

type LegacyBillingOwner = { billingCadence: string; billingCutoffTime: string; billingTimezone: string; billingDayOfWeek: number };
type BillingSettingsResponse = { owners: LegacyBillingOwner[] };

export default function AdminBillingSettings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allowed = isPlatformOperationsRole(user?.role);
  const billing = useQuery<BillingSettingsResponse>({ queryKey: ["/api/admin/billing/settings"], retry: false, enabled: allowed });

  if (!allowed) return <div className="min-h-screen bg-background p-4" role="alert">{t("legacyFinancial.accessRequired")}</div>;
  const owners = billing.data?.owners || [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="gradient-bg p-4 text-white shadow-lg"><div className="flex items-center gap-3"><FileText className="h-5 w-5" aria-hidden="true" /><div><h1 className="text-lg font-semibold">{t("legacyFinancial.billing.title")}</h1><p className="text-sm text-white/80">{t("legacyFinancial.billing.description")}</p></div></div></header>
      <main className="space-y-4 p-4">
        <section role="alert" aria-live="polite" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{t("legacyFinancial.billing.notice")}</p></div><Link href="/financial-workspace" className="mt-3 inline-flex font-medium underline underline-offset-4">{t("legacyFinancial.workspaceLink")}</Link></section>
        <Card><CardHeader><CardTitle>{t("legacyFinancial.billing.settingsTitle")}</CardTitle><CardDescription>{t("legacyFinancial.readOnly")}</CardDescription></CardHeader><CardContent className="space-y-3">
          {billing.isLoading ? <p role="status">{t("common.loading")}</p> : billing.isError ? <p role="alert">{t("legacyFinancial.unavailable")}</p> : owners.length === 0 ? <p className="text-muted-foreground">{t("legacyFinancial.billing.empty")}</p> : owners.map((owner, index) => <article key={index} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.reference")}</p><p className="font-medium">{t("legacyFinancial.record", { number: index + 1 })}</p></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.billing.cadence")}</p><Badge variant="outline">{owner.billingCadence || t("legacyFinancial.unavailable")}</Badge></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.billing.cutoff")}</p><p>{owner.billingCutoffTime || t("legacyFinancial.unavailable")}</p></div><div><p className="text-xs text-muted-foreground">{t("legacyFinancial.billing.timezone")}</p><p>{owner.billingTimezone || t("legacyFinancial.unavailable")}</p></div></article>)}
        </CardContent></Card>
      </main>
      <MobileNav role={user?.role} />
    </div>
  );
}
