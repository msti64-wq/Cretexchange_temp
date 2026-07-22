export type FacilityMaterialInput = {
  materialSlug?: string | null;
  customLabel?: string | null;
  materialCustomLabel?: string | null;
};

export function normalizeFacilityMaterialLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidCustomFacilityMaterialName(value: unknown): value is string {
  return typeof value === "string" && normalizeFacilityMaterialLabel(value).length > 0 && normalizeFacilityMaterialLabel(value).length <= 120;
}

export function getFacilityMaterialKind(input: FacilityMaterialInput): "system" | "custom" | "invalid" {
  const hasSystemMaterial = Boolean(input.materialSlug?.trim());
  const customLabel = input.customLabel ?? input.materialCustomLabel;
  const hasCustomMaterial = isValidCustomFacilityMaterialName(customLabel);

  if (hasSystemMaterial === hasCustomMaterial) return "invalid";
  return hasSystemMaterial ? "system" : "custom";
}

export function getFacilityMaterialDisplayName(
  input: FacilityMaterialInput & { systemDisplayName?: string | null },
): string {
  return input.systemDisplayName?.trim()
    || normalizeFacilityMaterialLabel(input.customLabel ?? input.materialCustomLabel ?? "")
    || "Unnamed material";
}
