import { useAuth } from "@/hooks/useAuth";
import { LogOut, User, Plus, CreditCard } from "lucide-react";
import logoImage from "@assets/shutterstock_2364131707_1757091585450.png";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function OwnerHeader() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <header className="gradient-bg text-white p-4 shadow-lg">
      {/* Top Row - User Info and Logout */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1">
          <img 
            src={logoImage}
            alt="WashOut Pro Logo"
            className="w-12 h-12 object-contain bg-white/20 rounded-full p-1 flex-shrink-0"
          />
          <div className="flex-1">
            <h1 className="font-semibold text-lg leading-tight" data-testid="text-owner-name">
              Welcome, {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-white/80 text-sm">Location Management</p>
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
      
      {/* Action Buttons Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation('/profile')}
          data-testid="button-profile"
          className="bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
        >
          <User className="w-4 h-4 mr-2" />
          Profile
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLocation('/locations')}
          data-testid="button-add-location"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation('/payment-methods')}
          data-testid="button-payment-methods"
          className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Payment Methods
        </Button>
      </div>
    </header>
  );
}