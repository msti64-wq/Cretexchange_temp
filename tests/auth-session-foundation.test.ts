import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTH_CSRF_COOKIE,
  AUTH_SESSION_COOKIE,
  SESSION_POLICIES,
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
} from "../server/authSessionSecurity";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

function request(headers: Record<string, string> = {}, protocol = "https") {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    protocol,
    get(name: string) { return normalized[name.toLowerCase()]; },
  } as any;
}

test("session foundation is exact-match default-off", () => {
  assert.equal(isAuthSessionFoundationEnabled({}), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "false" }), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "TRUE" }), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "true" }), true);
});

test("session and CSRF tokens use independent 256-bit opaque values and resistant hashes", () => {
  const pepper = "test-pepper-material-at-least-32-characters";
  const tokens = new Set(Array.from({ length: 100 }, () => createOpaqueAuthenticationToken()));
  assert.equal(tokens.size, 100);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const hash = hashAuthenticationSecret(token, pepper);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash.includes(token), false);
    assert.equal(safeEqualAuthenticationHash(hash, hashAuthenticationSecret(token, pepper)), true);
  }
  assert.throws(() => createOpaqueAuthenticationToken(16), /256 bits/);
  assert.throws(() => getAuthSessionHashPepper({}), /at least 32 characters/);
  assert.throws(() => getAuthSessionHashPepper({ AUTH_SESSION_HASH_PEPPER: "short" }), /at least 32 characters/);
});

test("authentication cookies are same-site and the session token is HttpOnly", () => {
  const session = serializeAuthenticationCookie({
    name: AUTH_SESSION_COOKIE,
    value: "opaque value",
    maxAgeSeconds: 3600,
    httpOnly: true,
    secure: true,
  });
  const csrf = serializeAuthenticationCookie({
    name: AUTH_CSRF_COOKIE,
    value: "csrf value",
    maxAgeSeconds: 3600,
    httpOnly: false,
    secure: true,
  });
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /Secure/);
  assert.doesNotMatch(csrf, /HttpOnly/);
  assert.deepEqual(parseCookieHeader(`${session}; ${AUTH_CSRF_COOKIE}=csrf%20value`)[AUTH_CSRF_COOKIE], "csrf value");
});

test("role session limits match the Founder-approved absolute and inactivity policy", () => {
  assert.deepEqual(getSessionPolicy("super_admin"), { absoluteMs: 86_400_000, inactivityMs: 3_600_000 });
  assert.deepEqual(getSessionPolicy("admin"), { absoluteMs: 86_400_000, inactivityMs: 3_600_000 });
  assert.deepEqual(getSessionPolicy("owner"), { absoluteMs: 604_800_000, inactivityMs: 86_400_000 });
  assert.deepEqual(getSessionPolicy("driver"), { absoluteMs: 604_800_000, inactivityMs: 86_400_000 });
  assert.equal(Object.keys(SESSION_POLICIES).length, 4);
  assert.throws(() => getSessionPolicy("unknown"), /recognized role/);
});

test("public authentication writes reject cross-site origins without blocking same-origin clients", () => {
  assert.equal(isSameOriginAuthenticationRequest(request({
    origin: "https://cretexchange.app",
    host: "cretexchange.app",
    "sec-fetch-site": "same-origin",
  })), true);
  assert.equal(isSameOriginAuthenticationRequest(request({
    origin: "https://evil.example",
    host: "cretexchange.app",
    "sec-fetch-site": "cross-site",
  })), false);
  assert.equal(isSameOriginAuthenticationRequest(request({
    origin: "https://cretexchange.app",
    host: "cretexchange.app",
  })), true);
  assert.equal(isSameOriginAuthenticationRequest(request({ origin: "not a url", host: "cretexchange.app" })), false);
});

test("security event projection excludes secrets and detailed participant/network metadata", () => {
  assert.deepEqual(sanitizeAuthenticationEventMetadata({
    scope: "current_session",
    revokedCount: 3,
    token: "secret",
    passwordHash: "secret",
    email: "private@example.invalid",
    ipAddress: "127.0.0.1",
    userAgent: "browser details",
    coordinates: "30,-97",
    storagePath: "private/file",
  }), { scope: "current_session", revokedCount: 3 });
});

test("0042 is additive, zero-backfill, append-only, retention-governed, and financially isolated", async () => {
  const migration = await source("../migrations/0042_add_revocable_authentication_session_foundation.sql");
  for (const table of ["auth_sessions", "auth_password_reset_tokens", "auth_security_events", "auth_rate_limit_buckets"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /auth_security_events_append_only/);
  assert.match(migration, /minimize_expired_auth_event_network_metadata/);
  assert.match(migration, /purge_expired_auth_security_events/);
  assert.match(migration, /purge_expired_auth_rate_limit_buckets/);
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION|pgcrypto/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+(?:auth_sessions|auth_password_reset_tokens|auth_security_events|auth_rate_limit_buckets)/i);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|ALTER TABLE)\s+(?:payments|wallet_transactions|driver_lottery_entries|notifications|washout_activities|washout_photos)/i);
  assert.doesNotMatch(migration, /totp|mfa_factor|recovery_code/i);
});

test("server wiring supports revocation, reset replay protection, CSRF, rotation, and bounded rate limiting", async () => {
  const [foundation, routes, auth] = await Promise.all([
    source("../server/authSessionFoundation.ts"),
    source("../server/routes.ts"),
    source("../server/tokenAuth.ts"),
  ]);
  assert.match(foundation, /pg_advisory_xact_lock/);
  assert.match(foundation, /consumedAt: now/);
  assert.match(foundation, /revokeAllUserSessions/);
  assert.match(foundation, /session\.csrf_denied/);
  assert.match(foundation, /rotatedFromSessionId/);
  assert.match(foundation, /role_changed/);
  assert.match(foundation, /password_reset\.completed/);
  assert.match(routes, /updatePasswordAndRevokeSessions/);
  assert.match(auth, /\/api\/auth\/sessions\/sign-out-all/);
  assert.match(auth, /consumeAuthenticationRateLimit\("login"/);
  assert.match(auth, /consumeAuthenticationRateLimit\("registration"/);
  assert.match(auth, /consumeAuthenticationRateLimit\("forgot_password"/);
  assert.match(auth, /consumeAuthenticationRateLimit\("reset_password"/);
  assert.match(auth, /isSameOriginAuthenticationRequest/);
});

test("client compatibility sends cookies and CSRF while retiring localStorage token on server-session responses", async () => {
  const [queryClient, authHook, login, register] = await Promise.all([
    source("../client/src/lib/queryClient.ts"),
    source("../client/src/hooks/useAuth.ts"),
    source("../client/src/pages/auth/login.tsx"),
    source("../client/src/pages/auth/register.tsx"),
  ]);
  assert.match(queryClient, /X-CSRF-Token/);
  assert.match(queryClient, /crete_csrf/);
  assert.match(queryClient, /credentials:\s*["']same-origin["']/);
  assert.match(authHook, /await apiRequest\("POST", "\/api\/logout"\)/);
  assert.match(login, /localStorage\.removeItem\(["']authToken["']\)/);
  assert.match(register, /localStorage\.removeItem\(["']authToken["']\)/);
});

test("Work Package 0 introduces no TOTP implementation or dependency", async () => {
  const packageJson = JSON.parse(await source("../package.json")) as { dependencies: Record<string, string> };
  assert.equal(packageJson.dependencies.otpauth, undefined);
  const foundation = await source("../server/authSessionFoundation.ts");
  assert.doesNotMatch(foundation, /otpauth|totp_secret|recovery_codes/i);
});
