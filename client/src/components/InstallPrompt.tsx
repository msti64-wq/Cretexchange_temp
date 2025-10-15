import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface InstallPromptProps {
  userType: 'driver' | 'owner';
  onInstall?: () => void;
  onDismiss?: () => void;
}

export function InstallPrompt({ userType, onInstall, onDismiss }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    console.log('🔧 InstallPrompt component loaded');
    
    // Check if user has dismissed the install prompt before
    const hasUserDismissed = localStorage.getItem('pwaInstallDismissed') === 'true';
    console.log('👤 User previously dismissed install prompt:', hasUserDismissed);
    
    if (hasUserDismissed) {
      console.log('⏭️ Skipping install prompt - user previously dismissed');
      return;
    }
    
    // Check if running on iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);
    console.log('📱 iOS device detected:', isIOSDevice);

    // Handle the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      console.log('⚡ beforeinstallprompt event fired!');
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event so it can be triggered later
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = (window.navigator as any).standalone === true;
    console.log('🏠 App already installed:', isStandalone || isInWebAppiOS);
    
    if (!isStandalone && !isInWebAppiOS) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      console.log('👂 Listening for beforeinstallprompt event');
      
      // For iOS or if no beforeinstallprompt after 2 seconds, show manual instructions
      const fallbackTimer = setTimeout(() => {
        console.log('⏰ Fallback timer: showing manual install prompt');
        setShowPrompt(true);
      }, 2000);
      
      // Clear fallback if beforeinstallprompt fires
      const originalHandler = handleBeforeInstallPrompt;
      const wrappedHandler = (e: BeforeInstallPromptEvent) => {
        clearTimeout(fallbackTimer);
        originalHandler(e);
      };
      
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.addEventListener('beforeinstallprompt', wrappedHandler as EventListener);
      
      return () => {
        clearTimeout(fallbackTimer);
        window.removeEventListener('beforeinstallprompt', wrappedHandler as EventListener);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        onInstall?.();
      }
      
      // Clear the deferredPrompt so it can only be used once
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    console.log('🚫 User dismissed install prompt - saving preference');
    localStorage.setItem('pwaInstallDismissed', 'true');
    setShowPrompt(false);
    onDismiss?.();
  };

  const getMessaging = () => {
    if (userType === 'driver') {
      return {
        title: "🚛 Add CreteXchange to Home Screen",
        description: "Get instant access while driving! Tap once to find nearby washout locations.",
        benefits: [
          "One-tap access from your home screen",
          "Works offline when cell service is spotty", 
          "Faster loading - no typing URLs",
          "Full-screen experience"
        ]
      };
    } else {
      return {
        title: "🏢 Add CreteXchange to Home Screen", 
        description: "Manage your washout locations with instant access from your phone.",
        benefits: [
          "Quick access to manage your locations",
          "Monitor driver activity on-the-go",
          "Instant notifications for new washouts",
          "Professional app experience"
        ]
      };
    }
  };

  console.log('🎨 InstallPrompt render check:', { showPrompt, userType, deferredPrompt: !!deferredPrompt });

  if (!showPrompt) {
    console.log('❌ InstallPrompt not showing because showPrompt is false');
    return null;
  }

  console.log('✨ InstallPrompt is rendering!');

  const messaging = getMessaging();

  return (
    <Card className="fixed top-4 left-4 right-4 z-50 shadow-lg border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950 dark:to-slate-900 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">{messaging.title}</CardTitle>
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
        <p className="text-sm text-muted-foreground">
          {messaging.description}
        </p>
        
        <div className="space-y-2">
          {messaging.benefits.map((benefit, index) => (
            <div key={index} className="flex items-center space-x-2 text-sm">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">To install on iPhone/iPad:</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>1. Tap the Share button <span className="inline-block w-4 h-4 bg-blue-100 rounded text-center text-xs">↗</span> in Safari</div>
              <div>2. Scroll down and tap "Add to Home Screen"</div>
              <div>3. Tap "Add" to confirm</div>
            </div>
            <Button
              onClick={handleDismiss}
              className="w-full"
              data-testid="button-ios-understand"
            >
              Got it!
            </Button>
          </div>
        ) : (
          <div className="flex space-x-2">
            <Button
              onClick={handleInstallClick}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={!deferredPrompt}
              data-testid="button-install-app"
            >
              <Download className="w-4 h-4 mr-2" />
              Add to Home Screen
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              data-testid="button-not-now"
            >
              Not Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}