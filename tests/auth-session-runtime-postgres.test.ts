import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import type { AuthSessionCutoverPlan } from "../scripts/controlled-auth-session-cutover";

const databaseUrl = process.env.AUTH_SESSION_RUNTIME_TEST_DATABASE_URL;
const confirmation = process.env.AUTH_SESSION_RUNTIME_TEST_CONFIRM;

function requireDisposableDatabase(url: string) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(name) || confirmation !== "isolated-auth-runtime") {
    throw new Error("Authentication runtime tests require an explicitly confirmed disposable database");
  }
  if (process.env.DATABASE_URL !== url) throw new Error("DATABASE_URL must equal the disposable runtime-test URL");
}

function mockRequest(input: {
  method?: string;
  cookie?: string;
  csrf?: string;
  ip?: string;
  requestId?: string;
}) {
  const headers: Record<string, string> = {
    host: "127.0.0.1",
    "user-agent": "CreteXchange isolated mobile validation",
    ...(input.cookie ? { cookie: input.cookie } : {}),
    ...(input.csrf ? { "x-csrf-token": input.csrf } : {}),
    ...(input.requestId ? { "x-request-id": input.requestId } : {}),
  };
  return {
    method: input.method || "GET",
    headers,
    ip: input.ip || "127.0.0.1",
    socket: { remoteAddress: input.ip || "127.0.0.1" },
    protocol: "http",
    get(name: string) { return headers[name.toLowerCase()]; },
  } as any;
}

function mockResponse() {
  const cookies: string[] = [];
  return {
    cookies,
    append(name: string, value: string) {
      if (name.toLowerCase() === "set-cookie") cookies.push(value);
      return this;
    },
  } as any;
}

function cookieValue(setCookies: string[], name: string) {
  const cookie = setCookies.find((value) => value.startsWith(`${name}=`));
  assert.ok(cookie, `${name} cookie was not set`);
  return decodeURIComponent(cookie.split(";", 1)[0].slice(name.length + 1));
}

test("default-off runtime foundation persists, authenticates, rotates, revokes, rate-limits, and prevents reset replay", {
  skip: !databaseUrl ? "AUTH_SESSION_RUNTIME_TEST_DATABASE_URL is not configured" : false,
}, async () => {
  requireDisposableDatabase(databaseUrl!);
  const migration = await readFile(new URL("../migrations/0042_add_revocable_authentication_session_foundation.sql", import.meta.url), "utf8");
  const setup = new Client({ connectionString: databaseUrl });
  await setup.connect();
  await setup.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await setup.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await setup.query(`CREATE TABLE users (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), username varchar UNIQUE NOT NULL, email varchar UNIQUE NOT NULL,
    password_hash varchar NOT NULL, first_name varchar NOT NULL, last_name varchar NOT NULL, profile_image_url varchar,
    role varchar, column_customer_id varchar, phone varchar, street varchar, city varchar, state varchar, zip varchar,
    payment_method varchar DEFAULT 'ach', payment_frequency varchar DEFAULT 'weekly', stripe_connect_account_id varchar,
    stripe_customer_id varchar, stripe_connect_balance numeric(10,2), is_active boolean DEFAULT true,
    auth_token_version integer NOT NULL DEFAULT 0, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
  )`);
  await setup.query(migration);
  const userId = "00000000-0000-4000-8000-000000000101";
  const legacyPassword = "Legacy complete Unicode password café 🧱";
  const legacyPasswordHash = await bcrypt.hash(legacyPassword, 4);
  await setup.query(`INSERT INTO users
    (id,username,email,password_hash,first_name,last_name,role,is_active)
    VALUES ($1,'auth-runtime','auth-runtime@example.invalid',$2,'Auth','Runtime','owner',true)`, [userId, legacyPasswordHash]);
  await setup.end();

  process.env.AUTH_SESSION_FOUNDATION_ENABLED = "true";
  process.env.AUTH_SESSION_HASH_PEPPER = "isolated-auth-session-pepper-material-2026";
  process.env.NODE_ENV = "test";
  const foundation = await import("../server/authSessionFoundation");
  const passwordSecurity = await import("../server/passwordSecurity");
  const { storage } = await import("../server/storage");
  const { pool } = await import("../server/db");
  const verification = new Client({ connectionString: databaseUrl });
  await verification.connect();

  try {
    const user = { id: userId, role: "owner" as const };
    assert.deepEqual(await passwordSecurity.verifyPasswordForAuthentication("wrong legacy password", legacyPasswordHash), {
      valid: false,
      upgradedHash: null,
    });
    assert.equal((await verification.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0].password_hash, legacyPasswordHash);
    const legacyVerification = await passwordSecurity.verifyPasswordForAuthentication(legacyPassword, legacyPasswordHash);
    assert.equal(legacyVerification.valid, true);
    assert.match(legacyVerification.upgradedHash || "", /^cxpw\$v1\$nfc-sha256-bcrypt\$/);
    const competingUpgradeHash = await passwordSecurity.hashPasswordForStorage(legacyPassword);
    assert.deepEqual((await Promise.all([
      storage.upgradeUserPasswordHash(userId, legacyPasswordHash, legacyVerification.upgradedHash || ""),
      storage.upgradeUserPasswordHash(userId, legacyPasswordHash, competingUpgradeHash),
    ])).sort(), [false, true]);
    const upgradedPasswordHash = (await verification.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0].password_hash;
    assert.equal(await passwordSecurity.verifyStoredPassword(legacyPassword.normalize("NFD"), upgradedPasswordHash), true);
    assert.deepEqual(await passwordSecurity.verifyPasswordForAuthentication(legacyPassword, upgradedPasswordHash), { valid: true, upgradedHash: null });

    const loginRequest = mockRequest({ method: "POST", requestId: "auth-runtime-login" });
    const loginResponse = mockResponse();
    const sessionId = await foundation.createAuthenticatedServerSession(user, loginRequest, loginResponse, "password_login");
    assert.equal(loginResponse.cookies.length, 2);
    const sessionToken = cookieValue(loginResponse.cookies, foundation.AUTH_SESSION_COOKIE);
    const csrfToken = cookieValue(loginResponse.cookies, foundation.AUTH_CSRF_COOKIE);
    const cookie = `${foundation.AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; ${foundation.AUTH_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`;

    const rawTokenCount = await verification.query("SELECT count(*)::int AS value FROM auth_sessions WHERE token_hash=$1", [sessionToken]);
    assert.equal(rawTokenCount.rows[0].value, 0);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_sessions")).rows[0].value, 1);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.created'")).rows[0].value, 1);

    const authenticated = await foundation.authenticateServerSessionRequest(mockRequest({ cookie }));
    assert.equal(authenticated.ok, true);
    if (authenticated.ok) assert.equal(authenticated.user.id, userId);

    const csrfDenied = await foundation.authenticateServerSessionRequest(mockRequest({ method: "POST", cookie }));
    assert.equal(csrfDenied.ok, false);
    if (!csrfDenied.ok) assert.equal(csrfDenied.code, "CSRF_VALIDATION_FAILED");
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.csrf_denied'")).rows[0].value, 1);

    const csrfAccepted = await foundation.authenticateServerSessionRequest(mockRequest({ method: "POST", cookie, csrf: csrfToken }));
    assert.equal(csrfAccepted.ok, true);
    assert.equal((await foundation.listActiveUserSessions(userId, sessionId)).length, 1);

    const rotatedLoginResponse = mockResponse();
    await foundation.createAuthenticatedServerSession(
      user,
      mockRequest({ method: "POST", cookie, requestId: "auth-runtime-login-rotation" }),
      rotatedLoginResponse,
      "password_login",
    );
    const rotatedState = await verification.query("SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1", [sessionId]);
    assert.ok(rotatedState.rows[0].revoked_at);
    assert.equal(rotatedState.rows[0].revocation_reason, "authentication_rotation");
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.rotated'")).rows[0].value, 1);

    const resetToken = await foundation.createSecurePasswordResetToken(user, mockRequest({ method: "POST", requestId: "auth-runtime-reset-request" }));
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_password_reset_tokens WHERE token_hash=$1", [resetToken])).rows[0].value, 0);
    const resetPassword = "Correct horse battery staple Cafe\u0301 🧱";
    assert.equal(await foundation.consumeSecurePasswordResetToken(resetToken, resetPassword, mockRequest({ method: "POST", requestId: "auth-runtime-reset-complete" })), true);
    assert.equal(await foundation.consumeSecurePasswordResetToken(resetToken, "replay-hash", mockRequest({ method: "POST", requestId: "auth-runtime-reset-replay" })), false);
    const resetState = await verification.query("SELECT password_hash,auth_token_version FROM users WHERE id=$1", [userId]);
    assert.match(resetState.rows[0].password_hash, /^cxpw\$v1\$nfc-sha256-bcrypt\$/);
    assert.equal(await passwordSecurity.verifyStoredPassword(resetPassword.normalize("NFC"), resetState.rows[0].password_hash), true);
    assert.equal(resetState.rows[0].auth_token_version, 1);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_sessions WHERE revoked_at IS NULL")).rows[0].value, 0);

    const replacementResponse = mockResponse();
    const replacementRequest = mockRequest({ method: "POST", requestId: "auth-runtime-password-change" });
    const changedPassword = "Changed password keeps decomposed Cafe\u0301 🧱";
    await foundation.updatePasswordAndRevokeSessions(
      user,
      await passwordSecurity.hashPasswordForStorage(changedPassword),
      replacementRequest,
      replacementResponse,
    );
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_sessions WHERE revoked_at IS NULL")).rows[0].value, 1);
    assert.equal((await verification.query("SELECT auth_token_version FROM users WHERE id=$1", [userId])).rows[0].auth_token_version, 2);
    assert.equal(await passwordSecurity.verifyStoredPassword(
      changedPassword.normalize("NFC"),
      (await verification.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0].password_hash,
    ), true);

    const currentSessionId = (await verification.query("SELECT id FROM auth_sessions WHERE revoked_at IS NULL")).rows[0].id;
    await foundation.createAuthenticatedServerSession(user, mockRequest({ method: "POST", requestId: "auth-runtime-other-device" }), mockResponse(), "password_login");
    assert.equal((await foundation.listActiveUserSessions(userId, currentSessionId)).length, 2);
    assert.equal(await foundation.revokeOtherUserSessionsWithAudit({
      user,
      currentSessionId,
      req: mockRequest({ method: "POST", requestId: "auth-runtime-revoke-others" }),
    }), 1);
    assert.equal((await foundation.listActiveUserSessions(userId, currentSessionId)).length, 1);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.revoked_others'")).rows[0].value, 1);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await foundation.consumeAuthenticationRateLimit("login", mockRequest({ ip: "127.0.0.2" }), "bounded-user")).allowed, true);
    }
    const limited = await foundation.consumeAuthenticationRateLimit("login", mockRequest({ ip: "127.0.0.2" }), "bounded-user");
    assert.equal(limited.allowed, false);
    assert.ok(limited.retryAfterSeconds > 0);

    const roleSessionResponse = mockResponse();
    await foundation.createAuthenticatedServerSession(user, mockRequest({ method: "POST", requestId: "auth-runtime-role-session" }), roleSessionResponse, "password_login");
    const roleSessionToken = cookieValue(roleSessionResponse.cookies, foundation.AUTH_SESSION_COOKIE);
    const roleCsrf = cookieValue(roleSessionResponse.cookies, foundation.AUTH_CSRF_COOKIE);
    await verification.query("UPDATE users SET role='admin' WHERE id=$1", [userId]);
    const roleResult = await foundation.authenticateServerSessionRequest(mockRequest({
      cookie: `${foundation.AUTH_SESSION_COOKIE}=${roleSessionToken}; ${foundation.AUTH_CSRF_COOKIE}=${roleCsrf}`,
    }));
    assert.equal(roleResult.ok, false);
    if (!roleResult.ok) assert.equal(roleResult.code, "ROLE_CHANGED");

    await verification.query("UPDATE users SET role='owner' WHERE id=$1", [userId]);
    const concurrentResponse = mockResponse();
    const concurrentSessionId = await foundation.createAuthenticatedServerSession(
      user,
      mockRequest({ method: "POST", requestId: "auth-runtime-concurrent-revocation-session" }),
      concurrentResponse,
      "password_login",
    );
    const concurrentResults = await Promise.all([
      foundation.revokeOwnedSessionWithAudit({
        user,
        sessionId: concurrentSessionId,
        req: mockRequest({ method: "DELETE", requestId: "auth-runtime-concurrent-revoke-a" }),
      }),
      foundation.revokeOwnedSessionWithAudit({
        user,
        sessionId: concurrentSessionId,
        req: mockRequest({ method: "DELETE", requestId: "auth-runtime-concurrent-revoke-b" }),
      }),
    ]);
    assert.deepEqual([...concurrentResults].sort(), [false, true]);
    assert.equal((await verification.query(
      "SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.revoked' AND session_id=$1",
      [concurrentSessionId],
    )).rows[0].value, 1);

    const allRevoked = await foundation.revokeAllUserSessionsWithAudit({
      user,
      req: mockRequest({ method: "POST", requestId: "auth-runtime-revoke-all" }),
    });
    assert.ok(allRevoked >= 1);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_sessions WHERE revoked_at IS NULL")).rows[0].value, 0);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='session.revoked_all'")).rows[0].value, 1);

    await foundation.createAuthenticatedServerSession(
      user,
      mockRequest({ method: "POST", requestId: "auth-runtime-deactivation-session" }),
      mockResponse(),
      "password_login",
    );
    await assert.rejects(foundation.setUserActiveStatusWithSessionGovernance({
      actor: { id: userId, role: "owner" },
      subjectUserId: userId,
      isActive: false,
      req: mockRequest({ method: "PUT", requestId: "auth-runtime-deactivation-denied" }),
    }), /Privileged account-status authority/);
    const versionBeforeDeactivation = Number((await verification.query("SELECT auth_token_version FROM users WHERE id=$1", [userId])).rows[0].auth_token_version);
    const deactivated = await foundation.setUserActiveStatusWithSessionGovernance({
      actor: { id: userId, role: "admin" },
      subjectUserId: userId,
      isActive: false,
      req: mockRequest({ method: "PUT", requestId: "auth-runtime-deactivation" }),
    });
    assert.equal(deactivated?.isActive, false);
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_sessions WHERE revoked_at IS NULL")).rows[0].value, 0);
    assert.equal(Number((await verification.query("SELECT auth_token_version FROM users WHERE id=$1", [userId])).rows[0].auth_token_version), versionBeforeDeactivation + 1);
    await foundation.setUserActiveStatusWithSessionGovernance({
      actor: { id: userId, role: "admin" },
      subjectUserId: userId,
      isActive: false,
      req: mockRequest({ method: "PUT", requestId: "auth-runtime-deactivation-idempotent" }),
    });
    assert.equal((await verification.query("SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='account.deactivated'")).rows[0].value, 1);
    await foundation.setUserActiveStatusWithSessionGovernance({
      actor: { id: userId, role: "admin" },
      subjectUserId: userId,
      isActive: true,
      req: mockRequest({ method: "PUT", requestId: "auth-runtime-reactivation" }),
    });

    const cutover = await import("../scripts/controlled-auth-session-cutover");
    const tokenVersionBeforeCutover = Number((await verification.query("SELECT auth_token_version FROM users WHERE id=$1", [userId])).rows[0].auth_token_version);
    const rejectedPlan: AuthSessionCutoverPlan = {
      mode: "apply",
      deployedSha: "0c5c37fc41068b380a204fe6f62c6b4b37b96596",
      requestReference: "auth-cutover-runtime-rollback-2026",
      expectedUserCount: 2,
      confirmed: true,
    };
    await assert.rejects(cutover.executeAuthSessionTokenVersionCutover(verification, rejectedPlan), /User count changed/);
    assert.equal(Number((await verification.query("SELECT auth_token_version FROM users WHERE id=$1", [userId])).rows[0].auth_token_version), tokenVersionBeforeCutover);

    const acceptedPlan: AuthSessionCutoverPlan = {
      ...rejectedPlan,
      requestReference: "auth-cutover-runtime-applied-2026",
      expectedUserCount: 1,
    };
    assert.deepEqual(await cutover.executeAuthSessionTokenVersionCutover(verification, acceptedPlan), {
      status: "applied",
      affectedUsers: 1,
      tokenVersionSum: tokenVersionBeforeCutover + 1,
    });
    assert.deepEqual(await cutover.executeAuthSessionTokenVersionCutover(verification, acceptedPlan), {
      status: "already_applied",
      affectedUsers: 0,
      tokenVersionSum: tokenVersionBeforeCutover + 1,
    });
    assert.equal((await verification.query(
      "SELECT count(*)::int AS value FROM auth_security_events WHERE event_type='auth.cutover.legacy_tokens_invalidated' AND request_reference=$1",
      [acceptedPlan.requestReference],
    )).rows[0].value, 1);

    const rawSensitiveMetadata = await verification.query(`SELECT count(*)::int AS value FROM auth_security_events
      WHERE event_metadata::text ~* '(token|password|email|coordinate|storage|user-agent|127\\.0\\.0)'`);
    assert.equal(rawSensitiveMetadata.rows[0].value, 0);
  } finally {
    await verification.end();
    await pool.end();
  }
});
