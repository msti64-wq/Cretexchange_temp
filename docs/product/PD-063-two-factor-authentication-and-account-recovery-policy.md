# PD-063 — Two-Factor Authentication and Account Recovery Policy

- **Decision ID:** PD-063
- **Version:** 1.1
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
| Super Admin | Controlled first | Required only after Founder acceptance | Recovery code first; Jonathan Stiger and Joe Kelly jointly govern break-glass; ordinary recovery retains the 24-hour delay and emergency bypass requires both custodians plus permanent evidence |
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
- Routine Owner/Driver recovery has a one-business-day response target. Admin recovery requires Super Admin plus one authorized recovery approver and a 24-hour delay.
- Custodian designation grants Jonathan Stiger and Joe Kelly no application, database, Railway, GitHub, financial, or Production authority. Contacts, identity documents, credentials, keys, and recovery material are prohibited from repository storage.

## Session and elevation policy

The target final session is server revocable and stored in a Secure, HttpOnly, SameSite cookie; only a resistant token hash is persisted. The current persistent local-storage JWT is not the target 2FA assurance mechanism. Sensitive actions require factor verification within ten minutes. These include factor and password changes, recovery-code regeneration, privileged user/role changes, Production control mutations, and any future financial execution action. Admin and Super Admin have no trusted-device bypass. Financial execution remains separately governed and disabled.

Work Package 0 establishes 24-hour absolute/one-hour idle sessions for Admin/Super Admin and the approved seven-day absolute/24-hour idle policy for Owner/Driver. Password reset/change revokes all sessions. Logout revokes the current session. Role changes and account disablement fail closed. Cutover requires all users to sign in again.

Before activation, every role receives a minimal Security & Sessions page that shows the current session and privacy-safe broad information about other owned sessions. A participant can revoke another session, sign out all other devices, or sign out all devices. Precise IPs, fingerprinting material, and unnecessary device details are prohibited; Admin role does not grant unrestricted access to another user's session metadata.

New or changed passwords must contain 15–128 characters, may contain spaces and supported Unicode, and have no arbitrary composition or periodic-expiry rule. Known compromised/common and account-context-specific choices are rejected locally without transmitting the candidate to a third party. Existing passwords are not force-reset only because policy changed. Password changes and resets revoke existing sessions.

## Key custody and dependency policy

Future TOTP secrets use authenticated encryption with versioned encryption keys held only in Railway secrets and separated from database, JWT, session-hash, and custodian break-glass material. Controlled rotation supports the current and previous key version. Node governed cryptography is preferred where practical. Recovery codes and session/reset tokens are stored only as resistant hashes. `otpauth` is approved in principle as the preferred server-only candidate, but it is not approved for installation until its pinned version, license, maintenance, vulnerability, transitive-dependency, and package-lock evidence pass review.

## Decisions still required

1. Approve the Work Package 0 migration checksum, recovery checkpoint, legacy-token invalidation, Railway secret ceremony, and release/cutover sequence.
2. Confirm Jonathan Stiger and Joe Kelly independently acknowledge the custodian role and receive secure instructions/material outside the repository before privileged enforcement.
3. Assign the authorized Admin-recovery approver role and approve role-specific evidence, escalation thresholds, and recovery test cadence.
4. Complete the pinned `otpauth` and versioned TOTP key-rotation reviews before Work Package 1.

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
| 1.1 | 2026-08-11 | Founder approved final Work Package 0 session limits, password policy, Sessions UI, named joint custodians, service targets, and key-rotation boundaries. |
