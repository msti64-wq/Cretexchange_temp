import * as React from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { DSCard } from "./ds-card"
import { dsTokens, type DSTone } from "./tokens"

export interface DSKpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  detail?: React.ReactNode
  trend?: {
    label: React.ReactNode
    direction?: "up" | "down"
    tone?: DSTone
  }
  accentTone?: DSTone
}

const toneStyles: Record<DSTone, { border: string; text: string; bg: string }> =
  {
    appBackground: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    cardBackground: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    elevatedBackground: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.elevatedBackground,
    },
    border: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    textPrimary: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    textSecondary: {
      border: dsTokens.colors.border,
      text: dsTokens.colors.textSecondary,
      bg: dsTokens.colors.cardBackground,
    },
    accent: {
      border: dsTokens.colors.accent,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.elevatedBackground,
    },
    success: {
      border: dsTokens.colors.success,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    warning: {
      border: dsTokens.colors.warning,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    danger: {
      border: dsTokens.colors.danger,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
    info: {
      border: dsTokens.colors.info,
      text: dsTokens.colors.textPrimary,
      bg: dsTokens.colors.cardBackground,
    },
  }

function DSKpiCard({
  className,
  label,
  value,
  detail,
  trend,
  accentTone = "accent",
  style,
  ...props
}: DSKpiCardProps) {
  const palette = toneStyles[accentTone]

  return (
    <DSCard
      className={cn("min-w-0", className)}
      padding="lg"
      elevated
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        ...style,
      }}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: dsTokens.colors.textSecondary }}
          >
            {label}
          </div>
          <div
            className="mt-2 text-3xl font-semibold tracking-tight"
            style={{ color: palette.text }}
          >
            {value}
          </div>
          {detail ? (
            <div
              className="mt-2 text-sm"
              style={{ color: dsTokens.colors.textSecondary }}
            >
              {detail}
            </div>
          ) : null}
        </div>
        {trend ? (
          <div
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: dsTokens.colors.border,
              backgroundColor: dsTokens.colors.appBackground,
              color: toneStyles[trend.tone ?? accentTone].text,
            }}
          >
            {trend.direction === "down" ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
            <span>{trend.label}</span>
          </div>
        ) : null}
      </div>
    </DSCard>
  )
}

export { DSKpiCard }
