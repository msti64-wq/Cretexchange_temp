import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Smartphone, RefreshCw, Share } from "lucide-react";
import { BrandHeaderLogo } from "@/components/BrandHeaderLogo";
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

export function DriverHeader() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { isIOS, isInstalled, updateAvailable, install, applyUpdate } = usePWAInstall();
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
        <div className="flex w-full max-w-full min-w-0 flex-col gap-2 border-b border-amber-400/20 bg-slate-950 px-3 py-2 text-sm text-slate-100 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between sm:px-4">
          <span className="min-w-0 break-words font-medium text-amber-300">{t("header.updateReady")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={applyUpdate}
            className="h-auto min-h-8 w-full !whitespace-normal border-amber-400/30 bg-slate-900 text-xs text-amber-200 hover:bg-slate-800 hover:text-amber-100 min-[430px]:ml-auto min-[430px]:w-auto"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            {t("header.updateNow")}
          </Button>
        </div>
      )}

      <header className="sticky top-0 z-40 w-full max-w-full overflow-hidden border-b border-slate-800 bg-slate-950 text-slate-100 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)]">
        <div className="w-full px-3 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 px-0 py-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between min-[430px]:gap-3 sm:py-3">
            <div className="flex w-full min-w-0 items-center gap-2.5 min-[430px]:w-auto sm:gap-3">
              <BrandHeaderLogo className="max-[429px]:max-w-[76px]" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:block">
                    {t("header.driverPortal")}
                  </p>
                  <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:hidden">
                    {t("header.driverShort")}
                  </p>
                  <span className="hidden rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200 sm:inline-flex">
                    {t("header.concreteOperations")}
                  </span>
                </div>
                <h1 className="mt-0.5 max-w-full truncate text-[15px] font-semibold leading-tight sm:mt-1 sm:text-xl" data-testid="text-driver-name">
                  {(user as any)?.firstName} {(user as any)?.lastName}
                </h1>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-slate-300 sm:gap-2">
                  <span className="max-w-full truncate rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-100 sm:px-2.5 sm:text-sm">
                    {t("header.concreteDriver")}
                  </span>
                  {(user as any)?.roleData?.truckNumber && (
                    <span className="max-w-full truncate rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-100 sm:px-2.5 sm:text-sm">
                      {t("header.truckNumber", { number: (user as any).roleData.truckNumber })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 min-[430px]:w-auto min-[430px]:justify-end min-[430px]:border-t-0 min-[430px]:pt-0 sm:flex-nowrap">
              <LanguageToggle className="h-9 shrink-0" />

              {!isInstalled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInstallClick}
                  className="h-9 shrink-0 !whitespace-normal border-slate-700 bg-slate-900/80 px-3 text-slate-100 hover:bg-slate-800 hover:text-slate-100 sm:h-10 sm:px-4"
                  title={t("header.addToHomeScreen")}
                  data-testid="button-install-app"
                >
                  <Smartphone className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline text-xs">{t("header.addToPhone")}</span>
                </Button>
              )}

              <LogoutButton
                onClick={logout}
                dataTestId="button-logout"
                tone="glass"
                className="h-9 shrink-0 border border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800 hover:text-slate-100 sm:h-10"
              />
            </div>
          </div>
        </div>
      </header>

      {/* iOS install instructions dialog */}
      <Dialog open={showIOSDialog} onOpenChange={setShowIOSDialog}>
        <DialogContent className="mx-4 max-w-sm border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Smartphone className="w-5 h-5 text-sky-400" />
              {t("header.addToHomeScreen")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t("header.installDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-slate-950">1</span>
                <span className="text-slate-200">{t("header.installStep1")} <Share className="mx-0.5 inline h-4 w-4 text-sky-400" /></span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-slate-950">2</span>
                <span className="text-slate-200">{t("header.installStep2")}</span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-slate-950">3</span>
                <span className="text-slate-200">{t("header.installStep3")}</span>
              </div>
            </div>
            <p className="text-center text-xs text-slate-400">
              {t("header.installFootnote")}
            </p>
            <Button className="w-full bg-sky-600 text-white hover:bg-sky-500" onClick={() => setShowIOSDialog(false)}>
              {t("header.gotIt")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
