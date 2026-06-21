export const dsTokens = {
  colors: {
    appBackground: "#121417",
    cardBackground: "#1B1F24",
    elevatedBackground: "#242A31",
    border: "#2A3138",
    textPrimary: "#F5F7FA",
    textSecondary: "#AAB4C0",
    accent: "#F97316",
    success: "#22C55E",
    warning: "#EAB308",
    danger: "#EF4444",
    info: "#3B82F6",
  },
  typography: {
    fontFamily: {
      sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"JetBrains Mono", "SF Mono", Monaco, "Cascadia Code", monospace',
    },
    fontSize: {
      xs: "12px",
      sm: "14px",
      base: "16px",
      lg: "18px",
      xl: "20px",
      "2xl": "24px",
    },
    fontWeight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.65,
    },
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "40px",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "18px",
    pill: "9999px",
  },
  elevation: {
    none: "none",
    sm: "0px 1px 2px rgba(0, 0, 0, 0.16), 0px 1px 1px rgba(0, 0, 0, 0.08)",
    md: "0px 4px 10px rgba(0, 0, 0, 0.18), 0px 2px 4px rgba(0, 0, 0, 0.12)",
    lg: "0px 10px 24px rgba(0, 0, 0, 0.22), 0px 6px 12px rgba(0, 0, 0, 0.14)",
    xl: "0px 18px 42px rgba(0, 0, 0, 0.28), 0px 10px 20px rgba(0, 0, 0, 0.18)",
  },
} as const

export type DSTone = keyof typeof dsTokens.colors
