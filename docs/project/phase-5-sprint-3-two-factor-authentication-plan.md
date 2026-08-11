# Phase 5 Sprint 3 — Two-Factor Authentication Plan

- **Status:** Discovery complete; implementation not authorized
- **Date:** 2026-08-11
- **Starting Production/main SHA:** `ea61706e42b4a028f3378f598371bd28100f0c50`
- **Scope:** Documentation and Founder decision checkpoint only

## Objective

Introduce governed 2FA without recurring SMS dependency, recovery bypasses, inaccessible field workflows, or weakening privacy, RBAC, session integrity, release controls, or financial isolation.

## Discovery conclusion

Authenticator-app TOTP is the recommended initial method. Before enrollment or enforcement, CreteXchange should replace its seven-day local-storage bearer session with a revocable server-side session held by a Secure, HttpOnly cookie; add durable authentication challenges and security events; harden password-reset revocation; and approve recovery authority.

No partial MFA service or schema exists. The repository contains only a reusable OTP input component. No transactional email or SMS adapter exists, and the Notification Center does not authorize external delivery.

## Exact recommended sprint sequence

### Work Package 0 — Founder security decisions and session foundation

Approve TOTP, session modernization, role rollout, recovery authority, elevation window, key custody, retention, and dependency shortlist. Implement server-side revocable sessions, short-lived pre-auth challenges, password/reset token hardening, token-version/session revocation, login/recovery rate limits, and append-only security events behind default-off flags.

**Gate:** isolated security review, migration design approval, and no user enrollment.

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

1. Approve architecture, policy, UX, runbook, entity names, constraints, encryption key custody, and retention.
2. Create a controlled feature branch; add migration and default-off flags only with implementation scope.
3. Validate in disposable PostgreSQL: checksum, constraints, indexes, append-only protection, transaction rollback, clean reapplication, and zero inferred enrollment/backfill.
4. Run focused security tests, complete auth/RBAC regression, TypeScript, Production build, privacy/log review, localization/accessibility checks, and dependency audit.
5. Create and verify the governed Production recovery checkpoint.
6. Execute the checksum-approved migration through the controlled runner; verify zero factors, codes, challenges, sessions, trusted devices, and events except explicitly expected migration metadata.
7. Merge exact validated content and deploy with every MFA flag disabled.
8. Verify SHA alignment, health, database, financial isolation, default-off behavior, and password-login regression.
9. Separately authorize controlled enrollment, then separately authorize role enforcement.
10. Preserve rollback ability by disabling role enforcement while retaining factors, sessions, and audit history.

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

## Founder decisions required before implementation

1. TOTP as the initial method.
2. HttpOnly server-session modernization as Work Package 0.
3. Super Admin then Admin mandatory rollout; Owner/Driver opt-in during this sprint.
4. Ten-minute recent-verification window and no privileged trusted-device bypass.
5. Recovery identity proof, approvers, delay, and Super Admin break-glass custody.
6. Encryption-key custody/rotation and approved library shortlist.
7. Data retention periods and authentication-security event access.
8. Exact implementation branch, migration checkpoint, and validation level.

## Explicitly not authorized

Authentication code changes, new dependencies, migrations, configuration, email/SMS delivery, user contact, enrollment, enforcement, merge, deployment, Production data mutation, financial execution, or any renewed geofence work.

## Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-UX-010](../ux/CTX-UX-010-two-factor-authentication-experience.md)
- [CTX-RB-011](../operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md)
