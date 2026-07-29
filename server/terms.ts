import type { RequestHandler } from "express";
import { storage } from "./storage";
import {
  TERMS_TYPES,
  type CurrentTermsDocument,
  type TermsRole,
  type TermsType,
  getRequiredTermsForRole,
  isTermsType,
} from "@shared/terms";
import { LEGAL_LANGUAGES, normalizeLegalLanguage, type LegalLanguage } from "@shared/legalDocuments";
import type { TermsAcceptance } from "@shared/schema";

type User = any;

export interface TermsDocumentState extends CurrentTermsDocument {
  accepted: boolean;
  acceptedAt: Date | string | null;
  acceptedVersion: string | null;
  acceptedContentHash: string | null;
  acceptedLanguage: string | null;
  acceptedStorageKey: string | null;
  legacyAcceptance: boolean;
}

export interface UserTermsState {
  requiresAcceptance: boolean;
  role: TermsRole | null;
  requiredDocuments: TermsDocumentState[];
  missingDocuments: TermsDocumentState[];
  ledgerAvailable: true;
  acceptedBundleLanguage: LegalLanguage | null;
}

export class TermsLedgerUnavailableError extends Error {
  readonly code = "TERMS_LEDGER_UNAVAILABLE";
  constructor() { super("Terms acceptance verification is temporarily unavailable."); }
}

function getRequestIp(req: any): string {
  const forwardedFor = req.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
  if (forwardedFor) {
    const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const first = value.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function getRequestUserAgent(req: any): string {
  return req.get?.("user-agent") || req.headers?.["user-agent"] || "unknown";
}

function findCurrentAcceptance(
  acceptances: TermsAcceptance[],
  doc: CurrentTermsDocument,
): TermsAcceptance | undefined {
  return acceptances.find((acceptance) => (
    acceptance.termsType === doc.termsType &&
    acceptance.language === doc.language &&
    acceptance.version === doc.version &&
    acceptance.contentHash === doc.contentHash
  ));
}

export interface CurrentTermsAcceptanceBundle {
  language: LegalLanguage;
  documents: Array<{ document: CurrentTermsDocument; acceptance: TermsAcceptance }>;
}

export function evaluateCurrentTermsAcceptanceBundle(
  role: TermsRole | null,
  acceptances: TermsAcceptance[],
): CurrentTermsAcceptanceBundle | null {
  for (const language of LEGAL_LANGUAGES) {
    const documents = getRequiredTermsForRole(role, language);
    if (documents.length === 0) continue;
    const matching = documents.map((document) => ({ document, acceptance: findCurrentAcceptance(acceptances, document) }));
    if (matching.every((entry) => Boolean(entry.acceptance))) {
      return {
        language,
        documents: matching as Array<{ document: CurrentTermsDocument; acceptance: TermsAcceptance }>,
      };
    }
  }
  return null;
}

export async function getTermsStateForUser(
  user: Pick<User, "id" | "role">,
  limitedTermsTypes?: TermsType[],
  languageInput: unknown = "en",
): Promise<UserTermsState> {
  const role = user.role as TermsRole | null;
  const language = normalizeLegalLanguage(languageInput);
  const required = getRequiredTermsForRole(role, language);
  const limited = limitedTermsTypes?.length
    ? required.filter((doc) => limitedTermsTypes.includes(doc.termsType))
    : required;

  if (limited.length === 0) {
    return {
      requiresAcceptance: false,
      role,
      requiredDocuments: [],
      missingDocuments: [],
      ledgerAvailable: true,
      acceptedBundleLanguage: null,
    };
  }

  let acceptances: TermsAcceptance[] = [];
  try {
    acceptances = await storage.getTermsAcceptancesForUser(user.id);
  } catch {
    console.warn("[TERMS_LEDGER_UNAVAILABLE]", { code: "TERMS_LEDGER_UNAVAILABLE" });
    throw new TermsLedgerUnavailableError();
  }
  const acceptedBundle = evaluateCurrentTermsAcceptanceBundle(role, acceptances);
  if (acceptedBundle) {
    const requiredDocuments = limited.map((displayDocument) => {
      const accepted = acceptedBundle.documents.find((entry) => entry.document.termsType === displayDocument.termsType)?.acceptance;
      if (!accepted) throw new TermsLedgerUnavailableError();
      return {
        ...displayDocument,
        accepted: true,
        acceptedAt: accepted.acceptedAt,
        acceptedVersion: accepted.version,
        acceptedContentHash: accepted.contentHash,
        acceptedLanguage: accepted.language,
        acceptedStorageKey: accepted.storageKey,
        legacyAcceptance: false,
      };
    });
    return {
      requiresAcceptance: false,
      role,
      requiredDocuments,
      missingDocuments: [],
      ledgerAvailable: true,
      acceptedBundleLanguage: acceptedBundle.language,
    };
  }

  const requiredDocuments: TermsDocumentState[] = [];

  for (const doc of limited) {
    const currentAcceptance = findCurrentAcceptance(acceptances, doc);

    if (currentAcceptance) {
      requiredDocuments.push({
        ...doc,
        accepted: true,
        acceptedAt: currentAcceptance.acceptedAt,
        acceptedVersion: currentAcceptance.version,
        acceptedContentHash: currentAcceptance.contentHash,
        acceptedLanguage: currentAcceptance.language,
        acceptedStorageKey: currentAcceptance.storageKey,
        legacyAcceptance: false,
      });
      continue;
    }

    requiredDocuments.push({
      ...doc,
      accepted: false,
      acceptedAt: null,
      acceptedVersion: null,
      acceptedContentHash: null,
      acceptedLanguage: null,
      acceptedStorageKey: null,
      legacyAcceptance: false,
    });
  }

  const missingDocuments = requiredDocuments.filter((doc) => doc.requiresReacceptance && !doc.accepted);

  return {
    requiresAcceptance: missingDocuments.length > 0,
    role,
    requiredDocuments,
    missingDocuments,
    ledgerAvailable: true,
    acceptedBundleLanguage: null,
  };
}

export async function recordCurrentTermsAcceptance(
  user: Pick<User, "id" | "role">,
  req: any,
  termsTypes?: TermsType[],
  languageInput: unknown = "en",
): Promise<UserTermsState> {
  // Legacy clients may submit document identifiers, but current acceptance is
  // always recorded as one complete role-and-language bundle.
  void termsTypes;
  const role = user.role as TermsRole | null;
  const language = normalizeLegalLanguage(languageInput);
  const required = getRequiredTermsForRole(role, language);
  const targetDocs = required;

  if (!role || targetDocs.length === 0) {
    return getTermsStateForUser(user, undefined, language);
  }

  const acceptedAt = new Date();
  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);
  console.log("[TERMS_ACCEPTANCE_WRITE_START]", {
    userId: user.id,
    role,
    targetDocs: targetDocs.map((doc) => doc.termsType),
    language,
  });

  try {
    await storage.createTermsAcceptanceBundleAtomically(
      targetDocs.map((doc) => ({
        termsType: doc.termsType,
        language: doc.language,
        storageKey: doc.storageKey,
        version: doc.version,
        title: doc.title,
        contentHash: doc.contentHash,
        effectiveAt: new Date(doc.effectiveAt),
        requiresReacceptance: doc.requiresReacceptance,
        isCurrent: true,
      })),
      targetDocs.map((doc) => ({
        userId: user.id,
        role,
        termsType: doc.termsType,
        language: doc.language,
        storageKey: doc.storageKey,
        version: doc.version,
        contentHash: doc.contentHash,
        acceptedAt,
        ipAddress,
        userAgent,
      })),
    );
  } catch {
    throw new TermsLedgerUnavailableError();
  }

  for (const doc of targetDocs) {
    console.log("[TERMS_ACCEPTANCE_WRITE_DOC]", {
      userId: user.id,
      role,
      termsType: doc.termsType,
      storageKey: doc.storageKey,
      version: doc.version,
    });
    console.log("[TERMS_ACCEPTANCE_WRITTEN_DOC]", {
      userId: user.id,
      role,
      termsType: doc.termsType,
    });
  }

  if (role === "driver" && targetDocs.some((doc) => doc.termsType === TERMS_TYPES.DRIVER_AGREEMENT)) {
    const driver = await storage.getDriver(user.id);
    if (driver) {
      try {
        await storage.updateDriver(driver.id, { hasAgreedToTerms: true, termsAgreedAt: acceptedAt });
      } catch {
        console.warn("[TERMS_LEGACY_PROJECTION_WARNING]", { role, userId: user.id, code: "LEGACY_PROJECTION_FAILED" });
      }
    }
  }

  if (role === "owner" && targetDocs.some((doc) => doc.termsType === TERMS_TYPES.OWNER_AGREEMENT)) {
    const owner = await storage.getOwner(user.id);
    if (owner) {
      try {
        await storage.updateOwner(owner.id, { hasAgreedToTerms: true, termsAgreedAt: acceptedAt });
      } catch {
        console.warn("[TERMS_LEGACY_PROJECTION_WARNING]", { role, userId: user.id, code: "LEGACY_PROJECTION_FAILED" });
      }
    }
  }

  return getTermsStateForUser(user, undefined, language);
}

export function requireCurrentTerms(termsTypes?: TermsType[]): RequestHandler {
  return async (req: any, res, next) => {
    try {
      const user = req.user as Pick<User, "id" | "role"> | undefined;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const state = await getTermsStateForUser(user, termsTypes);
      if (state.requiresAcceptance) {
        return res.status(409).json({
          message: "Updated terms acceptance required",
          termsState: state,
        });
      }

      req.termsState = state;
      next();
    } catch (error) {
      const ledgerUnavailable = error instanceof TermsLedgerUnavailableError;
      if (ledgerUnavailable) {
        console.warn("[TERMS_LEDGER_UNAVAILABLE]", { code: "TERMS_LEDGER_UNAVAILABLE" });
      } else {
        console.error("[TERMS_ACCEPTANCE_CHECK_FAILED]");
      }
      res.status(ledgerUnavailable ? 503 : 500).json({
        message: ledgerUnavailable ? "Terms verification is temporarily unavailable" : "Failed to verify terms acceptance",
        ...(ledgerUnavailable ? { code: "TERMS_LEDGER_UNAVAILABLE" } : {}),
      });
    }
  };
}

export function parseTermsTypes(input: unknown): TermsType[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  return input.filter((value): value is TermsType => (
    typeof value === "string" &&
    isTermsType(value)
  ));
}
