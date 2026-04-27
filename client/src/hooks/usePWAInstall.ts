import { useState, useEffect, useCallback, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  updateAvailable: boolean;
  install: () => Promise<"accepted" | "dismissed" | null>;
  applyUpdate: () => void;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener("appinstalled", () => {
    globalDeferredPrompt = null;
    notifyListeners();
  });
}

export function usePWAInstall(): PWAInstallState {
  const [, forceUpdate] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const isInstalled =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  const canInstall = !isInstalled && (!!globalDeferredPrompt || isIOS);

  useEffect(() => {
    const refresh = () => forceUpdate((n) => n + 1);
    listeners.add(refresh);

    if ("serviceWorker" in navigator) {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "UPDATE_AVAILABLE") {
          setUpdateAvailable(true);
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => {
        listeners.delete(refresh);
        navigator.serviceWorker.removeEventListener("message", handler);
      };
    }

    return () => listeners.delete(refresh);
  }, []);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | null> => {
    if (!globalDeferredPrompt) return null;
    await globalDeferredPrompt.prompt();
    const { outcome } = await globalDeferredPrompt.userChoice;
    if (outcome === "accepted") {
      globalDeferredPrompt = null;
      notifyListeners();
    }
    return outcome;
  }, []);

  const applyUpdate = useCallback(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        window.location.reload();
      });
    }
  }, []);

  return { canInstall, isInstalled, isIOS, updateAvailable, install, applyUpdate };
}
