import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import logoImage from "@assets/cretexchange-logo-2025.png";
import { Button } from "@/components/ui/button";

export function DriverHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="gradient-bg text-white p-4 shadow-lg">
      {/* Top Row - Main Info and Essential Actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3 flex-1">
          <img 
            src={logoImage}
            alt="CreteXchange - Streamlining Concrete Connections"
            className="w-16 h-16 object-contain flex-shrink-0"
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
          className="bg-black border-black text-white hover:bg-gray-800 flex-shrink-0"
        >
          <LogOut className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>

    </header>
  );
}
