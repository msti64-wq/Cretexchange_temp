import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardSectionCardProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  className?: string;
  contentClassName?: string;
  dataTestId?: string;
  children: ReactNode;
}

export function DashboardSectionCard({
  title,
  description,
  icon,
  action,
  badge,
  className,
  contentClassName,
  dataTestId,
  children,
}: DashboardSectionCardProps) {
  return (
    <Card
      className={cn("overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm", className)}
      data-testid={dataTestId}
    >
      <div className="h-1 bg-gradient-to-r from-primary/70 via-secondary/60 to-accent/60" />
      <CardHeader className="border-b border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {(badge || action) && (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {badge}
              {action}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn("px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
