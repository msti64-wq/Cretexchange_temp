import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { getSuperAdminHubForPath, getSuperAdminHubReturnPath } from "@/lib/superAdminNavigation";

export function SuperAdminHubReturn() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const returnPath = getSuperAdminHubReturnPath(location);
  const hub = getSuperAdminHubForPath(location);

  if (user?.role !== "super_admin" || !returnPath || !hub) return null;

  return (
    <div className="border-b border-border/70 bg-card/95 px-4 py-2">
      <div className="mx-auto max-w-7xl">
        <Link
          href={returnPath}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid={`return-to-${hub}-hub`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t(hub === "financials" ? "superadminHub.returnFinancials" : "superadminHub.returnUsersLocations")}
        </Link>
      </div>
    </div>
  );
}
