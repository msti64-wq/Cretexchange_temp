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
        "group w-full max-w-full min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border/90 hover:shadow-md [overflow-wrap:anywhere]",
        className,
      )}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardContent className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between sm:gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">{title}</p>
              {trend && (
                <span className="inline-flex min-w-0 max-w-full items-center whitespace-normal break-words rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {trend}
                </span>
              )}
            </div>
            <div className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{value}</div>
            {helper && <p className="break-words text-xs text-muted-foreground">{helper}</p>}
          </div>
          <div className={cn("shrink-0 self-start rounded-xl border border-border/60 p-2.5 min-[430px]:self-auto sm:p-3", toneClassName)}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
