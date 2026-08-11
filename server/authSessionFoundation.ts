import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import {
  authPasswordResetTokens,
  authRateLimitBuckets,
  authSecurityEvents,
  authSessions,
  users,
  type User,
} from "@shared/schema";
import { db } from "./db";
import { enforcePasswordPolicy, hashPasswordForStorage } from "./passwordSecurity";
import {
  AUTH_CSRF_COOKIE,
  AUTH_CSRF_HEADER,
  AUTH_SESSION_COOKIE,
  createOpaqueAuthenticationToken,
  getAuthSessionHashPepper,
  getSessionPolicy,
  hashAuthenticationSecret,
  isAuthSessionFoundationEnabled,
  isSameOriginAuthenticationRequest,
  parseCookieHeader,
  safeEqualAuthenticationHash,
  sanitizeAuthenticationEventMetadata,
  serializeAuthenticationCookie,
  type AuthenticatedRole,
} from "./authSessionSecurity";

export {
  AUTH_CSRF_COOKIE,
  AUTH_CSRF_HEADER,
  AUTH_SESSION_COOKIE,
  createOpaqueAuthenticationToken,
  getAuthSessionHashPepper,
  getSessionPolicy,
  hashAuthenticationSecret,
  isAuthSessionFoundationEnabled,
  isSameOriginAuthenticationRequest,
  parseCookieHeader,
  serializeAuthenticationCookie,
} from "./authSessionSecurity";
export type { AuthenticatedRole, SessionPolicy } from "./authSessionSecurity";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PRIVILEGED_ROLES = new Set(["admin", "super_admin"]);
const REQUEST_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const NETWORK_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ROUTINE_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;
const PRIVILEGED_RETENTION_MS = 2557 * 24 * 60 * 60 * 1000;

export type AuthenticationRateLimitAction = "login" | "registration" | "forgot_password" | "reset_password" | "session_elevation";

const RATE_LIMIT_POLICIES: Readonly<Record<AuthenticationRateLimitAction, {
  attempts: number;
  windowMs: number;
  blockMs: number;
}>> = {
  login: { attempts: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
  registration: { attempts: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  forgot_password: { attempts: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  reset_password: { attempts: 10, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  session_elevation: { attempts: 8, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 },
};

function isProductionCookieEnvironment(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);
}

function requestReference(req: Request): string {
  const supplied = req.get("x-request-id")?.trim();
  return supplied && REQUEST_REFERENCE_PATTERN.test(supplied) ? supplied : `auth-${randomUUID()}`;
}

function broadDeviceLabel(req: Request): string {
  const userAgent = req.get("user-agent") || "";
  if (/tablet|ipad/i.test(userAgent)) return "Tablet browser";
  if (/mobile|android|iphone/i.test(userAgent)) return "Mobile browser";
  return "Desktop browser";
}

function requestNetworkHash(req: Request, pepper: string): string {
  const address = req.ip || req.socket.remoteAddress || "unavailable";
  return hashAuthenticationSecret(`network:${address}`, pepper);
}

function isPrivilegedRole(role: unknown): role is "admin" | "super_admin" {
  return typeof role === "string" && PRIVILEGED_ROLES.has(role);
}

function retentionFor(role: unknown, forcePrivileged = false): { retentionClass: "routine" | "privileged"; retainUntil: Date } {
  const privileged = forcePrivileged || isPrivilegedRole(role);
  return {
    retentionClass: privileged ? "privileged" : "routine",
    retainUntil: new Date(Date.now() + (privileged ? PRIVILEGED_RETENTION_MS : ROUTINE_RETENTION_MS)),
  };
}

async function insertSecurityEvent(
  executor: any,
  input: {
    eventType: string;
    outcome: "success" | "failure" | "denied" | "information";
    reasonCode?: string | null;
    actorUserId?: string | null;
    subjectUserId?: string | null;
    sessionId?: string | null;
    requestReference: string;
    networkKeyHash?: string | null;
    role?: unknown;
    forcePrivileged?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const retention = retentionFor(input.role, input.forcePrivileged);
  await executor.insert(authSecurityEvents).values({
    eventType: input.eventType.slice(0, 96),
    outcome: input.outcome,
    reasonCode: input.reasonCode?.slice(0, 96) || null,
    actorUserId: input.actorUserId || null,
    subjectUserId: input.subjectUserId || null,
    sessionId: input.sessionId || null,
    requestReference: input.requestReference,
    retentionClass: retention.retentionClass,
    retainUntil: retention.retainUntil,
    networkKeyHash: input.networkKeyHash || null,
    networkMetadataExpiresAt: input.networkKeyHash ? new Date(Date.now() + NETWORK_RETENTION_MS) : null,
    eventMetadata: sanitizeAuthenticationEventMetadata(input.metadata),
  });
}

async function revokeKnownSessionWithEvent(input: {
  sessionId: string;
  userId: string;
  role: unknown;
  reasonCode: string;
  req: Request;
  outcome?: "success" | "denied" | "information";
}): Promise<void> {
  const pepper = getAuthSessionHashPepper();
  await db.transaction(async (tx) => {
    await tx.update(authSessions).set({
      revokedAt: new Date(),
      revocationReason: input.reasonCode,
    }).where(and(eq(authSessions.id, input.sessionId), isNull(authSessions.revokedAt)));
    await insertSecurityEvent(tx, {
      eventType: "session.revoked",
      outcome: input.outcome || "information",
      reasonCode: input.reasonCode,
      actorUserId: input.userId,
      subjectUserId: input.userId,
      sessionId: input.sessionId,
      requestReference: requestReference(input.req),
      networkKeyHash: requestNetworkHash(input.req, pepper),
      role: input.role,
    });
  });
}

function sessionExpiry(role: AuthenticatedRole, now = new Date()) {
  const policy = getSessionPolicy(role);
  const absoluteExpiresAt = new Date(now.getTime() + policy.absoluteMs);
  const idleExpiresAt = new Date(Math.min(absoluteExpiresAt.getTime(), now.getTime() + policy.inactivityMs));
  return { policy, absoluteExpiresAt, idleExpiresAt };
}

async function insertSession(
  executor: any,
  input: {
    user: Pick<User, "id" | "role">;
    req: Request;
    pepper: string;
    rotatedFromSessionId?: string | null;
  },
) {
  const role = input.user.role as AuthenticatedRole;
  const now = new Date();
  const token = createOpaqueAuthenticationToken();
  const csrfToken = createOpaqueAuthenticationToken();
  const { policy, absoluteExpiresAt, idleExpiresAt } = sessionExpiry(role, now);
  const [session] = await executor.insert(authSessions).values({
    userId: input.user.id,
    tokenHash: hashAuthenticationSecret(token, input.pepper),
    csrfTokenHash: hashAuthenticationSecret(csrfToken, input.pepper),
    roleSnapshot: role,
    deviceLabel: broadDeviceLabel(input.req),
    networkKeyHash: requestNetworkHash(input.req, input.pepper),
    networkMetadataExpiresAt: new Date(now.getTime() + NETWORK_RETENTION_MS),
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    rotatedFromSessionId: input.rotatedFromSessionId || null,
  }).returning();
  return { session, token, csrfToken, policy };
}

function appendAuthenticationCookies(res: Response, input: { token: string; csrfToken: string; maxAgeMs: number }) {
  const secure = isProductionCookieEnvironment();
  res.append("Set-Cookie", serializeAuthenticationCookie({
    name: AUTH_SESSION_COOKIE,
    value: input.token,
    maxAgeSeconds: input.maxAgeMs / 1000,
    httpOnly: true,
    secure,
  }));
  res.append("Set-Cookie", serializeAuthenticationCookie({
    name: AUTH_CSRF_COOKIE,
    value: input.csrfToken,
    maxAgeSeconds: input.maxAgeMs / 1000,
    httpOnly: false,
    secure,
  }));
}

export function clearAuthenticationCookies(res: Response) {
  const secure = isProductionCookieEnvironment();
  for (const [name, httpOnly] of [[AUTH_SESSION_COOKIE, true], [AUTH_CSRF_COOKIE, false]] as const) {
    res.append("Set-Cookie", serializeAuthenticationCookie({ name, value: "", maxAgeSeconds: 0, httpOnly, secure }));
  }
}

export async function createAuthenticatedServerSession(
  user: Pick<User, "id" | "role">,
  req: Request,
  res: Response,
  reasonCode: string,
): Promise<string> {
  const pepper = getAuthSessionHashPepper();
  const ref = requestReference(req);
  const existingOpaqueToken = parseCookieHeader(req.headers.cookie)[AUTH_SESSION_COOKIE];
  const existingTokenHash = existingOpaqueToken ? hashAuthenticationSecret(existingOpaqueToken, pepper) : null;
  const created = await db.transaction(async (tx) => {
    const [existingSession] = existingTokenHash
      ? await tx.select({ id: authSessions.id }).from(authSessions).where(and(
        eq(authSessions.tokenHash, existingTokenHash),
        eq(authSessions.userId, user.id),
        isNull(authSessions.revokedAt),
      )).limit(1)
      : [];
    if (existingSession) {
      await tx.update(authSessions).set({
        revokedAt: new Date(),
        revocationReason: "authentication_rotation",
      }).where(eq(authSessions.id, existingSession.id));
    }
    const result = await insertSession(tx, {
      user,
      req,
      pepper,
      rotatedFromSessionId: existingSession?.id || null,
    });
    await insertSecurityEvent(tx, {
      eventType: existingSession ? "session.rotated" : "session.created",
      outcome: "success",
      reasonCode: existingSession ? "authentication_rotation" : reasonCode,
      actorUserId: user.id,
      subjectUserId: user.id,
      sessionId: result.session.id,
      requestReference: ref,
      networkKeyHash: requestNetworkHash(req, pepper),
      role: user.role,
      metadata: { role: user.role || "unknown", device: broadDeviceLabel(req), rotated: Boolean(existingSession) },
    });
    return result;
  });
  appendAuthenticationCookies(res, { token: created.token, csrfToken: created.csrfToken, maxAgeMs: created.policy.absoluteMs });
  return created.session.id;
}

export type ServerSessionAuthenticationResult =
  | { ok: true; user: Omit<User, "passwordHash">; sessionId: string }
  | { ok: false; status: 401 | 403; message: string; code: string };

export async function authenticateServerSessionRequest(req: Request): Promise<ServerSessionAuthenticationResult> {
  const pepper = getAuthSessionHashPepper();
  const cookies = parseCookieHeader(req.headers.cookie);
  const opaqueToken = cookies[AUTH_SESSION_COOKIE];
  if (!opaqueToken) return { ok: false, status: 401, message: "Unauthorized", code: "SESSION_REQUIRED" };
  const tokenHash = hashAuthenticationSecret(opaqueToken, pepper);
  const rows = await db.select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  const record = rows[0];
  if (!record || record.session.revokedAt) return { ok: false, status: 401, message: "Your session has expired. Please sign in again.", code: "SESSION_INVALID" };

  const now = new Date();
  if (record.session.absoluteExpiresAt <= now || record.session.idleExpiresAt <= now) {
    await revokeKnownSessionWithEvent({
      sessionId: record.session.id,
      userId: record.user.id,
      role: record.user.role,
      reasonCode: "expired",
      req,
    });
    return { ok: false, status: 401, message: "Your session has expired. Please sign in again.", code: "SESSION_EXPIRED" };
  }
  if (record.user.isActive === false) {
    await revokeKnownSessionWithEvent({
      sessionId: record.session.id,
      userId: record.user.id,
      role: record.user.role,
      reasonCode: "account_inactive",
      req,
      outcome: "denied",
    });
    return { ok: false, status: 403, message: "Account is inactive", code: "ACCOUNT_INACTIVE" };
  }
  if (!record.user.role || record.session.roleSnapshot !== record.user.role) {
    await revokeKnownSessionWithEvent({
      sessionId: record.session.id,
      userId: record.user.id,
      role: record.user.role,
      reasonCode: "role_changed",
      req,
      outcome: "denied",
    });
    return { ok: false, status: 401, message: "Your session has expired. Please sign in again.", code: "ROLE_CHANGED" };
  }

  if (!SAFE_METHODS.has(req.method.toUpperCase())) {
    const csrfCookie = cookies[AUTH_CSRF_COOKIE] || "";
    const csrfHeader = typeof req.headers[AUTH_CSRF_HEADER] === "string" ? req.headers[AUTH_CSRF_HEADER] : "";
    const cookieHash = csrfCookie ? hashAuthenticationSecret(csrfCookie, pepper) : "";
    const headerHash = csrfHeader ? hashAuthenticationSecret(csrfHeader, pepper) : "";
    if (!safeEqualAuthenticationHash(cookieHash, record.session.csrfTokenHash) || !safeEqualAuthenticationHash(headerHash, record.session.csrfTokenHash)) {
      await insertSecurityEvent(db, {
        eventType: "session.csrf_denied",
        outcome: "denied",
        reasonCode: "csrf_validation_failed",
        actorUserId: record.user.id,
        subjectUserId: record.user.id,
        sessionId: record.session.id,
        requestReference: requestReference(req),
        networkKeyHash: requestNetworkHash(req, pepper),
        role: record.user.role,
      });
      return { ok: false, status: 403, message: "Request verification failed", code: "CSRF_VALIDATION_FAILED" };
    }
  }

  if (now.getTime() - record.session.lastSeenAt.getTime() >= 5 * 60 * 1000) {
    const policy = getSessionPolicy(record.user.role);
    await db.update(authSessions).set({
      lastSeenAt: now,
      idleExpiresAt: new Date(Math.min(record.session.absoluteExpiresAt.getTime(), now.getTime() + policy.inactivityMs)),
    }).where(and(eq(authSessions.id, record.session.id), isNull(authSessions.revokedAt)));
  }

  const { passwordHash: _passwordHash, ...safeUser } = record.user;
  return { ok: true, user: safeUser, sessionId: record.session.id };
}

export async function revokeSessionFromRequest(req: Request, res: Response, reasonCode: string): Promise<void> {
  const pepper = getAuthSessionHashPepper();
  const cookies = parseCookieHeader(req.headers.cookie);
  const opaqueToken = cookies[AUTH_SESSION_COOKIE];
  if (opaqueToken) {
    const tokenHash = hashAuthenticationSecret(opaqueToken, pepper);
    const [session] = await db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
    if (session && !session.revokedAt) {
      await db.transaction(async (tx) => {
        await tx.update(authSessions).set({ revokedAt: new Date(), revocationReason: reasonCode }).where(eq(authSessions.id, session.id));
        await insertSecurityEvent(tx, {
          eventType: "session.revoked",
          outcome: "success",
          reasonCode,
          actorUserId: session.userId,
          subjectUserId: session.userId,
          sessionId: session.id,
          requestReference: requestReference(req),
          networkKeyHash: requestNetworkHash(req, pepper),
          role: session.roleSnapshot,
          metadata: { scope: "current_session" },
        });
      });
    }
  }
  clearAuthenticationCookies(res);
}

export async function revokeAllUserSessions(userId: string, reasonCode: string, executor: any = db): Promise<number> {
  const rows = await executor.update(authSessions).set({ revokedAt: new Date(), revocationReason: reasonCode })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
  return rows.length;
}

export async function setUserActiveStatusWithSessionGovernance(input: {
  actor: Pick<User, "id" | "role">;
  subjectUserId: string;
  isActive: boolean;
  req: Request;
}): Promise<User | undefined> {
  if (!isPrivilegedRole(input.actor.role)) throw new Error("Privileged account-status authority is required");
  const pepper = getAuthSessionHashPepper();
  return db.transaction(async (tx) => {
    const [subject] = await tx.select().from(users)
      .where(eq(users.id, input.subjectUserId))
      .for("update")
      .limit(1);
    if (!subject) return undefined;
    if (subject.isActive === input.isActive) return subject;

    const [updated] = await tx.update(users).set({
      isActive: input.isActive,
      ...(input.isActive ? {} : { authTokenVersion: sql`${users.authTokenVersion} + 1` }),
      updatedAt: new Date(),
    }).where(eq(users.id, input.subjectUserId)).returning();
    const sessionsRevoked = input.isActive
      ? 0
      : await revokeAllUserSessions(input.subjectUserId, "account_deactivated", tx);
    await insertSecurityEvent(tx, {
      eventType: input.isActive ? "account.activated" : "account.deactivated",
      outcome: "success",
      reasonCode: input.isActive ? "administrative_activation" : "administrative_deactivation",
      actorUserId: input.actor.id,
      subjectUserId: input.subjectUserId,
      requestReference: requestReference(input.req),
      networkKeyHash: requestNetworkHash(input.req, pepper),
      role: subject.role,
      forcePrivileged: isPrivilegedRole(input.actor.role) || isPrivilegedRole(subject.role),
      metadata: { sessionsRevoked },
    });
    return updated;
  });
}

export async function rotateAuthenticatedServerSession(
  req: Request & { authSessionId?: string; user?: { id?: string; role?: AuthenticatedRole } },
  res: Response,
  user: Pick<User, "id" | "role">,
  reasonCode: string,
): Promise<string> {
  const pepper = getAuthSessionHashPepper();
  const ref = requestReference(req);
  const rotated = await db.transaction(async (tx) => {
    if (req.authSessionId) {
      await tx.update(authSessions).set({ revokedAt: new Date(), revocationReason: reasonCode }).where(eq(authSessions.id, req.authSessionId));
    }
    const result = await insertSession(tx, { user, req, pepper, rotatedFromSessionId: req.authSessionId || null });
    await insertSecurityEvent(tx, {
      eventType: "session.rotated",
      outcome: "success",
      reasonCode,
      actorUserId: user.id,
      subjectUserId: user.id,
      sessionId: result.session.id,
      requestReference: ref,
      networkKeyHash: requestNetworkHash(req, pepper),
      role: user.role,
    });
    return result;
  });
  appendAuthenticationCookies(res, { token: rotated.token, csrfToken: rotated.csrfToken, maxAgeMs: rotated.policy.absoluteMs });
  return rotated.session.id;
}

export async function listActiveUserSessions(userId: string, currentSessionId?: string) {
  const now = new Date();
  const rows = await db.select({
    id: authSessions.id,
    deviceLabel: authSessions.deviceLabel,
    createdAt: authSessions.createdAt,
    lastSeenAt: authSessions.lastSeenAt,
    idleExpiresAt: authSessions.idleExpiresAt,
    absoluteExpiresAt: authSessions.absoluteExpiresAt,
  }).from(authSessions).where(and(
    eq(authSessions.userId, userId),
    isNull(authSessions.revokedAt),
    gt(authSessions.absoluteExpiresAt, now),
    gt(authSessions.idleExpiresAt, now),
  ));
  return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
}

export async function revokeOwnedSession(userId: string, sessionId: string, reasonCode: string): Promise<boolean> {
  const rows = await db.update(authSessions).set({ revokedAt: new Date(), revocationReason: reasonCode })
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
  return rows.length === 1;
}

export async function revokeOwnedSessionWithAudit(input: {
  user: Pick<User, "id" | "role">;
  sessionId: string;
  req: Request;
}): Promise<boolean> {
  const pepper = getAuthSessionHashPepper();
  return db.transaction(async (tx) => {
    const rows = await tx.update(authSessions).set({
      revokedAt: new Date(),
      revocationReason: "user_revoked_session",
    }).where(and(
      eq(authSessions.id, input.sessionId),
      eq(authSessions.userId, input.user.id),
      isNull(authSessions.revokedAt),
    )).returning({ id: authSessions.id });
    if (rows.length !== 1) return false;
    await insertSecurityEvent(tx, {
      eventType: "session.revoked",
      outcome: "success",
      reasonCode: "user_revoked_session",
      actorUserId: input.user.id,
      subjectUserId: input.user.id,
      sessionId: input.sessionId,
      requestReference: requestReference(input.req),
      networkKeyHash: requestNetworkHash(input.req, pepper),
      role: input.user.role,
      metadata: { scope: "owned_session" },
    });
    return true;
  });
}

export async function revokeAllUserSessionsWithAudit(input: {
  user: Pick<User, "id" | "role">;
  req: Request;
}): Promise<number> {
  const pepper = getAuthSessionHashPepper();
  return db.transaction(async (tx) => {
    const revoked = await revokeAllUserSessions(input.user.id, "user_signed_out_all_devices", tx);
    await insertSecurityEvent(tx, {
      eventType: "session.revoked_all",
      outcome: "success",
      reasonCode: "user_signed_out_all_devices",
      actorUserId: input.user.id,
      subjectUserId: input.user.id,
      requestReference: requestReference(input.req),
      networkKeyHash: requestNetworkHash(input.req, pepper),
      role: input.user.role,
      metadata: { revokedCount: revoked },
    });
    return revoked;
  });
}

export async function revokeOtherUserSessionsWithAudit(input: {
  user: Pick<User, "id" | "role">;
  currentSessionId: string;
  req: Request;
}): Promise<number> {
  const pepper = getAuthSessionHashPepper();
  return db.transaction(async (tx) => {
    const rows = await tx.update(authSessions).set({
      revokedAt: new Date(),
      revocationReason: "user_signed_out_other_devices",
    }).where(and(
      eq(authSessions.userId, input.user.id),
      ne(authSessions.id, input.currentSessionId),
      isNull(authSessions.revokedAt),
    )).returning({ id: authSessions.id });
    await insertSecurityEvent(tx, {
      eventType: "session.revoked_others",
      outcome: "success",
      reasonCode: "user_signed_out_other_devices",
      actorUserId: input.user.id,
      subjectUserId: input.user.id,
      sessionId: input.currentSessionId,
      requestReference: requestReference(input.req),
      networkKeyHash: requestNetworkHash(input.req, pepper),
      role: input.user.role,
      metadata: { revokedCount: rows.length },
    });
    return rows.length;
  });
}

function rateLimitKey(action: AuthenticationRateLimitAction, scope: string, value: string, pepper: string): string {
  return hashAuthenticationSecret(`rate:${action}:${scope}:${value.trim().toLowerCase()}`, pepper);
}

async function consumeRateLimitBucket(action: AuthenticationRateLimitAction, keyHash: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const policy = RATE_LIMIT_POLICIES[action];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${action}:${keyHash}`}))`);
    const [existing] = await tx.select().from(authRateLimitBuckets)
      .where(and(eq(authRateLimitBuckets.action, action), eq(authRateLimitBuckets.keyHash, keyHash)))
      .for("update")
      .limit(1);
    const now = new Date();
    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000)) };
    }
    const windowExpired = !existing || now.getTime() - existing.windowStartedAt.getTime() >= policy.windowMs;
    const attemptCount = windowExpired ? 1 : existing.attemptCount + 1;
    const blockedUntil = attemptCount > policy.attempts ? new Date(now.getTime() + policy.blockMs) : null;
    await tx.insert(authRateLimitBuckets).values({
      action,
      keyHash,
      windowStartedAt: windowExpired ? now : existing!.windowStartedAt,
      attemptCount,
      blockedUntil,
      expiresAt: new Date(now.getTime() + NETWORK_RETENTION_MS),
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [authRateLimitBuckets.action, authRateLimitBuckets.keyHash],
      set: {
        windowStartedAt: windowExpired ? now : existing!.windowStartedAt,
        attemptCount,
        blockedUntil,
        expiresAt: new Date(now.getTime() + NETWORK_RETENTION_MS),
        updatedAt: now,
      },
    });
    return blockedUntil
      ? { allowed: false, retryAfterSeconds: Math.ceil(policy.blockMs / 1000) }
      : { allowed: true, retryAfterSeconds: 0 };
  });
}

export async function consumeAuthenticationRateLimit(
  action: AuthenticationRateLimitAction,
  req: Request,
  principal: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const pepper = getAuthSessionHashPepper();
  const keys = [
    rateLimitKey(action, "principal", principal || "unknown", pepper),
    rateLimitKey(action, "network", req.ip || req.socket.remoteAddress || "unavailable", pepper),
  ];
  let retryAfterSeconds = 0;
  for (const key of keys) {
    const result = await consumeRateLimitBucket(action, key);
    retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
    if (!result.allowed) return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds };
}

export async function recordAuthenticationFailure(input: {
  req: Request;
  eventType: string;
  reasonCode: string;
  subjectUserId?: string | null;
  role?: unknown;
  outcome?: "failure" | "denied";
}) {
  const pepper = getAuthSessionHashPepper();
  await insertSecurityEvent(db, {
    eventType: input.eventType,
    outcome: input.outcome || "failure",
    reasonCode: input.reasonCode,
    subjectUserId: input.subjectUserId || null,
    requestReference: requestReference(input.req),
    networkKeyHash: requestNetworkHash(input.req, pepper),
    role: input.role,
  });
}

export async function createSecurePasswordResetToken(user: Pick<User, "id" | "role">, req: Request): Promise<string> {
  const pepper = getAuthSessionHashPepper();
  const rawToken = createOpaqueAuthenticationToken();
  const tokenHash = hashAuthenticationSecret(rawToken, pepper);
  const ref = requestReference(req);
  await db.transaction(async (tx) => {
    await tx.update(authPasswordResetTokens).set({ revokedAt: new Date() }).where(and(
      eq(authPasswordResetTokens.userId, user.id),
      isNull(authPasswordResetTokens.consumedAt),
      isNull(authPasswordResetTokens.revokedAt),
    ));
    await tx.insert(authPasswordResetTokens).values({
      userId: user.id,
      tokenHash,
      requestReference: ref,
      networkKeyHash: requestNetworkHash(req, pepper),
      networkMetadataExpiresAt: new Date(Date.now() + NETWORK_RETENTION_MS),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await insertSecurityEvent(tx, {
      eventType: "password_reset.requested",
      outcome: "information",
      reasonCode: "self_service_request",
      subjectUserId: user.id,
      requestReference: ref,
      networkKeyHash: requestNetworkHash(req, pepper),
      role: user.role,
      forcePrivileged: isPrivilegedRole(user.role),
    });
  });
  return rawToken;
}

export async function consumeSecurePasswordResetToken(rawToken: string, password: string, req: Request): Promise<boolean> {
  const pepper = getAuthSessionHashPepper();
  const tokenHash = hashAuthenticationSecret(rawToken, pepper);
  const ref = requestReference(req);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`password-reset:${tokenHash}`}))`);
    const rows = await tx.select({ reset: authPasswordResetTokens, user: users })
      .from(authPasswordResetTokens)
      .innerJoin(users, eq(authPasswordResetTokens.userId, users.id))
      .where(eq(authPasswordResetTokens.tokenHash, tokenHash))
      .for("update")
      .limit(1);
    const record = rows[0];
    const now = new Date();
    if (!record || record.reset.consumedAt || record.reset.revokedAt || record.reset.expiresAt <= now) return false;
    enforcePasswordPolicy(password, record.user);
    const passwordHash = await hashPasswordForStorage(password);
    await tx.update(users).set({
      passwordHash,
      authTokenVersion: sql`${users.authTokenVersion} + 1`,
      updatedAt: now,
    }).where(eq(users.id, record.user.id));
    await tx.update(authPasswordResetTokens).set({ consumedAt: now }).where(eq(authPasswordResetTokens.id, record.reset.id));
    await revokeAllUserSessions(record.user.id, "password_reset", tx);
    await insertSecurityEvent(tx, {
      eventType: "password_reset.completed",
      outcome: "success",
      reasonCode: "self_service_reset",
      subjectUserId: record.user.id,
      requestReference: ref,
      networkKeyHash: requestNetworkHash(req, pepper),
      role: record.user.role,
      forcePrivileged: isPrivilegedRole(record.user.role),
    });
    return true;
  });
}

export async function updatePasswordAndRevokeSessions(
  user: Pick<User, "id" | "role">,
  passwordHash: string,
  req: Request & { authSessionId?: string },
  res: Response,
): Promise<void> {
  const pepper = getAuthSessionHashPepper();
  const now = new Date();
  const replacement = await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash,
      authTokenVersion: sql`${users.authTokenVersion} + 1`,
      updatedAt: now,
    }).where(eq(users.id, user.id));
    await revokeAllUserSessions(user.id, "password_changed", tx);
    const newSession = await insertSession(tx, {
      user,
      req,
      pepper,
      rotatedFromSessionId: req.authSessionId || null,
    });
    await insertSecurityEvent(tx, {
      eventType: "password.changed",
      outcome: "success",
      reasonCode: "authenticated_change",
      actorUserId: user.id,
      subjectUserId: user.id,
      sessionId: newSession.session.id,
      requestReference: requestReference(req),
      networkKeyHash: requestNetworkHash(req, pepper),
      role: user.role,
      forcePrivileged: isPrivilegedRole(user.role),
      metadata: { sessionsRevoked: true, sessionRotated: true },
    });
    return newSession;
  });
  appendAuthenticationCookies(res, {
    token: replacement.token,
    csrfToken: replacement.csrfToken,
    maxAgeMs: replacement.policy.absoluteMs,
  });
}

export const authenticationFoundationInternals = {
  RATE_LIMIT_POLICIES,
  sanitizeEventMetadata: sanitizeAuthenticationEventMetadata,
  safeEqualHash: safeEqualAuthenticationHash,
  sessionExpiry,
};
