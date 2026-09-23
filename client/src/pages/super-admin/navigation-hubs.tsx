import {
  Building2,
  Calculator,
  CreditCard,
  DollarSign,
  FileSearch,
  Landmark,
  MapPinned,
  ReceiptText,
  ShieldCheck,
  Truck,
  UserRoundCog,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { MobileNav } from "@/components/MobileNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { canAccessSuperAdminNavigationHub, SUPERADMIN_HUB_DESTINATIONS, type SuperAdminHubDestination, type SuperAdminHubId } from "@/lib/superAdminNavigation";

const ICONS: Record<string, LucideIcon> = {
  users: UserRoundCog,
  drivers: Truck,
  owners: Users,
  facilities: Building2,
  geofences: MapPinned,
  "unit-economics": Calculator,
  fees: ReceiptText,
  payments: CreditCard,
  "financial-workspace": Landmark,
  "financial-operations": Landmark,
  settlements: WalletCards,
  "billing-audit": FileSearch,
  subscriptions: DollarSign,
  "service-accounts": ShieldCheck,
  "billing-settings": ReceiptText,
};

function HubCard({ destination }: { destination: SuperAdminHubDestination }) {
  const { t } = useLanguage();
  const Icon = ICONS[destination.id] || ShieldCheck;
  return (
    <Link
      href={destination.path}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${t(destination.titleKey)}: ${t(destination.descriptionKey)}`}
      data-testid={`hub-link-${destination.id}`}
    >
      <Card className="h-full transition-colors group-hover:border-primary/60 group-hover:bg-muted/30">
        <CardHeader className="space-y-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <CardTitle className="break-words text-lg">{t(destination.titleKey)}</CardTitle>
            <CardDescription className="break-words leading-6">{t(destination.descriptionKey)}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

function HubPage({ hub }: { hub: SuperAdminHubId }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!canAccessSuperAdminNavigationHub(user?.role)) {
    return <main className="mx-auto max-w-3xl p-6" role="alert"><Card><CardHeader><CardTitle>{t("superadminHub.accessRequired")}</CardTitle><CardDescription>{t("superadminHub.accessDescription")}</CardDescription></CardHeader></Card></main>;
  }

  const financial = hub === "financials";
  return (
    <div className="min-h-screen bg-background pb-28" data-testid={`${hub}-hub-page`}>
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
          <p className="text-sm font-medium text-primary">{t("superadminHub.eyebrow")}</p>
          <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">
            {t(financial ? "superadminHub.financialsTitle" : "superadminHub.usersLocationsTitle")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t(financial ? "superadminHub.financialsDescription" : "superadminHub.usersLocationsDescription")}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {financial && (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4" role="status" data-testid="financial-execution-disabled">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">{t("superadminHub.financialExecutionDisabled")}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("superadminHub.financialExecutionDisabledDescription")}</p>
              </div>
            </div>
          </section>
        )}
        <section aria-label={t(financial ? "superadminHub.financialsTitle" : "superadminHub.usersLocationsTitle")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SUPERADMIN_HUB_DESTINATIONS[hub].map((destination) => <HubCard key={destination.id} destination={destination} />)}
        </section>
      </main>
      <MobileNav role="super_admin" />
    </div>
  );
}

export function SuperAdminUsersLocationsHub() {
  return <HubPage hub="users-locations" />;
}

export function SuperAdminFinancialsHub() {
  return <HubPage hub="financials" />;
}
