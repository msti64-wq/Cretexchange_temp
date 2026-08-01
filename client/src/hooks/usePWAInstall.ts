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

const INSTALL_PROMPT_SESSION_KEY = "pwaInstallPromptHandled";
const CLIENT_APP_COMMIT_SHA = import.meta.env.VITE_APP_COMMIT_SHA || "development";

export function isNewDeploymentAvailable(clientCommitSha: string, activeCommitSha: string | null | undefined) {
  if (!activeCommitSha || clientCommitSha === "development") return false;
  return clientCommitSha !== activeCommitSha;
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
    markInstallPromptHandledThisSession();
    notifyListeners();
  });
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function hasHandledInstallPromptThisSession() {
  if (!canUseSessionStorage()) return false;
  return window.sessionStorage.getItem(INSTALL_PROMPT_SESSION_KEY) === "true";
}

export function markInstallPromptHandledThisSession() {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(INSTALL_PROMPT_SESSION_KEY, "true");
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

  const canInstall = !isInstalled && !hasHandledInstallPromptThisSession() && (!!globalDeferredPrompt || isIOS);

  useEffect(() => {
    const refresh = () => forceUpdate((n) => n + 1);
    listeners.add(refresh);

    if ("serviceWorker" in navigator) {
      let cancelled = false;
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "UPDATE_AVAILABLE") {
          setUpdateAvailable(true);
        }
      };
      const checkForDeploymentUpdate = async () => {
        try {
          const [registration, response] = await Promise.all([
            navigator.serviceWorker.getRegistration(),
            fetch("/api/version", { cache: "no-store", credentials: "same-origin" }),
          ]);
          await registration?.update();
          if (!response.ok) return;
          const version = await response.json() as { commitSha?: string | null };
          if (!cancelled && isNewDeploymentAvailable(CLIENT_APP_COMMIT_SHA, version.commitSha)) {
            setUpdateAvailable(true);
          }
        } catch {
          // Update checks are best-effort and must never block the Driver workflow.
        }
      };
      const handleFocus = () => void checkForDeploymentUpdate();
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") void checkForDeploymentUpdate();
      };

      navigator.serviceWorker.addEventListener("message", handler);
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      void checkForDeploymentUpdate();

      return () => {
        cancelled = true;
        listeners.delete(refresh);
        navigator.serviceWorker.removeEventListener("message", handler);
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }

    return () => listeners.delete(refresh);
  }, []);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | null> => {
    if (hasHandledInstallPromptThisSession() || !globalDeferredPrompt) return null;
    await globalDeferredPrompt.prompt();
    const { outcome } = await globalDeferredPrompt.userChoice;
    markInstallPromptHandledThisSession();
    globalDeferredPrompt = null;
    notifyListeners();
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
