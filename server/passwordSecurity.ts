import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { validatePasswordPolicy, type PasswordPolicyContext } from "@shared/passwordPolicy";

const PREHASHED_PASSWORD_PREFIX = "cx-sha256-bcrypt$";
const PASSWORD_HASH_ROUNDS = 12;

export class PasswordPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PasswordPolicyError";
    this.code = `PASSWORD_${code.toUpperCase()}`;
  }
}

function prehashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("base64url");
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

export async function verifyStoredPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(PREHASHED_PASSWORD_PREFIX)) {
    return bcrypt.compare(prehashPassword(password), storedHash.slice(PREHASHED_PASSWORD_PREFIX.length));
  }
  // Existing accounts remain usable until their next governed password change.
  return bcrypt.compare(password, storedHash);
}

export const passwordSecurityInternals = {
  PREHASHED_PASSWORD_PREFIX,
  PASSWORD_HASH_ROUNDS,
  prehashPassword,
};
