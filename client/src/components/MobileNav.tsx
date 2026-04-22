import { Home, Map, List, User, Building, Users, DollarSign, Settings, BarChart3, Wallet, CreditCard, Receipt, Bell, FileText, Flag, RefreshCw, Wrench, Clock, Trophy } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface MobileNavProps {
  role?: "driver" | "owner" | "admin" | "super_admin";
}

export function MobileNav({ role }: MobileNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Use the role prop if provided, otherwise get from auth context
  const userRole = role || (user as any)?.role;

  // Fetch unread notifications count for drivers and owners
  const { data: unreadData } = useQuery({
    queryKey: ['/api/notifications/unread'],
    enabled: userRole === 'owner' || userRole === 'driver',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = (unreadData as any)?.count || 0;

  const getNavItems = (): Array<{ path: string; icon: any; label: string }> => {
    switch (userRole) {
      case "driver":
        return [
          { path: "/", icon: Home, label: "Dashboard" },
          { path: "/locations", icon: Map, label: "Locations" },
          { path: "/activity", icon: List, label: "Activity" },
          { path: "/wallet", icon: Wallet, label: "Wallet" },
          { path: "/notifications", icon: Bell, label: "Messages" },
          { path: "/profile", icon: User, label: "Profile" },
        ];
      case "owner":
        return [
          { path: "/", icon: Home, label: "Dashboard" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/drivers", icon: Users, label: "Drivers" },
          { path: "/wallet", icon: Wallet, label: "Wallet" },
          { path: "/notifications", icon: Bell, label: "Alerts" },
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
    <nav className="mobile-nav fixed bottom-0 left-0 right-0 px-2 py-2 z-50 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={cn(
                "nav-item flex flex-col items-center py-2 relative px-3 min-w-[70px]",
                isActive ? "active" : "text-muted-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5 mb-1" />
                {(item.label === 'Alerts' || item.label === 'Messages') && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full h-4 min-w-4 flex items-center justify-center px-1" data-testid="badge-unread-count">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
