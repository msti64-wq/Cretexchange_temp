import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SuperAdminHubReturn } from "@/components/SuperAdminHubReturn";

type AdminDarkWorkspaceProps = {
  children: ReactNode;
  className?: string;
};

export function AdminDarkWorkspace({ children, className }: AdminDarkWorkspaceProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");

    return () => {
      root.classList.remove("dark");
    };
  }, []);

  return (
    <div className={cn("dark min-h-screen bg-background text-foreground", className)}>
      <SuperAdminHubReturn />
      {children}
    </div>
  );
}
