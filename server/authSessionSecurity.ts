import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const AUTH_SESSION_FOUNDATION_ENV = "AUTH_SESSION_FOUNDATION_ENABLED";
export const AUTH_SESSION_HASH_PEPPER_ENV = "AUTH_SESSION_HASH_PEPPER";
export const AUTH_CSRF_HEADER = "x-csrf-token";
export const AUTH_SESSION_COOKIE = "crete_session";
export const AUTH_CSRF_COOKIE = "crete_csrf";

const SESSION_HASH_PATTERN = /^[a-f0-9]{64}$/;

export type AuthenticatedRole = "driver" | "owner" | "admin" | "super_admin";
export type SessionPolicy = Readonly<{
  absoluteMs: number;
  inactivityMs: number;
}>;

export const SESSION_POLICIES: Readonly<Record<AuthenticatedRole, SessionPolicy>> = {
  super_admin: { absoluteMs: 24 * 60 * 60 * 1000, inactivityMs: 60 * 60 * 1000 },
  admin: { absoluteMs: 24 * 60 * 60 * 1000, inactivityMs: 60 * 60 * 1000 },
  owner: { absoluteMs: 7 * 24 * 60 * 60 * 1000, inactivityMs: 24 * 60 * 60 * 1000 },
  driver: { absoluteMs: 7 * 24 * 60 * 60 * 1000, inactivityMs: 24 * 60 * 60 * 1000 },
};

export function isAuthSessionFoundationEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment[AUTH_SESSION_FOUNDATION_ENV]?.trim() === "true";
}

export function getAuthSessionHashPepper(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const pepper = environment[AUTH_SESSION_HASH_PEPPER_ENV]?.trim();
  if (!pepper || pepper.length < 32) {
    throw new Error(`${AUTH_SESSION_HASH_PEPPER_ENV} must be at least 32 characters when the session foundation is enabled`);
  }
  return pepper;
}

export function hashAuthenticationSecret(value: string, pepper: string): string {
  if (!value || pepper.length < 32) throw new Error("Authentication hash input is invalid");
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}

export function createOpaqueAuthenticationToken(bytes = 32): string {
  if (bytes < 32) throw new Error("Authentication tokens require at least 256 bits of entropy");
  return randomBytes(bytes).toString("base64url");
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (header || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) continue;
    try { result[name] = decodeURIComponent(value); } catch { /* malformed cookie is ignored */ }
  }
  return result;
}

export function serializeAuthenticationCookie(input: {
  name: string;
  value: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  secure: boolean;
}): string {
  const parts = [
    `${input.name}=${encodeURIComponent(input.value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(input.maxAgeSeconds))}`,
    "SameSite=Lax",
  ];
  if (input.httpOnly) parts.push("HttpOnly");
  if (input.secure) parts.push("Secure");
  return parts.join("; ");
}

export function getSessionPolicy(role: unknown): SessionPolicy {
  if (role === "driver" || role === "owner" || role === "admin" || role === "super_admin") {
    return SESSION_POLICIES[role];
  }
  throw new Error("A recognized role is required for a server session");
}

export function isSameOriginAuthenticationRequest(req: Request): boolean {
  const fetchSite = req.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = req.get("origin")?.trim();
  if (!origin) return true;

  const protocol = req.protocol;
  const host = req.get("host");
  if (!host || (protocol !== "http" && protocol !== "https")) return false;

  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export function safeEqualAuthenticationHash(actual: string, expected: string): boolean {
  if (!SESSION_HASH_PATTERN.test(actual) || !SESSION_HASH_PATTERN.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function sanitizeAuthenticationEventMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (/token|secret|password|cookie|authorization|coordinate|geometry|storage|contact|email|phone|address|user.?agent|\bip\b/i.test(key)) continue;
    if (typeof value === "boolean" || typeof value === "number" || value === null) safe[key] = value;
    else if (typeof value === "string" && value.length <= 120 && /^[\w .:/-]*$/.test(value)) safe[key] = value;
  }
  return safe;
}
