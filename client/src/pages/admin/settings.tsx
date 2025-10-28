import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Settings Page - Redirects to Feature Flags
 * 
 * All system settings have been consolidated into the Feature Flags system
 * for easier management and visibility.
 */
export default function AdminSettings() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to feature flags page
    setLocation("/feature-flags");
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
