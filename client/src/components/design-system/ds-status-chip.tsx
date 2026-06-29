import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { dsTokens } from "./tokens"

const dsStatusChipVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "",
        success: "",
        warning: "",
        danger: "",
        info: "",
        accent: "",
      },
      size: {
        md: "",
        sm: "px-2 py-0.5 text-[11px]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
)

export interface DSStatusChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof dsStatusChipVariants> {
  dot?: boolean
}

const toneStyles: Record<NonNullable<DSStatusChipProps["tone"]>, {
  border: string
  background: string
  color: string
}> = {
  neutral: {
    border: dsTokens.colors.border,
    background: dsTokens.colors.cardBackground,
    color: dsTokens.colors.textSecondary,
  },
  success: {
    border: dsTokens.colors.success,
    background: "rgba(34, 197, 94, 0.12)",
    color: dsTokens.colors.success,
  },
  warning: {
    border: dsTokens.colors.warning,
    background: "rgba(234, 179, 8, 0.12)",
    color: dsTokens.colors.warning,
  },
  danger: {
    border: dsTokens.colors.danger,
    background: "rgba(239, 68, 68, 0.12)",
    color: dsTokens.colors.danger,
  },
  info: {
    border: dsTokens.colors.info,
    background: "rgba(59, 130, 246, 0.12)",
    color: dsTokens.colors.info,
  },
  accent: {
    border: dsTokens.colors.accent,
    background: "rgba(249, 115, 22, 0.14)",
    color: dsTokens.colors.accent,
  },
}

function DSStatusChip({
  className,
  tone = "neutral",
  size = "md",
  dot = false,
  style,
  children,
  ...props
}: DSStatusChipProps) {
  const selectedTone = tone ?? "neutral"
  const palette = toneStyles[selectedTone]

  return (
    <span
      className={cn(dsStatusChipVariants({ tone: selectedTone, size }), className)}
      style={{
        borderColor: palette.border,
        backgroundColor: palette.background,
        color: palette.color,
        ...style,
      }}
      {...props}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: palette.color }}
        />
      ) : null}
      {children}
    </span>
  )
}

export { DSStatusChip }
