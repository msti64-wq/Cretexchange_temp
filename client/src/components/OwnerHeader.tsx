import { useAuth } from "@/hooks/useAuth";
import { User, Plus, CreditCard } from "lucide-react";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";
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
    <header className="w-full gradient-bg text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3 sm:py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="brand-frame flex h-12 w-12 items-center justify-center rounded-2xl flex-shrink-0 sm:h-14 sm:w-14">
              <img
                src={logoImage}
                alt="CreteXchange - Streamlining Concrete Connections"
                className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  {t("header.ownerPortal")}
                </p>
                <span className="dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  {t("header.marketplaceControl")}
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight" data-testid="text-owner-name">
                {t("header.welcomeUser", { name: ownerName })}
              </h1>
              <p className="mt-1 text-sm text-white/80">{t("header.ownerSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <LanguageToggle />
            <LogoutButton onClick={logout} dataTestId="button-logout" tone="glass" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/profile')}
            data-testid="button-profile"
            className="h-11 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-10"
          >
            <User className="mr-2 h-4 w-4" />
            {t("common.profile")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-add-location"
            className="h-11 border border-amber-300/20 bg-amber-500 text-white hover:bg-amber-500/90 sm:h-10"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("header.addLocation")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/payment-methods')}
            data-testid="button-payment-methods"
            className="h-11 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-10"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {t("header.paymentMethods")}
          </Button>
        </div>
      </div>
    </header>
  );
}
