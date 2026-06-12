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
      className={cn("stat-card w-full max-w-full min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card/95 [overflow-wrap:anywhere]", className)}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
      <CardHeader className="min-w-0 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">{title}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            {icon}
            {trend && (
              <div className="inline-flex min-w-0 max-w-full items-center whitespace-normal break-words rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {trend}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 pb-4 pt-0 sm:px-6 sm:pb-5">
        {value !== undefined ? (
          <div className="min-w-0 space-y-1">
            <div className="break-words text-xl font-semibold text-foreground sm:text-2xl">{value}</div>
            {subtitle && <div className="break-words text-sm text-muted-foreground">{subtitle}</div>}
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            {subtitle && <div className="break-words text-sm text-muted-foreground">{subtitle}</div>}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
