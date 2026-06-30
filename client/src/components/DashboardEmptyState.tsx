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
  titleClassName?: string;
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
  titleClassName,
  dataTestId,
}: DashboardEmptyStateProps) {
  return (
    <Card
      className={cn("w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 text-slate-100 shadow-sm [overflow-wrap:anywhere]", className)}
      data-testid={dataTestId}
    >
      <div className="h-px bg-slate-800" />
      <CardContent className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-[0.95fr_1.05fr] sm:p-6">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950 shadow-sm", toneClassName)}>
              <Icon className="h-6 w-6" />
            </div>
            {badge}
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-3/4 rounded-full bg-slate-700/70" />
            <div className="h-2.5 w-1/2 rounded-full bg-slate-700/50" />
            <div className="h-2.5 w-2/3 rounded-full bg-slate-700/40" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-400 sm:tracking-[0.18em]">CreteXchange workspace</p>
            <h3 className={cn("break-words text-lg font-semibold tracking-tight text-sky-400", titleClassName)}>{title}</h3>
            <div className="max-w-xl break-words text-sm text-slate-300">{description}</div>
          </div>
          {action && <div className="flex w-full min-w-0 flex-wrap gap-2">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
