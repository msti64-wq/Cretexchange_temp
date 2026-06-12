import {
  ALL_LEGAL_DOCUMENT_VERSIONS,
  LEGAL_DOCUMENT_IDS,
  type LegalDocumentId,
  type LegalLanguage,
  type LegalDocumentVersion,
  getRequiredLegalDocumentsForRole,
  isLegalDocumentId,
  resolveLegalDocument,
} from "./legalDocuments";

export const TERMS_TYPES = LEGAL_DOCUMENT_IDS;

export type TermsType = LegalDocumentId;
export type TermsRole = "driver" | "owner" | "admin" | "super_admin";

export interface CurrentTermsDocument {
  termsType: TermsType;
  language: LegalLanguage;
  storageKey: string;
  title: string;
  version: string;
  contentHash: string;
  effectiveAt: string;
  requiresReacceptance: boolean;
  fallbackToEnglish?: boolean;
  fallbackNotice?: string | null;
}

function toCurrentTermsDocument(
  doc: LegalDocumentVersion,
  fallbackToEnglish = false,
  fallbackNotice: string | null = null,
): CurrentTermsDocument {
  return {
    termsType: doc.id,
    language: doc.language,
    storageKey: doc.storageKey,
    title: doc.title,
    version: doc.version,
    contentHash: doc.contentHash,
    effectiveAt: doc.effectiveAt,
    requiresReacceptance: true,
    fallbackToEnglish,
    fallbackNotice,
  };
}

export const CURRENT_TERMS_DOCUMENTS = Object.values(TERMS_TYPES).reduce(
  (acc, termsType) => {
    acc[termsType] = toCurrentTermsDocument(resolveLegalDocument(termsType, "en").document);
    return acc;
  },
  {} as Record<TermsType, CurrentTermsDocument>,
);

export const CURRENT_REQUIRED_TERMS = ALL_LEGAL_DOCUMENT_VERSIONS.map((doc) => (
  toCurrentTermsDocument(doc)
));

export function getRequiredTermsForRole(
  role?: TermsRole | null,
  language: LegalLanguage = "en",
): CurrentTermsDocument[] {
  return getRequiredLegalDocumentsForRole(role, language).map((resolved) => (
    toCurrentTermsDocument(
      resolved.document,
      resolved.fallbackToEnglish,
      resolved.fallbackNotice,
    )
  ));
}

export function getCurrentTermsDocument(
  termsType: TermsType,
  language: LegalLanguage = "en",
): CurrentTermsDocument {
  const resolved = resolveLegalDocument(termsType, language);
  return toCurrentTermsDocument(
    resolved.document,
    resolved.fallbackToEnglish,
    resolved.fallbackNotice,
  );
}

export function isTermsType(value: string): value is TermsType {
  return isLegalDocumentId(value);
}
