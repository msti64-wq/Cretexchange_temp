import { BarChart3 } from "lucide-react";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { OwnerWorkspace } from "@/components/OwnerWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";

export function OwnerIntelligenceLoadingPanel({ facilityName }: { facilityName?: string | null }) {
  const { t } = useLanguage();

  return (
    <section className="space-y-4" data-testid="facility-intelligence-loading">
      <Card>
        <CardContent className="flex items-center gap-3 p-4" role="status" aria-live="polite">
          <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{t("owner.intelligence.loading")}</p>
            <p className="text-sm text-muted-foreground">
              {facilityName
                ? t("owner.intelligence.loadingFacility", { facility: facilityName })
                : t("owner.intelligence.loadingSelectedFacility")}
            </p>
            <p className="text-xs text-muted-foreground">{t("owner.intelligence.loadingHint")}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function OwnerIntelligenceRouteLoading() {
  const { t } = useLanguage();

  return (
    <OwnerWorkspace>
      <div className="min-h-screen bg-background pb-24" data-testid="owner-intelligence-route-loading">
        <header className="w-full border-b border-border bg-card text-foreground shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
            <BrandHeaderLogo alt={t("header.ownerPortal")} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("header.ownerPortal")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("header.ownerSubtitle")}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">{t("owner.intelligence.eyebrow")}</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("owner.intelligence.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("owner.intelligence.description")}</p>
          </div>
          <div className="max-w-sm space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("owner.intelligence.facilitySelectorLabel")}</p>
            <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
              {t("owner.intelligence.loadingSelectedFacility")}
            </div>
          </div>
          <OwnerIntelligenceLoadingPanel />
        </main>
      </div>
    </OwnerWorkspace>
  );
}
