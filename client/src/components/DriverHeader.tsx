import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Smartphone, RefreshCw, Share } from "lucide-react";
import logoImage from "@assets/cretexchange-logo-white-transparent.png";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/LogoutButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DriverHeaderProps {
  position?: "sticky" | "fixed";
  onHeightChange?: (height: number) => void;
}

export function DriverHeader({ position = "sticky", onHeightChange }: DriverHeaderProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { isIOS, isInstalled, updateAvailable, install, applyUpdate } = usePWAInstall();
  const [showIOSDialog, setShowIOSDialog] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSDialog(true);
    } else {
      await install();
    }
  };

  useLayoutEffect(() => {
    if (!onHeightChange || !containerRef.current) return;

    const element = containerRef.current;
    const reportHeight = () => {
      onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    };

    reportHeight();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, position, updateAvailable, isInstalled, isIOS]);

  return (
    <>
      <div
        ref={containerRef}
        className={
          position === "fixed"
            ? "fixed inset-x-0 top-0 z-50 w-full max-w-full overflow-hidden bg-slate-950 text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)]"
            : "sticky top-0 z-40 w-full max-w-full overflow-hidden bg-slate-950 text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)]"
        }
      >
        <div className="w-full px-3 pt-[env(safe-area-inset-top)]">
          {/* Update available banner */}
          {updateAvailable && (
            <div className="flex w-full max-w-full min-w-0 flex-col gap-2 border-b border-amber-300/20 bg-amber-500 px-3 py-2 text-sm text-white min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:px-4">
              <span className="min-w-0 break-words font-medium">{t("header.updateReady")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={applyUpdate}
                className="h-auto min-h-8 w-full !whitespace-normal border-white/30 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white min-[430px]:ml-auto min-[430px]:w-auto"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t("header.updateNow")}
              </Button>
            </div>
          )}

          <header className="w-full max-w-full border-b border-white/10">
            <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 px-0 py-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between min-[430px]:gap-3 sm:py-3">
              <div className="flex w-full min-w-0 items-center gap-2.5 min-[430px]:w-auto sm:gap-3">
                <div className="brand-frame flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 sm:h-14 sm:w-14">
                  <img
                    src={logoImage}
                    alt="CreteXchange"
                    className="h-6 w-6 object-contain sm:h-9 sm:w-9"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 sm:block">
                      {t("header.driverPortal")}
                    </p>
                    <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:hidden">
                      {t("header.driverShort")}
                    </p>
                    <span className="hidden dashboard-chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline-flex">
                      {t("header.concreteOperations")}
                    </span>
                  </div>
                  <h1 className="mt-0.5 max-w-full truncate text-[15px] font-semibold leading-tight sm:mt-1 sm:text-xl" data-testid="text-driver-name">
                    {(user as any)?.firstName} {(user as any)?.lastName}
                  </h1>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-white/80 sm:gap-2">
                    <span className="max-w-full truncate rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-sm">
                      {t("header.concreteDriver")}
                    </span>
                    {(user as any)?.roleData?.truckNumber && (
                      <span className="max-w-full truncate rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-sm">
                        {t("header.truckNumber", { number: (user as any).roleData.truckNumber })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 min-[430px]:w-auto min-[430px]:justify-end min-[430px]:border-t-0 min-[430px]:pt-0 sm:flex-nowrap">
                <LanguageToggle className="h-9 shrink-0" />

                {!isInstalled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInstallClick}
                    className="h-9 shrink-0 !whitespace-normal border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white sm:h-10 sm:px-4"
                    title={t("header.addToHomeScreen")}
                    data-testid="button-install-app"
                  >
                    <Smartphone className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline text-xs">{t("header.addToPhone")}</span>
                  </Button>
                )}

                <LogoutButton onClick={logout} dataTestId="button-logout" tone="glass" className="h-9 shrink-0 sm:h-10" />
              </div>
            </div>
          </header>
        </div>
      </div>

      {/* iOS install instructions dialog */}
      <Dialog open={showIOSDialog} onOpenChange={setShowIOSDialog}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              {t("header.addToHomeScreen")}
            </DialogTitle>
            <DialogDescription>
              {t("header.installDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>{t("header.installStep1")} <Share className="w-4 h-4 inline text-blue-600 mx-0.5" /></span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>{t("header.installStep2")}</span>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>{t("header.installStep3")}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t("header.installFootnote")}
            </p>
            <Button className="w-full" onClick={() => setShowIOSDialog(false)}>
              {t("header.gotIt")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
