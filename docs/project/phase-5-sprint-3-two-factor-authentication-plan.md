# Phase 5 Sprint 3 — Two-Factor Authentication Plan

- **Status:** Founder decisions approved; Work Package 0 implemented and under controlled-branch validation, not activated or deployed
- **Date:** 2026-08-11
- **Starting Production/main SHA:** `ea61706e42b4a028f3378f598371bd28100f0c50`
- **Scope:** Work Package 0 revocable-session and authentication-security foundation only

## Objective

Introduce governed 2FA without recurring SMS dependency, recovery bypasses, inaccessible field workflows, or weakening privacy, RBAC, session integrity, release controls, or financial isolation.

## Discovery conclusion

Authenticator-app TOTP is the approved initial method. Passkeys/WebAuthn are the future phishing-resistant enhancement; SMS/email OTP are deferred. Before enrollment or enforcement, CreteXchange must replace its seven-day local-storage bearer session with a revocable server-side session held by a Secure, HttpOnly, SameSite cookie; add durable security events; and harden password reset/revocation.

No partial MFA service or schema exists. The repository contains only a reusable OTP input component. No transactional email or SMS adapter exists, and the Notification Center does not authorize external delivery.

## Exact recommended sprint sequence

### Work Package 0 — Revocable session and authentication-security foundation — implementation checkpoint

Founder decisions are recorded. Implement exact-match default-off server sessions, opaque token/CSRF cookies, resistant server hashes, approved role-bounded absolute/idle expiry, rotation and revocation, hashed single-use password-reset tokens, token-version invalidation, authentication rate limits, same-origin and CSRF controls, append-only security events, 24-month/seven-year retention, 90-day detailed-network minimization, and session list/revoke APIs plus the minimal English/Spanish Security & Sessions interface. Apply the approved 15–128 character policy to new and changed passwords without forcing existing-password resets.

**Gate:** Level 3 controlled-branch validation; exact migration checksum and Level 4 release authorization remain separate. No TOTP, user enrollment, Production migration, configuration, cutover, merge, or deployment.

### Work Package 1 — TOTP enrollment and recovery codes

Implement encrypted TOTP factors, QR/manual enrollment, verification, single-use hashed recovery codes, Account Security state, English/Spanish, accessibility, and mobile flows. Enrollment flag remains default off.

**Gate:** cryptographic vectors, replay/concurrency, secret-redaction, migration validation, and controlled non-Production enrollment acceptance.

### Work Package 2 — Login challenge and session elevation

Implement password-to-pre-auth flow, TOTP/recovery-code challenge, final session issuance, recent-factor elevation, session list/revocation, and safe rate-limit/lock behavior.

**Gate:** complete auth/RBAC/privacy regression and controlled Super Admin/Admin acceptance with enforcement still off.

### Work Package 3 — Privileged-role controlled rollout

Enable enrollment for one controlled Super Admin, verify recovery readiness, then enable Super Admin enforcement. Repeat for controlled Admin accounts. No trusted-device bypass initially.

**Gate:** Founder confirms enrollment, login, elevation, logout/revocation, recovery-code use, lost-device procedure, English/Spanish, accessibility, mobile/desktop, and no Production lockout.

### Work Package 4 — Owner and Driver opt-in pilot

Enable opt-in enrollment only after privileged acceptance. Validate physical-mobile field use and role-specific recovery. Do not make either role mandatory without a separate Founder decision and readiness evidence.

**Gate:** support capacity, recovery timing, participant communication, and Founder acceptance by role.

### Work Package 5 — Enforcement expansion or passkey discovery

Founder chooses whether to require 2FA for Owner/Driver, retain opt-in, or begin a separately governed WebAuthn/passkey discovery. Email/SMS remain out of scope unless explicitly approved with provider, cost, privacy, and recovery analysis.

## Additive migration and release sequence

1. Complete Level 3 branch validation: disposable PostgreSQL rollback/reapplication, constraints, indexes, concurrency, append-only audit, retention functions, zero inferred backfill, focused security tests, TypeScript, Production build, full suite, privacy/RBAC/workflow/financial review, and exact checksum.
2. Obtain Founder approval of the final branch SHA, migration checksum, Railway session-hash key ceremony, legacy-token invalidation operation, recovery checkpoint, cutover window, and rollback command sequence. The seven-day absolute/24-hour idle Owner/Driver policy is approved.
3. Create and verify a permanent governed Production database recovery checkpoint.
4. Apply checksum-approved migration `0042` through a separately approved controlled runner; verify all four tables, constraints, indexes, functions, trigger, and zero rows.
5. Merge and deploy the exact validated SHA with `AUTH_SESSION_FOUNDATION_ENABLED` absent/false. No behavior changes at this step.
6. Verify GitHub/Railway/version alignment, health, database, financial isolation, legacy login/workflows, zero session-foundation rows, and disabled state.
7. In a separate Founder-authorized cutover, configure the independent hash pepper, increment all user `auth_token_version` values in a bounded transaction, enable the session path, and require every user to sign in again.
8. Verify login, logout, expiry, password reset/change, session rotation/revocation, CSRF, rate limits, role/Facility access, Owner/Driver/Admin/Super Admin workflows, English/Spanish, accessibility/mobile, notifications/geofence, and financial isolation.
9. Founder accepts or invokes immediate rollback: disable the session path, redeploy the accepted prior compatible SHA, preserve the token-version increment so old JWTs stay invalid, and require fresh legacy sign-in. Retain additive tables and audit history.
10. Only after Work Package 0 acceptance, separately authorize TOTP dependency/schema implementation, controlled enrollment, and later role enforcement.

## Required test matrix

- password, reset, logout, inactive user, token/session revocation, and role regressions;
- TOTP vectors, clock skew, replay, concurrency, expiry, attempt limits, and constant-safe verification;
- recovery-code generation, hashing, one-time use, regeneration, and concurrency;
- encryption/key-version behavior and zero secret leakage in logs, analytics, notifications, URLs, screenshots, or API reads;
- pre-auth challenge purpose, expiry, consumption, and no premature role access;
- session creation, expiry, elevation, individual/all revocation, password/factor reset invalidation;
- Admin-assistance separation, missing/invalid context, and fail-closed recovery;
- English/Spanish, mobile/desktop, keyboard, screen reader, focus, text enlargement, reduced motion, and keyboard-open layouts;
- migration rollback/reapplication, indexes, unique constraints, append-only audit, and zero backfill;
- privacy, RBAC, notification isolation, geofence regression, and financial isolation.

## Production constraints

- No external delivery provider is required or authorized for the initial method.
- Secrets must be configured directly in the governed Production environment and never copied into chat, source, build output, docs, logs, or reports.
- No Production enrollment or enforcement occurs during deployment of the foundation.
- Financial execution remains disabled and no 2FA event creates payment, wallet, reward, settlement, or eligibility behavior.
- No migration runs without a permanent recovery checkpoint and exact checksum authorization.
- Founder-visible behavior and explicit Founder acceptance are release gates in addition to code, GitHub, Railway, and version alignment.
- Work Package 0 introduces no dependency change. `otpauth` remains a future candidate pending final license, maintenance, and supply-chain approval.

## Founder decisions recorded

1. TOTP initial; Passkeys/WebAuthn future; SMS/email OTP deferred.
2. Revocable HttpOnly server-session modernization mandatory as Work Package 0.
3. Super Admin then Admin; Owner/Driver opt-in until separately approved.
4. Ten-minute recent-verification window and no privileged trusted-device bypass.
5. Single-use hashed recovery codes; privileged two-person, no-self-approval recovery; 24-hour delay; two-custodian Super Admin break-glass.
6. Versioned Railway-held authenticated encryption for TOTP secrets; Node crypto preferred; resistant hashes for recovery/session material; `otpauth` preferred pending review.
7. Routine events 24 months; privileged events seven years; detailed network/device data no more than 90 days.
8. Owner/Driver sessions use a seven-day absolute and 24-hour inactivity limit.
9. Work Package 0 includes a minimal privacy-safe Sessions page and a 15–128 character password policy with spaces/Unicode, local compromised/context checks, no composition rule, and no periodic reset.
10. Routine Owner/Driver recovery targets one business day; Admin recovery uses Super Admin plus one authorized approver with a 24-hour delay.
11. Jonathan Stiger and Joe Kelly are the two independent joint Founder/Super Admin break-glass custodians; designation grants no system access and activation awaits separate acknowledgment and out-of-band preparation.
12. Future TOTP keys use versioned Railway-held authenticated encryption with current/previous key support; no key is generated in Work Package 0.

## Remaining Founder decisions

1. Approve the exact Work Package 0 SHA, migration checksum, controlled runner update if needed, recovery checkpoint, Railway hash-pepper ceremony, legacy-token invalidation transaction, release/cutover window, and rollback sequence.
2. Confirm both custodians acknowledge their roles and receive secure out-of-band instructions/material before privileged enforcement.
3. Assign the authorized Admin-recovery approver role and approve evidence standards, escalation thresholds, and periodic test cadence.
4. Before Work Package 1, complete the pinned `otpauth` license, maintenance, vulnerability, transitive-dependency, and package-lock review and approve the key-rotation ceremony.

## Explicitly not authorized

TOTP/recovery-code implementation, new dependencies, Production migration/configuration, email/SMS delivery, user contact, enrollment, enforcement, merge, deployment, Production session revocation/data mutation, financial execution, or any renewed geofence work.

## Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-UX-010](../ux/CTX-UX-010-two-factor-authentication-experience.md)
- [CTX-RB-011](../operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md)
