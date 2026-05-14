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
    <Card className={`stat-card rounded-lg ${className || ""}`} data-testid={dataTestId}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-2">
            {icon}
            {trend && <div className="text-muted-foreground text-sm">{trend}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {value !== undefined ? (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-foreground">{value}</div>
            {subtitle && <div className="text-muted-foreground text-sm">{subtitle}</div>}
          </div>
        ) : (
          <>
            {subtitle && <div className="text-muted-foreground text-sm mb-2">{subtitle}</div>}
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}
