import { Home, Map, List, User, Building, Users, DollarSign, Settings, BarChart3, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface MobileNavProps {
  role?: "driver" | "owner" | "admin";
}

export function MobileNav({ role }: MobileNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Use the role prop if provided, otherwise get from auth context
  const userRole = role || (user as any)?.role;

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
          { path: "/payments", icon: DollarSign, label: "Payments" },
        ];
      case "admin":
        return [
          { path: "/", icon: BarChart3, label: "Dashboard" },
          { path: "/users", icon: Users, label: "Users" },
          { path: "/locations", icon: Building, label: "Locations" },
          { path: "/payments", icon: DollarSign, label: "Payments" },
        ];
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
                "nav-item flex flex-col items-center py-2",
                isActive ? "active" : "text-muted-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
