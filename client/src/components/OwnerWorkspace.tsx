import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type OwnerWorkspaceProps = {
  children: ReactNode;
  className?: string;
};

export function OwnerWorkspace({ children, className }: OwnerWorkspaceProps) {
  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  return (
    <div className={cn("dark min-h-screen bg-background text-foreground", className)}>
      {children}
    </div>
  );
}
