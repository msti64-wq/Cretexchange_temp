import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
  value?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  dataTestId?: string;
}

export function StatCard({ title, subtitle, children, className, value, icon, trend, dataTestId }: StatCardProps) {
  return (
    <Card className={`stat-card rounded-2xl border-border/70 bg-card/95 ${className || ""}`} data-testid={dataTestId}>
      <div className="h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
      <CardHeader className="pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            {subtitle && <div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {icon}
            {trend && <div className="text-sm text-muted-foreground">{trend}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-5">
        {value !== undefined ? (
          <div className="space-y-1">
            <div className="text-2xl font-semibold text-foreground">{value}</div>
            {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
          </div>
        ) : (
          <>{children}</>
        )}
      </CardContent>
    </Card>
  );
}
