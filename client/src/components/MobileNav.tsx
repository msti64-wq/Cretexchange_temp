import { Home, Map, List, User, Building, Users, DollarSign, Settings, BarChart3, Wallet, CreditCard, Receipt, Bell, FileText, Flag, RefreshCw, Wrench, Clock, Trophy } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";

interface MobileNavProps {
  role?: "driver" | "owner" | "admin" | "super_admin";
}

export function MobileNav({ role }: MobileNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  
  // Use the role prop if provided, otherwise get from auth context
  const userRole = role || (user as any)?.role;

  // Fetch unread notifications count for drivers and owners
  const { data: unreadData } = useQuery({
    queryKey: ['/api/notifications/unread'],
    enabled: userRole === 'owner' || userRole === 'driver',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = (unreadData as any)?.count || 0;

  const getNavItems = (): Array<{ path: string; icon: any; label: string; testIdLabel?: string }> => {
    switch (userRole) {
      case "driver":
        return [
          { path: "/", icon: Home, label: t("common.dashboard"), testIdLabel: "dashboard" },
          { path: "/locations", icon: Map, label: t("common.locations"), testIdLabel: "locations" },
          { path: "/activity", icon: List, label: t("nav.activity"), testIdLabel: "activity" },
          { path: "/wallet", icon: Wallet, label: t("nav.wallet"), testIdLabel: "wallet" },
          { path: "/notifications", icon: Bell, label: t("nav.messages"), testIdLabel: "messages" },
          { path: "/profile", icon: User, label: t("nav.profile"), testIdLabel: "profile" },
        ];
      case "owner":
        return [
          { path: "/", icon: Home, label: t("common.dashboard"), testIdLabel: "dashboard" },
          { path: "/locations", icon: Building, label: t("common.locations"), testIdLabel: "locations" },
          { path: "/drivers", icon: Users, label: t("common.drivers"), testIdLabel: "drivers" },
          { path: "/wallet", icon: Wallet, label: t("nav.wallet"), testIdLabel: "wallet" },
          { path: "/notifications", icon: Bell, label: t("nav.alerts"), testIdLabel: "alerts" },
        ];
      case "admin":
        // Regular admins only see Dashboard, Users, and Locations
        return [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/profile", icon: Settings, label: "Profile" },
        ];
      case "super_admin":
        // Super admins see everything
        return [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/payments", icon: DollarSign, label: "Payments" },
          { path: "/lottery-dashboard", icon: Trophy, label: "Lottery" },
          { path: "/reconciliation", icon: RefreshCw, label: "Reconcile" },
          { path: "/subscriptions", icon: Receipt, label: "Subscriptions" },
          { path: "/fees", icon: FileText, label: "Fees" },
          { path: "/service-accounts", icon: CreditCard, label: "Service Accounts" },
          { path: "/billing-settings", icon: Clock, label: "Billing" },
          { path: "/feature-flags", icon: Flag, label: "Features" },
          { path: "/settings", icon: Wrench, label: "Settings" },
          { path: "/profile", icon: Settings, label: "Profile" },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="mobile-nav fixed bottom-0 left-0 right-0 z-50 overflow-x-auto px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
      <div className="mx-auto grid min-w-max max-w-6xl grid-flow-col auto-cols-[minmax(72px,1fr)] gap-2">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              className={cn(
                "nav-item flex min-w-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[11px] font-medium",
                isActive
                  ? "active"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
              data-testid={`nav-${item.testIdLabel || item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                {(item.testIdLabel === "alerts" || item.testIdLabel === "messages") && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white" data-testid="badge-unread-count">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
