import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StatCard({ title, subtitle, children, className }: StatCardProps) {
  return (
    <Card className={`stat-card rounded-lg ${className || ""}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <div className="text-muted-foreground text-sm">{subtitle}</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
}
