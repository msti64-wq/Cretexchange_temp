import * as React from "react"

import { cn } from "@/lib/utils"
import { dsTokens } from "./tokens"

export interface DSTableShellProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

function DSTableShell({
  className,
  title,
  description,
  actions,
  children,
  style,
  ...props
}: DSTableShellProps) {
  return (
    <div
      className={cn("overflow-hidden border", className)}
      style={{
        backgroundColor: dsTokens.colors.cardBackground,
        borderColor: dsTokens.colors.border,
        borderRadius: dsTokens.radius.lg,
        boxShadow: dsTokens.elevation.sm,
        ...style,
      }}
      {...props}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <div
                className="text-base font-semibold"
                style={{ color: dsTokens.colors.textPrimary }}
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <div
                className="mt-1 text-sm"
                style={{ color: dsTokens.colors.textSecondary }}
              >
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      <div className="overflow-auto">{children}</div>
    </div>
  )
}

export { DSTableShell }
