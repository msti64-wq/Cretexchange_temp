import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { MobileNav } from "@/components/MobileNav";

interface LayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export function Layout({ children, showNav = true }: LayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <main className={showNav ? "pb-20" : ""}>{children}</main>
      {showNav && user?.role && (
        <MobileNav role={user.role as "driver" | "owner" | "admin"} />
      )}
    </div>
  );
}
