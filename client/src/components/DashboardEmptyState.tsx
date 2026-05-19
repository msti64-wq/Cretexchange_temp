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
      className={cn("overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm", className)}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[0.95fr_1.05fr] sm:p-6">
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm", toneClassName)}>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">CreteXchange workspace</p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
            <div className="max-w-xl text-sm text-muted-foreground">{description}</div>
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
