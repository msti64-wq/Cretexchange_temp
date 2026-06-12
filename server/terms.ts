import type { RequestHandler } from "express";
import { storage } from "./storage";
import {
  CURRENT_REQUIRED_TERMS,
  TERMS_TYPES,
  type CurrentTermsDocument,
  type TermsRole,
  type TermsType,
  getRequiredTermsForRole,
  isTermsType,
} from "@shared/terms";
import { normalizeLegalLanguage, type LegalLanguage } from "@shared/legalDocuments";
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

async function getLegacyAcceptance(
  user: Pick<User, "id" | "role">,
  termsType: TermsType,
): Promise<{ acceptedAt: Date | string | null } | null> {
  if (user.role === "driver" && (
    termsType === TERMS_TYPES.TERMS ||
    termsType === TERMS_TYPES.PRIVACY ||
    termsType === TERMS_TYPES.DRIVER_AGREEMENT
  )) {
    const driver = await storage.getDriver(user.id);
    if (driver?.hasAgreedToTerms) {
      return { acceptedAt: driver.termsAgreedAt || null };
    }
  }

  if (user.role === "owner" && (
    termsType === TERMS_TYPES.TERMS ||
    termsType === TERMS_TYPES.PRIVACY ||
    termsType === TERMS_TYPES.OWNER_AGREEMENT
  )) {
    const owner = await storage.getOwner(user.id);
    if (owner?.hasAgreedToTerms) {
      return { acceptedAt: owner.termsAgreedAt || null };
    }
  }

  return null;
}

export async function ensureCurrentTermsVersions(): Promise<void> {
  await Promise.all(
    CURRENT_REQUIRED_TERMS.map((doc) => storage.upsertTermsVersion({
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
  );
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
    };
  }

  let acceptances: TermsAcceptance[] = [];
  let ledgerAvailable = true;
  try {
    acceptances = await storage.getTermsAcceptancesForUser(user.id);
  } catch (error) {
    ledgerAvailable = false;
    console.error("Terms acceptance ledger unavailable; falling back to legacy flags:", error);
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

    const legacyAcceptance = ledgerAvailable ? null : await getLegacyAcceptance(user, doc.termsType);
    requiredDocuments.push({
      ...doc,
      accepted: Boolean(legacyAcceptance),
      acceptedAt: legacyAcceptance?.acceptedAt || null,
      acceptedVersion: legacyAcceptance ? doc.version : null,
      acceptedContentHash: legacyAcceptance ? doc.contentHash : null,
      acceptedLanguage: legacyAcceptance ? doc.language : null,
      acceptedStorageKey: legacyAcceptance ? doc.storageKey : null,
      legacyAcceptance: Boolean(legacyAcceptance),
    });
  }

  const missingDocuments = requiredDocuments.filter((doc) => doc.requiresReacceptance && !doc.accepted);

  return {
    requiresAcceptance: missingDocuments.length > 0,
    role,
    requiredDocuments,
    missingDocuments,
  };
}

export async function recordCurrentTermsAcceptance(
  user: Pick<User, "id" | "role">,
  req: any,
  termsTypes?: TermsType[],
  languageInput: unknown = "en",
): Promise<UserTermsState> {
  const role = user.role as TermsRole | null;
  const language = normalizeLegalLanguage(languageInput);
  const required = getRequiredTermsForRole(role, language);
  const targetDocs = termsTypes?.length
    ? required.filter((doc) => termsTypes.includes(doc.termsType))
    : required;

  if (!role || targetDocs.length === 0) {
    return getTermsStateForUser(user, undefined, language);
  }

  const acceptedAt = new Date();
  const ipAddress = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);

  for (const doc of targetDocs) {
    await storage.createTermsAcceptance({
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
    });
  }

  if (role === "driver" && targetDocs.some((doc) => doc.termsType === TERMS_TYPES.DRIVER_AGREEMENT)) {
    const driver = await storage.getDriver(user.id);
    if (driver) {
      await storage.updateDriver(driver.id, {
        hasAgreedToTerms: true,
        termsAgreedAt: acceptedAt,
      });
    }
  }

  if (role === "owner" && targetDocs.some((doc) => doc.termsType === TERMS_TYPES.OWNER_AGREEMENT)) {
    const owner = await storage.getOwner(user.id);
    if (owner) {
      await storage.updateOwner(owner.id, {
        hasAgreedToTerms: true,
        termsAgreedAt: acceptedAt,
      });
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
      console.error("Terms acceptance check failed:", error);
      res.status(500).json({ message: "Failed to verify terms acceptance" });
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
