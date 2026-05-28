export const DRIVER_TERMS_VERSION = "2025-10-13";
export const OWNER_TERMS_VERSION = "2025-10-13";
export const PRIVACY_POLICY_VERSION = "2025-10-30";

export const TERMS_TYPES = {
  DRIVER: "driver_terms",
  OWNER: "owner_terms",
  PRIVACY: "privacy_policy",
} as const;

export type TermsType = typeof TERMS_TYPES[keyof typeof TERMS_TYPES];
export type TermsRole = "driver" | "owner" | "admin" | "super_admin";

export interface CurrentTermsDocument {
  termsType: TermsType;
  title: string;
  version: string;
  contentHash: string;
  effectiveAt: string;
  requiresReacceptance: boolean;
}

export const CURRENT_TERMS_DOCUMENTS = {
  [TERMS_TYPES.DRIVER]: {
    termsType: TERMS_TYPES.DRIVER,
    title: "Driver Terms",
    version: DRIVER_TERMS_VERSION,
    contentHash: "sha256:1c2a22f857d3b70e83229f458f98ed9ddbbf24700b9600de842e7b52d8e3e8df",
    effectiveAt: "2025-10-13T00:00:00.000Z",
    requiresReacceptance: true,
  },
  [TERMS_TYPES.OWNER]: {
    termsType: TERMS_TYPES.OWNER,
    title: "Owner Terms",
    version: OWNER_TERMS_VERSION,
    contentHash: "sha256:79d6df249e35d79a025b9909b8437414a5290cccf1c87065134f8d4240772f56",
    effectiveAt: "2025-10-13T00:00:00.000Z",
    requiresReacceptance: true,
  },
  [TERMS_TYPES.PRIVACY]: {
    termsType: TERMS_TYPES.PRIVACY,
    title: "Privacy Policy",
    version: PRIVACY_POLICY_VERSION,
    contentHash: "sha256:259e783c02272df481e95a3106f79cf7326259ab6c8a802ae0750777305be405",
    effectiveAt: "2025-10-30T00:00:00.000Z",
    requiresReacceptance: true,
  },
} satisfies Record<TermsType, CurrentTermsDocument>;

export const CURRENT_REQUIRED_TERMS = Object.values(CURRENT_TERMS_DOCUMENTS);

export function getRequiredTermsForRole(role?: TermsRole | null): CurrentTermsDocument[] {
  if (role === "driver") {
    return [
      CURRENT_TERMS_DOCUMENTS[TERMS_TYPES.DRIVER],
      CURRENT_TERMS_DOCUMENTS[TERMS_TYPES.PRIVACY],
    ];
  }

  if (role === "owner") {
    return [
      CURRENT_TERMS_DOCUMENTS[TERMS_TYPES.OWNER],
      CURRENT_TERMS_DOCUMENTS[TERMS_TYPES.PRIVACY],
    ];
  }

  return [];
}

export function isTermsType(value: string): value is TermsType {
  return Object.values(TERMS_TYPES).includes(value as TermsType);
}
