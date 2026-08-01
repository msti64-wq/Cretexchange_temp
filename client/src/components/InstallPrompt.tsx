import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Download, X, Share } from "lucide-react";
import { BrandCompactMark } from "@/components/BrandHeaderLogo";
import {
  hasHandledInstallPromptThisSession,
  markInstallPromptHandledThisSession,
  usePWAInstall,
} from "@/hooks/usePWAInstall";
import { useLanguage } from "@/lib/i18n";

interface InstallPromptProps {
  userType: "driver" | "owner";
  onInstall?: () => void;
  onDismiss?: () => void;
}

export function InstallPrompt({ userType, onInstall, onDismiss }: InstallPromptProps) {
  const { isIOS, install } = usePWAInstall();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(true);

  if (!visible || hasHandledInstallPromptThisSession()) return null;

  const handleInstall = async () => {
    const outcome = await install();
    markInstallPromptHandledThisSession();
    if (outcome === "accepted") {
      onInstall?.();
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    markInstallPromptHandledThisSession();
    setVisible(false);
    onDismiss?.();
  };

  const messaging =
    userType === "driver"
      ? {
          title: t("install.title"),
          description: t("install.driverDescription"),
          benefits: [
            t("install.driverBenefit1"),
            t("install.driverBenefit2"),
            t("install.driverBenefit3"),
            t("install.driverBenefit4"),
          ],
        }
      : {
          title: t("install.title"),
          description: t("install.ownerDescription"),
          benefits: [
            t("install.ownerBenefit1"),
            t("install.ownerBenefit2"),
            t("install.ownerBenefit3"),
            t("install.ownerBenefit4"),
          ],
        };

  return (
    <Card role="dialog" aria-label={t("install.title")} className="fixed top-4 left-4 right-4 z-50 shadow-lg border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-slate-900 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BrandCompactMark className="h-10" />
            <CardTitle className="text-base">{messaging.title}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-8 w-8 p-0"
            data-testid="button-dismiss-install"
            aria-label={t("install.dismissAria")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{messaging.description}</p>

        <div className="space-y-2">
          {messaging.benefits.map((benefit, i) => (
            <div key={i} className="flex items-center space-x-2 text-sm">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("install.iosTitle")}</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">1.</span>
                <span>{t("install.iosStep1Before")} <Share className="w-4 h-4 inline mx-0.5 text-blue-600" /> <strong>{t("install.share")}</strong> {t("install.iosStep1After")}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">2.</span>
                <span>{t("install.iosStep2")}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">3.</span>
                <span>{t("install.iosStep3")}</span>
              </div>
            </div>
            <Button onClick={handleDismiss} className="w-full" data-testid="button-ios-understand">
              {t("install.gotIt")}
            </Button>
          </div>
        ) : (
          <div className="flex space-x-2">
            <Button
              onClick={handleInstall}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              data-testid="button-install-app"
            >
              <Download className="w-4 h-4 mr-2" />
              {t("install.addHome")}
            </Button>
            <Button variant="outline" onClick={handleDismiss} data-testid="button-not-now">
              {t("install.notNow")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
