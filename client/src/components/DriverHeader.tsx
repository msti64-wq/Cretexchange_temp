import { useAuth } from "@/hooks/useAuth";
import { Bell, Settings, LogOut } from "lucide-react";
import logoImage from "@assets/shutterstock_2364131707_1757091585450.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DriverHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="gradient-bg text-white p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img 
            src={logoImage}
            alt="WashOut Pro Logo"
            className="w-14 h-14 object-contain bg-white/20 rounded-full p-1"
          />
          <div>
            <h1 className="font-semibold text-lg" data-testid="text-driver-name">
              {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-white/80 text-sm">Concrete Driver</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="sm"
            className="relative p-2 text-white hover:bg-white/20"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5" />
            <Badge className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-xs font-medium p-0">
              3
            </Badge>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-white hover:bg-white/20"
            data-testid="button-settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            data-testid="button-logout"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <LogOut className="w-4 h-4 mr-1" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
