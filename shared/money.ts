export type MoneySourceUnit = "auto" | "cents" | "dollars";

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number"
    ? value
    : Number(String(value).trim().replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeMoneyToCents(value: unknown, sourceUnit: MoneySourceUnit = "auto"): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return 0;
  }

  const cents = () => Math.max(0, Math.round(parsed));
  const dollars = () => Math.max(0, Math.round(parsed * 100));

  switch (sourceUnit) {
    case "cents":
      return cents();
    case "dollars":
      return dollars();
    case "auto": {
      const raw = typeof value === "string" ? value.trim() : null;
      if ((raw && raw.includes(".")) || (!Number.isInteger(parsed) && Math.abs(parsed) < 1000000)) {
        return dollars();
      }
      return cents();
    }
    default:
      return cents();
  }
}
