# PD-063 — Two-Factor Authentication and Account Recovery Policy

- **Decision ID:** PD-063
- **Version:** 1.0
- **Status:** Founder approved; Work Package 0 implementation authorized, activation and Production release not authorized
- **Decision Owner:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal

## Founder decision

CreteXchange will adopt authenticator-application TOTP as its initial second factor, backed by single-use recovery codes, revocable server-side sessions, ten-minute recent-factor elevation for sensitive operations, append-only security audit history, and governed recovery. SMS and email codes are deferred. Passkeys/WebAuthn remain the preferred future phishing-resistant method after a separate architecture and recovery review.

The Founder authorized Work Package 0 session-foundation implementation and validation only on a controlled feature branch. This policy does not authorize TOTP implementation, migration execution, Railway configuration, enrollment, enforcement, merge, deployment, or Production mutation.

## Policy boundaries

1. A password-only success must not create a fully authenticated session for a user whose role is under 2FA enforcement.
2. A pending or failed second-factor challenge grants no application role or participant-data access.
3. TOTP secrets are encrypted at rest and never logged. Recovery codes and session/challenge tokens are stored only as one-way hashes.
4. Recovery codes are single use, shown once, regenerable, and never viewable by Admin or support.
5. Password reset, factor reset, account disablement, or governed security recovery revokes applicable sessions and trusted devices.
6. Admin assistance cannot bypass verification, disclose secret material, or silently disable a factor.
7. Privileged-account recovery requires two-person approval, privacy-safe evidence, complete session revocation, TOTP replacement, a 24-hour delay, append-only audit, and no self-approval. Super Admin break-glass requires two separately controlled, Founder-named custodians.
8. Authentication rate limiting must resist guessing without enabling permanent account-denial attacks.
9. A trusted-device option is not available to Admin or Super Admin during initial rollout. Any later Owner/Driver trust option is explicit, bounded, revocable, and does not use probabilistic fingerprinting.
10. 2FA controls are role-scoped, default-off, independent of Facility geofence controls, and incapable of enabling financial execution.
11. External SMS/email/push delivery remains outside this sprint. No OTP or recovery secret may enter the Notification Center.
12. English and Spanish experiences, keyboard and screen-reader operation, mobile usability, privacy, and safe recovery are release requirements.

13. Routine authentication/security events retain for 24 months; privileged security-control and recovery events retain for seven years; detailed network/device metadata is deleted or minimized within 90 days.

## Approved role rollout

| Role | Enrollment | Enforcement | Recovery authority |
| --- | --- | --- | --- |
| Super Admin | Controlled first | Required only after Founder acceptance | Recovery code first; two-custodian, two-person governed break-glass with 24-hour delay |
| Admin | Controlled after Super Admin | Required after controlled acceptance | Recovery code first; two-person governed reset, no self-approval, 24-hour delay |
| Owner | Opt-in pilot | Required only through a later explicit rollout decision | Recovery code first; governed support request without bypass |
| Driver | Opt-in mobile pilot | Required only through a later explicit rollout decision | Recovery code first; field-safe governed support without bypass |

## Recovery principles

- Lost-device handling begins with an unused recovery code, not identity guesswork by support.
- A recovery request does not itself disable 2FA or create a session.
- The requester must re-establish identity under the role-specific evidence standard approved before enforcement.
- A completed reset revokes the old factor, unused recovery codes, and existing sessions and then requires fresh enrollment.
- Recovery events are neutral, privacy safe, and retained under the approved security-record schedule.
- No participant is labeled malicious merely because verification failed or a device was lost.

## Session and elevation policy

The target final session is server revocable and stored in a Secure, HttpOnly, SameSite cookie; only a resistant token hash is persisted. The current persistent local-storage JWT is not the target 2FA assurance mechanism. Sensitive actions require factor verification within ten minutes. These include factor and password changes, recovery-code regeneration, privileged user/role changes, Production control mutations, and any future financial execution action. Admin and Super Admin have no trusted-device bypass. Financial execution remains separately governed and disabled.

Work Package 0 establishes 24-hour absolute/one-hour idle sessions for Admin/Super Admin and a practical seven-day absolute period for Owner/Driver. A 24-hour Owner/Driver inactivity limit is the implementation recommendation pending cutover acceptance. Password reset/change revokes all sessions. Logout revokes the current session. Role changes and account disablement fail closed. Cutover requires all users to sign in again.

## Key custody and dependency policy

Future TOTP secrets use authenticated encryption with a versioned encryption key held in Railway secrets and separated from database, JWT, and session-hash keys. Node governed cryptography is preferred where practical. Recovery codes and session/reset tokens are stored only as resistant hashes. `otpauth` is the preferred server-only TOTP candidate, but it is not approved for installation until its license, maintenance, and supply-chain evidence pass review.

## Decisions still required

1. Approve the exact Owner/Driver inactivity limit before session cutover.
2. Approve the Work Package 0 migration checksum, recovery checkpoint, legacy-token invalidation, Railway secret ceremony, and release/cutover sequence.
3. Name the two break-glass custodians and the authorized privileged recovery approver roles before TOTP enforcement.
4. Approve role-specific identity evidence, service targets, escalation thresholds, and recovery test cadence.
5. Approve the `otpauth` dependency and versioned TOTP key-rotation procedure before Work Package 1.

## Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [CTX-UX-010](../ux/CTX-UX-010-two-factor-authentication-experience.md)
- [CTX-RB-011](../operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md)
- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)
- [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md)
- [PD-058](./PD-058-notification-and-communication-boundary.md)

## Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-11 | Initial Founder-review proposal; no implementation authority. |
| 1.0 | 2026-08-11 | Founder approved TOTP direction, mandatory session foundation, rollout, elevation, recovery, key custody, and retention policy. |
