import type { ComponentType, ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardMetricCardProps {
  title: string;
  value: ReactNode;
  helper?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  toneClassName?: string;
  trend?: ReactNode;
  className?: string;
  dataTestId?: string;
}

export function DashboardMetricCard({
  title,
  value,
  helper,
  icon: Icon,
  toneClassName,
  trend,
  className,
  dataTestId,
}: DashboardMetricCardProps) {
  return (
    <Card
      className={cn(
        "group overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border/90 hover:shadow-md",
        className,
      )}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
              {trend && (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {trend}
                </span>
              )}
            </div>
            <div className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{value}</div>
            {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
          </div>
          <div className={cn("rounded-xl border border-border/60 p-2.5 sm:p-3", toneClassName)}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
