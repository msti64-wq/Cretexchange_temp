import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import bcrypt from "bcryptjs";
import { translations } from "../client/src/lib/i18n";
import { FOUNDER_BREAK_GLASS_CUSTODIANS, validateFounderBreakGlassApproval } from "../shared/authRecoveryGovernance";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordPolicy } from "../shared/passwordPolicy";
import {
  hashPasswordForStorage,
  verifyPasswordForAuthentication,
  verifyStoredPassword,
} from "../server/passwordSecurity";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("approved password policy accepts long Unicode passphrases and rejects weak or contextual choices", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 15);
  assert.equal(PASSWORD_MAX_LENGTH, 128);
  assert.deepEqual(validatePasswordPolicy("Rivers cross quietly at dawn 🧱"), { valid: true });
  assert.deepEqual(validatePasswordPolicy("short password").valid, false);
  assert.deepEqual(validatePasswordPolicy("x".repeat(129)).valid, false);
  assert.deepEqual(validatePasswordPolicy("password1234").valid, false);
  assert.deepEqual(validatePasswordPolicy("CreteXchange safe password 2026").valid, false);
  assert.deepEqual(validatePasswordPolicy("Michael builds a lengthy safe phrase", { firstName: "Michael" }).valid, false);
  assert.deepEqual(validatePasswordPolicy("owner42 has a lengthy safe phrase", { username: "owner42" }).valid, false);
});
test("versioned password storage preserves full Unicode input and legacy verification", async () => {
  const composed = "Long passphrase with spaces, accents café, and blocks 🧱🧱";
  const decomposed = composed.normalize("NFD");
  const stored = await hashPasswordForStorage(decomposed);
  assert.match(stored, /^cxpw\$v1\$sha256-bcrypt\$/);
  assert.equal(await verifyStoredPassword(composed, stored), true);
  assert.equal(await verifyStoredPassword(`${composed}!`, stored), false);

  const legacy = await bcrypt.hash("legacy-password-value", 4);
  const legacyVerification = await verifyPasswordForAuthentication("legacy-password-value", legacy);
  assert.equal(legacyVerification.valid, true);
  assert.match(legacyVerification.upgradedHash || "", /^cxpw\$v1\$sha256-bcrypt\$/);
  assert.equal(await verifyStoredPassword("legacy-password-value", legacyVerification.upgradedHash || ""), true);
  assert.deepEqual(await verifyPasswordForAuthentication("wrong", legacy), { valid: false, upgradedHash: null });
  assert.deepEqual(await verifyPasswordForAuthentication(composed, stored), { valid: true, upgradedHash: null });
  assert.equal(await verifyStoredPassword(composed, `cxpw$v2$sha256-bcrypt$${legacy}`), false);
});

test("session UI is own-account scoped, localized, accessible, responsive, and confirmation governed", async () => {
  const [page, app, tokenAuth, adminProfile, ownerProfile, driverProfile] = await Promise.all([
    read("../client/src/pages/security/sessions.tsx"),
    read("../client/src/App.tsx"),
    read("../server/tokenAuth.ts"),
    read("../client/src/pages/admin/profile.tsx"),
    read("../client/src/pages/owner/profile.tsx"),
    read("../client/src/pages/driver/profile.tsx"),
  ]);

  assert.match(app, /path="\/security\/sessions" component=\{SecuritySessions\}/);
  for (const profile of [adminProfile, ownerProfile, driverProfile]) assert.match(profile, /\/security\/sessions/);
  assert.match(page, /aria-labelledby="security-sessions-title"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(page, /overflow-y-auto/);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /AlertDialogCancel/);
  assert.match(page, /sign-out-others/);
  assert.match(page, /sign-out-all/);
  assert.match(page, /session\.current/);
  assert.doesNotMatch(page, /ipAddress|userAgent|fingerprint|coordinates|geometry|storagePath/);
  assert.match(tokenAuth, /listActiveUserSessions\(req\.user\.id, req\.authSessionId\)/);
  assert.match(tokenAuth, /revokeOwnedSessionWithAudit\(\{ user: req\.user/);
  assert.doesNotMatch(tokenAuth, /api\/admin\/.*sessions/);

  for (const language of ["en", "es"] as const) {
    for (const key of [
      "security.sessions.title", "security.sessions.loading", "security.sessions.unavailableTitle",
      "security.sessions.signOutOthers", "security.sessions.signOutAll", "security.sessions.confirmAction",
      "security.sessions.privacyNotice", "password.policy.help",
    ]) assert.ok(translations[language][key], `${language} missing ${key}`);
  }
});

test("CSRF and RBAC remain server authoritative for every session mutation", async () => {
  const [foundation, auth, client] = await Promise.all([
    read("../server/authSessionFoundation.ts"),
    read("../server/tokenAuth.ts"),
    read("../client/src/lib/queryClient.ts"),
  ]);
  assert.match(foundation, /SAFE_METHODS/);
  assert.match(foundation, /CSRF_VALIDATION_FAILED/);
  assert.match(auth, /app\.delete\("\/api\/auth\/sessions\/:sessionId", isAuthenticated/);
  assert.match(auth, /app\.post\("\/api\/auth\/sessions\/sign-out-others", isAuthenticated/);
  assert.match(auth, /app\.post\("\/api\/auth\/sessions\/sign-out-all", isAuthenticated/);
  assert.match(client, /X-CSRF-Token/);
  assert.match(foundation, /eq\(authSessions\.userId, input\.user\.id\)/);
});

test("break-glass governance requires both named custodians without granting credentials", async () => {
  assert.deepEqual(FOUNDER_BREAK_GLASS_CUSTODIANS.map(({ name }) => name), ["Jonathan Stiger", "Joe Kelly"]);
  assert.equal(validateFounderBreakGlassApproval({
    participatingRoles: ["founder_break_glass_custodian_one"],
    emergencyReason: "Documented emergency reason for controlled recovery.",
    subjectApprovedOwnRecovery: false,
  }).valid, false);
  assert.equal(validateFounderBreakGlassApproval({
    participatingRoles: ["founder_break_glass_custodian_one", "founder_break_glass_custodian_two"],
    emergencyReason: "Documented emergency reason for controlled recovery.",
    subjectApprovedOwnRecovery: true,
  }).valid, false);
  assert.deepEqual(validateFounderBreakGlassApproval({
    participatingRoles: ["founder_break_glass_custodian_one", "founder_break_glass_custodian_two"],
    emergencyReason: "Documented emergency reason for controlled recovery.",
    subjectApprovedOwnRecovery: false,
  }), { valid: true });

  const governance = await read("../shared/authRecoveryGovernance.ts");
  assert.doesNotMatch(governance, /@|phone|email|address|credential|secret|token|key\s*:/i);
});

test("governing documents record the final Founder decisions without activating TOTP", async () => {
  const documents = await Promise.all([
    read("../docs/architecture/CTX-ARCH-017-two-factor-authentication-architecture.md"),
    read("../docs/product/PD-063-two-factor-authentication-and-account-recovery-policy.md"),
    read("../docs/operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md"),
    read("../docs/project/phase-5-sprint-3-two-factor-authentication-plan.md"),
    read("../docs/ux/CTX-UX-010-two-factor-authentication-experience.md"),
  ]);
  const combined = documents.join("\n");
  for (const required of [
    "Jonathan Stiger", "Joe Kelly", "seven-day absolute", "24-hour idle", "15–128",
    "one-business-day", "current and previous", "Security & Sessions",
  ]) assert.match(combined, new RegExp(required, "i"));
  assert.match(combined, /not (?:added|install|implemented).*Work Package 0/i);
});
