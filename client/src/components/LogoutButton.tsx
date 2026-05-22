import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogoutButtonProps = {
  onClick: () => void;
  label?: string;
  className?: string;
  dataTestId?: string;
  tone?: "glass" | "neutral" | "danger";
  iconOnlyOnMobile?: boolean;
};

const toneClasses: Record<NonNullable<LogoutButtonProps["tone"]>, string> = {
  glass: "border-white/20 bg-black/20 text-white hover:bg-black/35 hover:text-white focus-visible:ring-white/60",
  neutral: "border-border/70 bg-background text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/60",
  danger: "border-red-200 bg-red-600 text-white hover:bg-red-700 hover:text-white focus-visible:ring-red-400/60",
};

export function LogoutButton({
  onClick,
  label = "Logout",
  className,
  dataTestId,
  tone = "glass",
  iconOnlyOnMobile = true,
}: LogoutButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      data-testid={dataTestId}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 sm:px-4",
        toneClasses[tone],
        className,
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      <span className={cn("whitespace-nowrap", iconOnlyOnMobile ? "hidden sm:inline" : "inline")}>
        {label}
      </span>
    </Button>
  );
}
