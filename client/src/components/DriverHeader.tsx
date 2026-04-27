import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { LogOut, Smartphone, RefreshCw, Share } from "lucide-react";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DriverHeader() {
  const { user, logout } = useAuth();
  const { canInstall, isIOS, isInstalled, updateAvailable, install, applyUpdate } = usePWAInstall();
  const [showIOSDialog, setShowIOSDialog] = useState(false);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSDialog(true);
    } else {
      await install();
    }
  };

  return (
    <>
      {/* Update available banner */}
      {updateAvailable && (
        <div className="bg-orange-500 text-white text-sm px-4 py-2 flex items-center justify-between">
          <span className="font-medium">A new version of CreteXchange is ready!</span>
          <Button
            size="sm"
            variant="outline"
            onClick={applyUpdate}
            className="border-white text-white hover:bg-orange-600 hover:text-white ml-3 h-7 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Update Now
          </Button>
        </div>
      )}

      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3 flex-1">
            <img
              src={logoImage}
              alt="CreteXchange"
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

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add to Home Screen — always visible when not installed */}
            {!isInstalled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInstallClick}
                className="bg-orange-500 border-orange-400 text-white hover:bg-orange-600"
                title="Add to Home Screen"
                data-testid="button-install-app"
              >
                <Smartphone className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline text-xs">Add to Phone</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="bg-black border-black text-white hover:bg-gray-800"
            >
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* iOS install instructions dialog */}
      <Dialog open={showIOSDialog} onOpenChange={setShowIOSDialog}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              Add to Home Screen
            </DialogTitle>
            <DialogDescription>
              Install CreteXchange for one-tap access — no App Store needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Tap the <Share className="w-4 h-4 inline text-blue-600 mx-0.5" /> <strong>Share</strong> button at the bottom of Safari</span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Tap <strong>"Add"</strong> to confirm — the app icon will appear on your home screen</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Works in Safari · No App Store download required
            </p>
            <Button className="w-full" onClick={() => setShowIOSDialog(false)}>
              Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
