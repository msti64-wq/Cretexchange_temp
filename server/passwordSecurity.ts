import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  normalizePasswordForStorage,
  validatePasswordPolicy,
  type PasswordPolicyContext,
} from "@shared/passwordPolicy";

const PREHASHED_PASSWORD_PREFIX = "cxpw$v1$sha256-bcrypt$";
const PREHASH_DOMAIN = "CreteXchange password prehash v1\0";
const PASSWORD_HASH_ROUNDS = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export class PasswordPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PasswordPolicyError";
    this.code = `PASSWORD_${code.toUpperCase()}`;
  }
}

function prehashPassword(password: string): string {
  return createHash("sha256")
    .update(PREHASH_DOMAIN, "utf8")
    .update(normalizePasswordForStorage(password), "utf8")
    .digest("base64url");
}

export function enforcePasswordPolicy(password: unknown, context: PasswordPolicyContext = {}): string {
  const result = validatePasswordPolicy(password, context);
  if (!result.valid) {
    throw new PasswordPolicyError(result.code, result.message);
  }
  return password as string;
}

export function isPasswordPolicyError(error: unknown): error is PasswordPolicyError {
  return error instanceof PasswordPolicyError;
}

export async function hashPasswordForStorage(password: string): Promise<string> {
  return `${PREHASHED_PASSWORD_PREFIX}${await bcrypt.hash(prehashPassword(password), PASSWORD_HASH_ROUNDS)}`;
}

export function isVersionedPasswordHash(storedHash: string): boolean {
  return storedHash.startsWith(PREHASHED_PASSWORD_PREFIX)
    && BCRYPT_HASH_PATTERN.test(storedHash.slice(PREHASHED_PASSWORD_PREFIX.length));
}

export function isLegacyBcryptPasswordHash(storedHash: string): boolean {
  return BCRYPT_HASH_PATTERN.test(storedHash);
}

export async function verifyStoredPassword(password: string, storedHash: string): Promise<boolean> {
  if (isVersionedPasswordHash(storedHash)) {
    return bcrypt.compare(prehashPassword(password), storedHash.slice(PREHASHED_PASSWORD_PREFIX.length));
  }
  if (storedHash.startsWith("cxpw$") || !isLegacyBcryptPasswordHash(storedHash)) return false;
  return bcrypt.compare(password, storedHash);
}

export async function verifyPasswordForAuthentication(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; upgradedHash: string | null }> {
  if (isVersionedPasswordHash(storedHash)) {
    return { valid: await verifyStoredPassword(password, storedHash), upgradedHash: null };
  }
  if (!isLegacyBcryptPasswordHash(storedHash) || !await bcrypt.compare(password, storedHash)) {
    return { valid: false, upgradedHash: null };
  }
  return { valid: true, upgradedHash: await hashPasswordForStorage(password) };
}

export const passwordSecurityInternals = {
  PREHASHED_PASSWORD_PREFIX,
  PREHASH_DOMAIN,
  PASSWORD_HASH_ROUNDS,
  BCRYPT_HASH_PATTERN,
  prehashPassword,
};
