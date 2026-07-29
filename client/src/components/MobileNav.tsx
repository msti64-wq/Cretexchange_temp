import { Home, Map, List, User, Building, Users, DollarSign, Settings, BarChart3, Wallet, CreditCard, Receipt, Bell, FileText, Flag, RefreshCw, Wrench, Clock, Trophy, ClipboardList, Images } from "lucide-react";
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
          { path: "/rewards", icon: Trophy, label: "Rewards", testIdLabel: "rewards" },
          { path: "/wallet", icon: Wallet, label: t("nav.wallet"), testIdLabel: "wallet" },
          { path: "/notifications", icon: Bell, label: t("nav.messages"), testIdLabel: "messages" },
          { path: "/profile", icon: User, label: t("nav.profile"), testIdLabel: "profile" },
        ];
      case "owner":
        return [
          { path: "/", icon: Home, label: t("common.dashboard"), testIdLabel: "dashboard" },
          { path: "/locations", icon: Building, label: t("common.locations"), testIdLabel: "locations" },
          { path: "/drivers", icon: Users, label: t("common.drivers"), testIdLabel: "drivers" },
          { path: "/intelligence", icon: BarChart3, label: t("header.intelligence"), testIdLabel: "facility-intelligence" },
          { path: "/wallet", icon: Wallet, label: t("nav.wallet"), testIdLabel: "wallet" },
          { path: "/notifications", icon: Bell, label: t("nav.alerts"), testIdLabel: "alerts" },
          { path: "/profile", icon: User, label: t("nav.profile"), testIdLabel: "profile" },
        ];
      case "admin":
        // Regular admins only see Dashboard, Users, and Locations
        return [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/reports", icon: BarChart3, label: "Activity Reports", testIdLabel: "activity-reports" },
          { path: "/admin/financial-operations", icon: ClipboardList, label: "Financial Operations", testIdLabel: "financial-operations" },
          { path: "/admin/administration-repository", icon: FileText, label: "Operations Library", testIdLabel: "administration-repository" },
          { path: "/admin/photo-review", icon: Images, label: "Photo Review", testIdLabel: "photo-review" },
          { path: "/profile", icon: Settings, label: "Profile" },
        ];
      case "super_admin":
        // Super admins see everything
        return [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/reports", icon: BarChart3, label: "Activity Reports", testIdLabel: "activity-reports" },
          { path: "/admin/financial-operations", icon: ClipboardList, label: "Financial Operations", testIdLabel: "financial-operations" },
          { path: "/admin/administration-repository", icon: FileText, label: "Operations Library", testIdLabel: "administration-repository" },
          { path: "/admin/photo-review", icon: Images, label: "Photo Review", testIdLabel: "photo-review" },
          { path: "/lottery", icon: Trophy, label: "Rewards Program" },
          { path: "/reconciliation", icon: RefreshCw, label: "Reconcile" },
          { path: "/subscriptions", icon: Receipt, label: "Subscriptions" },
          { path: "/service-accounts", icon: CreditCard, label: "Service Accounts" },
          { path: "/feature-flags", icon: Flag, label: "Features" },
          { path: "/settings", icon: Wrench, label: "Settings" },
          { path: "/profile", icon: Settings, label: "Profile" },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();
  const fitViewportNav = userRole === "driver";

  return (
    <nav className={cn(
      "fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 text-slate-100 shadow-[0_-16px_30px_-24px_rgba(15,23,42,0.8)] backdrop-blur-xl",
      fitViewportNav ? "overflow-x-hidden" : "overflow-x-auto"
    )}>
      <div className={cn(
        "mx-auto grid max-w-6xl gap-1.5 sm:gap-2",
        fitViewportNav
          ? "w-full min-w-0 grid-flow-col auto-cols-fr"
          : "min-w-max grid-flow-col auto-cols-[minmax(72px,1fr)]"
      )}>
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-[10px] font-medium transition-colors sm:px-2 sm:text-[11px]",
                !fitViewportNav && "min-w-[72px]",
                isActive
                  ? "border-sky-500/30 bg-slate-900 text-slate-100 ring-1 ring-inset ring-sky-500/30"
                  : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/80 hover:text-slate-100"
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
              <span className="max-w-full truncate leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
