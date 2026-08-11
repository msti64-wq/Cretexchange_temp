import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  resolveAuthSessionCutoverPlan,
  type AuthSessionCutoverPlan,
} from "../scripts/controlled-auth-session-cutover";
import {
  AUTH_CSRF_COOKIE,
  AUTH_SESSION_COOKIE,
  getAuthSessionHashPepper,
  isAuthSessionFoundationEnabled,
  serializeAuthenticationCookie,
} from "../server/authSessionSecurity";
import { passwordSecurityInternals } from "../server/passwordSecurity";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const sha = "0c5c37fc41068b380a204fe6f62c6b4b37b96596";
const requestReference = "auth-cutover-level4-validation-2026-08-11";
const environment = {
  AUTH_SESSION_CUTOVER_TARGET: "production",
  RAILWAY_ENVIRONMENT_NAME: "production",
  RAILWAY_GIT_COMMIT_SHA: sha,
  AUTH_SESSION_CUTOVER_AUTHORIZATION_SHA: sha,
  AUTH_SESSION_CUTOVER_REQUEST_REFERENCE: requestReference,
};

function plan(mode: "plan" | "count" | "apply", extras: string[] = []): AuthSessionCutoverPlan {
  return resolveAuthSessionCutoverPlan([
    mode,
    "--deployed-sha", sha,
    "--request-reference", requestReference,
    "--expected-user-count", "42",
    ...extras,
  ], environment);
}

test("password prehash format is versioned, NFC domain-separated, strict, and Unicode canonical", () => {
  assert.equal(passwordSecurityInternals.PREHASHED_PASSWORD_PREFIX, "cxpw$v1$nfc-sha256-bcrypt$");
  assert.equal(passwordSecurityInternals.PREHASH_DOMAIN, "CreteXchange password prehash v1 nfc\0");
  const composed = "Café bricks are safe 🧱";
  assert.equal(
    passwordSecurityInternals.prehashPassword(composed),
    passwordSecurityInternals.prehashPassword(composed.normalize("NFD")),
  );
  assert.notEqual(
    passwordSecurityInternals.prehashPassword(composed),
    passwordSecurityInternals.prehashPassword(`${composed}!`),
  );
  assert.notEqual(
    passwordSecurityInternals.prehashPassword("Compatibility ﬀ password remains distinct"),
    passwordSecurityInternals.prehashPassword("Compatibility ff password remains distinct"),
  );
});

test("foundation remains exact default-off and missing pepper fails closed only when enabled", () => {
  assert.equal(isAuthSessionFoundationEnabled({}), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "false" }), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "TRUE" }), false);
  assert.equal(isAuthSessionFoundationEnabled({ AUTH_SESSION_FOUNDATION_ENABLED: "true" }), true);
  assert.throws(() => getAuthSessionHashPepper({}), /32 characters/);
});

test("Production session and clearing cookies use matching narrow host-only policy", () => {
  for (const [name, httpOnly] of [[AUTH_SESSION_COOKIE, true], [AUTH_CSRF_COOKIE, false]] as const) {
    const active = serializeAuthenticationCookie({ name, value: "opaque", maxAgeSeconds: 60, httpOnly, secure: true });
    const cleared = serializeAuthenticationCookie({ name, value: "", maxAgeSeconds: 0, httpOnly, secure: true });
    for (const cookie of [active, cleared]) {
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Secure/);
      assert.doesNotMatch(cookie, /Domain=/);
      assert.equal(cookie.includes("HttpOnly"), httpOnly);
    }
  }
});

test("cutover plan is bounded, exact-SHA authorized, and cannot silently apply", () => {
  assert.deepEqual(plan("plan"), {
    mode: "plan",
    deployedSha: sha,
    requestReference,
    expectedUserCount: 42,
    confirmed: false,
  });
  assert.equal(plan("apply", ["--confirm-production"]).confirmed, true);
  assert.throws(() => resolveAuthSessionCutoverPlan([
    "apply", "--deployed-sha", sha, "--request-reference", requestReference,
    "--expected-user-count", "42", "--force",
  ], environment), /Unsupported cutover option/);
  assert.throws(() => resolveAuthSessionCutoverPlan([
    "plan", "--deployed-sha", sha, "--deployed-sha", sha,
    "--request-reference", requestReference, "--expected-user-count", "42",
  ], environment), /Duplicate cutover option/);
  assert.throws(() => resolveAuthSessionCutoverPlan([
    "plan", "--deployed-sha", sha, "--request-reference", "bad", "--expected-user-count", "42",
  ], environment), /bounded/);
  assert.throws(() => resolveAuthSessionCutoverPlan([
    "plan", "--deployed-sha", sha, "--request-reference", requestReference, "--expected-user-count", "1000001",
  ], environment), /bounded/);
});

test("session routes fail closed, clear invalid logout cookies, and preserve one authentication mode", async () => {
  const [tokenAuth, foundation, routes, cutover] = await Promise.all([
    source("../server/tokenAuth.ts"),
    source("../server/authSessionFoundation.ts"),
    source("../server/routes.ts"),
    source("../scripts/controlled-auth-session-cutover.ts"),
  ]);
  assert.match(tokenAuth, /if \(isAuthSessionFoundationEnabled\(\)\)[\s\S]*authenticateServerSessionRequest/);
  assert.match(tokenAuth, /if \(!auth\.ok\) \{[\s\S]*clearAuthenticationCookies\(res\)/);
  assert.match(tokenAuth, /\(decoded\.authTokenVersion \?\? 0\) !== \(user\.authTokenVersion \?\? 0\)/);
  assert.doesNotMatch(tokenAuth, /sessionMode: "server_cookie"[\s\S]{0,160}\btoken\b/);
  assert.match(foundation, /idleExpiresAt <= now/);
  assert.match(foundation, /absoluteExpiresAt <= now/);
  assert.match(foundation, /eq\(authSessions\.userId, input\.user\.id\)/);
  assert.match(foundation, /setUserActiveStatusWithSessionGovernance/);
  assert.match(routes, /setUserActiveStatusWithSessionGovernance/);
  assert.match(cutover, /UPDATE users SET auth_token_version=auth_token_version\+1/);
  assert.match(cutover, /auth\.cutover\.legacy_tokens_invalidated/);
  assert.match(cutover, /already_applied/);
  assert.doesNotMatch(cutover, /--force|skip|bypass|readdir|glob/);
});

test("Work Package 0 adds no TOTP, recovery-code, QR, or financial behavior", async () => {
  const [packageJson, foundation, cutover, migration] = await Promise.all([
    source("../package.json"), source("../server/authSessionFoundation.ts"),
    source("../scripts/controlled-auth-session-cutover.ts"),
    source("../migrations/0042_add_revocable_authentication_session_foundation.sql"),
  ]);
  const implementation = [foundation, cutover, migration].join("\n");
  assert.doesNotMatch([packageJson, implementation].join("\n"), /otpauth|otpauth:\/\/|totp_secret|recovery_codes|qr_code/i);
  assert.doesNotMatch(implementation, /wallet_transactions|payments|rewards|financial_execution/i);
});
