import * as React from "react"

import { cn } from "@/lib/utils"
import { dsTokens } from "./tokens"

export interface DSSectionHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}

function DSSectionHeader({
  className,
  title,
  description,
  eyebrow,
  actions,
  ...props
}: DSSectionHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: dsTokens.colors.textSecondary }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h2
          className="text-xl font-semibold tracking-tight sm:text-2xl"
          style={{ color: dsTokens.colors.textPrimary }}
        >
          {title}
        </h2>
        {description ? (
          <p
            className="mt-1 max-w-3xl text-sm"
            style={{ color: dsTokens.colors.textSecondary }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}

export { DSSectionHeader }
