import { useAuth } from "@/hooks/useAuth";
import { Bell, Settings, LogOut } from "lucide-react";
import logoImage from "@assets/shutterstock_2364131707_1757091585450.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DriverHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="gradient-bg text-white p-4 shadow-lg">
      {/* Top Row - Main Info and Essential Actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3 flex-1">
          <img 
            src={logoImage}
            alt="WashOut Pro Logo"
            className="w-12 h-12 object-contain bg-white/20 rounded-full p-1 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg leading-tight" data-testid="text-driver-name">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </h1>
            {(user as any)?.roleData?.truckNumber && (
              <p className="text-white/90 text-sm">
                Truck #{(user as any).roleData.truckNumber}
              </p>
            )}
            <p className="text-white/80 text-xs">Concrete Driver</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          data-testid="button-logout"
          className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 flex-shrink-0"
        >
          <LogOut className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>

      {/* Secondary Row - Additional Actions */}
      <div className="flex items-center justify-center space-x-3">
        <Button
          variant="ghost"
          size="sm"
          className="relative px-3 py-2 text-white hover:bg-white/20 rounded-lg"
          data-testid="button-notifications"
        >
          <Bell className="w-4 h-4 mr-2" />
          <span className="text-sm">Notifications</span>
          <Badge className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-xs font-medium p-0">
            3
          </Badge>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-3 py-2 text-white hover:bg-white/20 rounded-lg"
          data-testid="button-settings"
        >
          <Settings className="w-4 h-4 mr-2" />
          <span className="text-sm">Settings</span>
        </Button>
      </div>
    </header>
  );
}
