import * as React from "react"

import { cn } from "@/lib/utils"
import { dsTokens } from "./tokens"

export interface DSCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg"
  elevated?: boolean
}

const DSCard = React.forwardRef<HTMLDivElement, DSCardProps>(
  ({ className, padding = "md", elevated = false, style, ...props }, ref) => {
    const paddingClassName = {
      none: "p-0",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    }[padding]

    return (
      <div
        ref={ref}
        className={cn("border", paddingClassName, className)}
        style={{
          backgroundColor: elevated
            ? dsTokens.colors.elevatedBackground
            : dsTokens.colors.cardBackground,
          borderColor: dsTokens.colors.border,
          borderRadius: dsTokens.radius.lg,
          boxShadow: elevated ? dsTokens.elevation.md : dsTokens.elevation.sm,
          color: dsTokens.colors.textPrimary,
          ...style,
        }}
        {...props}
      />
    )
  },
)
DSCard.displayName = "DSCard"

export { DSCard }
