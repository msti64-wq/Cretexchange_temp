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
        <div className="flex items-center justify-between gap-3 border-b border-amber-300/20 bg-amber-500 px-4 py-2 text-sm text-white">
          <span className="font-medium">A new version of CreteXchange is ready.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={applyUpdate}
            className="ml-auto h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Update Now
          </Button>
        </div>
      )}

      <header className="sticky top-0 z-40 gradient-bg text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="brand-frame flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 sm:h-14 sm:w-14">
              <img
                src={logoImage}
                alt="CreteXchange"
                className="h-6 w-6 object-contain sm:h-9 sm:w-9"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 sm:block">
                  Driver portal
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 sm:hidden">
                  Driver
                </p>
                <span className="hidden dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline-flex">
                  Concrete operations
                </span>
              </div>
              <h1 className="mt-0.5 truncate text-[15px] font-semibold leading-tight sm:mt-1 sm:text-xl" data-testid="text-driver-name">
                {(user as any)?.firstName} {(user as any)?.lastName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/80 sm:gap-2">
                <span className="rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-sm">
                  Concrete Driver
                </span>
                {(user as any)?.roleData?.truckNumber && (
                  <span className="rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-sm">
                    Truck #{(user as any).roleData.truckNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:flex-wrap">
            {!isInstalled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInstallClick}
                className="h-9 border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white sm:h-10 sm:px-4"
                title="Add to Home Screen"
                data-testid="button-install-app"
              >
                <Smartphone className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline text-xs">Add to Phone</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="h-9 border-white/20 bg-black/20 px-3 text-white hover:bg-black/35 hover:text-white sm:h-10 sm:px-4"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
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
