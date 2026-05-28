export type ReportDateRangeKey =
  | "today"
  | "yesterday"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom"
  | "all";

export interface ResolvedReportDateRange {
  key: ReportDateRangeKey;
  label: string;
  startDate?: Date;
  endDate?: Date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDateOnlyLocal(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function resolveReportDateRange(
  dateRange: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  now = new Date(),
): ResolvedReportDateRange {
  const key = (dateRange || "daily") as ReportDateRangeKey;

  switch (key) {
    case "today":
    case "daily":
      return {
        key,
        label: "Today",
        startDate: startOfDay(now),
        endDate: endOfDay(now),
      };
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        key,
        label: "Yesterday",
        startDate: startOfDay(yesterday),
        endDate: endOfDay(yesterday),
      };
    }
    case "weekly": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return {
        key,
        label: "Last 7 Days",
        startDate: startOfDay(start),
        endDate: endOfDay(now),
      };
    }
    case "monthly": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return {
        key,
        label: "Last 30 Days",
        startDate: startOfDay(start),
        endDate: endOfDay(now),
      };
    }
    case "custom":
      return {
        key,
        label: "Custom Range",
        startDate: startDate ? startOfDay(parseDateOnlyLocal(startDate)) : undefined,
        endDate: endDate ? endOfDay(parseDateOnlyLocal(endDate)) : undefined,
      };
    case "all":
      return {
        key,
        label: "All Time",
      };
    default:
      return {
        key: "daily",
        label: "Today",
        startDate: startOfDay(now),
        endDate: endOfDay(now),
      };
  }
}
