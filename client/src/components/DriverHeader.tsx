import { useAuth } from "@/hooks/useAuth";
import { Bell, Settings, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DriverHeader() {
  const { user } = useAuth();

  return (
    <header className="gradient-bg text-white p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
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
        </div>
      </div>
    </header>
  );
}
