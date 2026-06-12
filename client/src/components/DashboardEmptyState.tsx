import type { ComponentType, ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardEmptyStateProps {
  title: string;
  description: ReactNode;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  badge?: ReactNode;
  className?: string;
  toneClassName?: string;
  dataTestId?: string;
}

export function DashboardEmptyState({
  title,
  description,
  icon: Icon,
  action,
  badge,
  className,
  toneClassName,
  dataTestId,
}: DashboardEmptyStateProps) {
  return (
    <Card
      className={cn("w-full max-w-full min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm [overflow-wrap:anywhere]", className)}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardContent className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-[0.95fr_1.05fr] sm:p-6">
        <div className="min-w-0 rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm", toneClassName)}>
              <Icon className="h-6 w-6" />
            </div>
            {badge}
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-3/4 rounded-full bg-muted-foreground/20" />
            <div className="h-2.5 w-1/2 rounded-full bg-muted-foreground/15" />
            <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.18em]">CreteXchange workspace</p>
            <h3 className="break-words text-lg font-semibold tracking-tight text-foreground">{title}</h3>
            <div className="max-w-xl break-words text-sm text-muted-foreground">{description}</div>
          </div>
          {action && <div className="flex w-full min-w-0 flex-wrap gap-2">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
