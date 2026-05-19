import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    <Card
      className={cn("stat-card rounded-2xl border-border/70 bg-card/95", className)}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
      <CardHeader className="pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            {icon}
            {trend && (
              <div className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {trend}
              </div>
            )}
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
          <div className="space-y-2">
            {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
