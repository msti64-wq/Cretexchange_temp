import { Home, Map, List, User, Building, Users, DollarSign, Settings, BarChart3, Wallet, CreditCard, Receipt, Bell } from "lucide-react";
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

  // Fetch unread notifications count for owners
  const { data: unreadData } = useQuery({
    queryKey: ['/api/notifications/unread'],
    enabled: userRole === 'owner',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const unreadCount = (unreadData as any)?.count || 0;

  const getNavItems = () => {
    switch (userRole) {
      case "driver":
        return [
          { path: "/", icon: Home, label: "Dashboard" },
          { path: "/locations", icon: Map, label: "Locations" },
          { path: "/activity", icon: List, label: "Activity" },
          { path: "/wallet", icon: Wallet, label: "Wallet" },
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
      case "super_admin":
        const adminNavItems = [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/payments", icon: DollarSign, label: "Payments" },
          { path: "/subscriptions", icon: Receipt, label: "Subscriptions" },
        ];
        
        // Add service accounts for super_admin
        if ((user as any)?.role === 'super_admin') {
          adminNavItems.push({ path: "/service-accounts", icon: CreditCard, label: "Service Accounts" });
        }
        
        return adminNavItems;
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="mobile-nav fixed bottom-0 left-0 right-0 px-4 py-2 z-50">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={cn(
                "nav-item flex flex-col items-center py-2 relative",
                isActive ? "active" : "text-muted-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5 mb-1" />
                {item.label === 'Alerts' && unreadCount > 0 && (
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
