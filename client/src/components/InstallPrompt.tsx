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

interface InstallPromptProps {
  userType: "driver" | "owner";
  onInstall?: () => void;
  onDismiss?: () => void;
}

export function InstallPrompt({ userType, onInstall, onDismiss }: InstallPromptProps) {
  const { isIOS, install } = usePWAInstall();
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
          title: "Add CreteXchange to Your Phone",
          description:
            "Get one-tap access while driving — find recovery facilities instantly.",
          benefits: [
            "One tap from your home screen",
            "Works even with spotty cell service",
            "Faster loading, no typing URLs",
            "Full-screen experience",
          ],
        }
      : {
          title: "Add CreteXchange to Your Phone",
          description: "Manage your recovery facilities with instant access from your phone.",
          benefits: [
            "Quick access to manage your locations",
            "Monitor driver activity on-the-go",
            "Instant notifications for new recovery activities",
            "Professional app experience",
          ],
        };

  return (
    <Card className="fixed top-4 left-4 right-4 z-50 shadow-lg border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-slate-900 dark:border-blue-800">
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
            <p className="text-sm font-medium">To install on iPhone/iPad:</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">1.</span>
                <span>Tap the <Share className="w-4 h-4 inline mx-0.5 text-blue-600" /> <strong>Share</strong> button in Safari</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">2.</span>
                <span>Tap <strong>"Add to Home Screen"</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600">3.</span>
                <span>Tap <strong>"Add"</strong> to confirm</span>
              </div>
            </div>
            <Button onClick={handleDismiss} className="w-full" data-testid="button-ios-understand">
              Got it!
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
              Add to Home Screen
            </Button>
            <Button variant="outline" onClick={handleDismiss} data-testid="button-not-now">
              Not Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
