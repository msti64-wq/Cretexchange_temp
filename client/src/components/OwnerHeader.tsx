import { useAuth } from "@/hooks/useAuth";
import { BarChart3, User, Plus, CreditCard } from "lucide-react";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LogoutButton } from "@/components/LogoutButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

export function OwnerHeader() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <header className="w-full border-b border-border bg-card text-foreground shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3 sm:py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BrandHeaderLogo alt={t("header.ownerPortal")} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("header.ownerPortal")}
                </p>
                <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("header.marketplaceControl")}
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight" data-testid="text-owner-name">
                {t("header.welcomeUser", { name: ownerName })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("header.ownerSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <LanguageToggle />
            <LogoutButton onClick={logout} dataTestId="button-logout" tone="neutral" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/intelligence')}
            data-testid="button-facility-intelligence"
            className="h-11 border-border bg-card text-foreground hover:bg-muted sm:h-10"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            {t("owner.intelligence.nav")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
            className="h-11 border-border bg-card text-foreground hover:bg-muted sm:h-10"
          >
            <User className="mr-2 h-4 w-4" />
            {t("common.profile")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-add-location"
            className="h-11 border border-border bg-primary text-primary-foreground hover:bg-primary/90 sm:h-10"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("header.addLocation")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/payment-methods')}
            data-testid="button-payment-methods"
            className="h-11 border-border bg-card text-foreground hover:bg-muted sm:h-10"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {t("header.paymentMethods")}
          </Button>
        </div>
      </div>
    </header>
  );
}
