import { useAuth } from "@/hooks/useAuth";
import { LogOut, User, Plus, CreditCard } from "lucide-react";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function OwnerHeader() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-40 gradient-bg text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl">
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
                  Owner portal
                </p>
                <span className="dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  Marketplace control
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-tight" data-testid="text-owner-name">
                Welcome, {user?.firstName} {user?.lastName}
              </h1>
              <p className="mt-1 text-sm text-white/80">Location management, approvals, and payouts.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            data-testid="button-logout"
            className="h-11 border-white/20 bg-black/20 text-white hover:bg-black/35 hover:text-white self-start sm:h-10 sm:self-auto"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
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
            Profile
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLocation('/locations')}
            data-testid="button-add-location"
            className="h-11 border border-amber-300/20 bg-amber-500 text-white hover:bg-amber-500/90 sm:h-10"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/payment-methods')}
            data-testid="button-payment-methods"
            className="h-11 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-10"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Payment Methods
          </Button>
        </div>
      </div>
    </header>
  );
}
