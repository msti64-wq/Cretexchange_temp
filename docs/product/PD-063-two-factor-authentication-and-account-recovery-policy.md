# PD-063 — Two-Factor Authentication and Account Recovery Policy

- **Decision ID:** PD-063
- **Version:** 0.1
- **Status:** Proposed — Founder decision required; not implementation authority
- **Decision Owner:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal

## Decision proposed

CreteXchange should adopt authenticator-application TOTP as its initial second factor, backed by single-use recovery codes, revocable server-side sessions, recent-authentication elevation for sensitive operations, append-only security audit history, and governed recovery. SMS and email codes should not be initial factors. Passkeys/WebAuthn should remain the preferred future phishing-resistant method after a separate architecture and recovery review.

This proposal is discovery output. It does not authorize implementation, dependency changes, migration, configuration, enrollment, enforcement, delivery-provider activation, merge, or deployment.

## Policy boundaries

1. A password-only success must not create a fully authenticated session for a user whose role is under 2FA enforcement.
2. A pending or failed second-factor challenge grants no application role or participant-data access.
3. TOTP secrets are encrypted at rest and never logged. Recovery codes and session/challenge tokens are stored only as one-way hashes.
4. Recovery codes are single use, shown once, regenerable, and never viewable by Admin or support.
5. Password reset, factor reset, account disablement, or governed security recovery revokes applicable sessions and trusted devices.
6. Admin assistance cannot bypass verification, disclose secret material, or silently disable a factor.
7. Privileged-account recovery requires separation of duties and append-only evidence. A Super Admin break-glass process requires explicit Founder approval.
8. Authentication rate limiting must resist guessing without enabling permanent account-denial attacks.
9. A trusted-device option is not available to Admin or Super Admin during initial rollout. Any later Owner/Driver trust option is explicit, bounded, revocable, and does not use probabilistic fingerprinting.
10. 2FA controls are role-scoped, default-off, independent of Facility geofence controls, and incapable of enabling financial execution.
11. External SMS/email/push delivery remains outside this sprint. No OTP or recovery secret may enter the Notification Center.
12. English and Spanish experiences, keyboard and screen-reader operation, mobile usability, privacy, and safe recovery are release requirements.

## Role rollout proposed

| Role | Enrollment | Enforcement | Recovery authority |
| --- | --- | --- | --- |
| Super Admin | Controlled first | Required only after Founder acceptance | Offline recovery code first; separately approved break-glass process |
| Admin | Controlled after Super Admin | Required after controlled acceptance | Recovery code first; Super Admin-governed reset with separation of duties |
| Owner | Opt-in pilot | Required only through a later explicit rollout decision | Recovery code first; governed support request without bypass |
| Driver | Opt-in mobile pilot | Required only through a later explicit rollout decision | Recovery code first; field-safe governed support without bypass |

## Recovery principles

- Lost-device handling begins with an unused recovery code, not identity guesswork by support.
- A recovery request does not itself disable 2FA or create a session.
- The requester must re-establish identity under an approved evidence standard that is not documented yet and requires Founder approval.
- A completed reset revokes the old factor, unused recovery codes, and existing sessions and then requires fresh enrollment.
- Recovery events are neutral, privacy safe, and retained under the approved security-record schedule.
- No participant is labeled malicious merely because verification failed or a device was lost.

## Session and elevation policy proposed

The target final session is server revocable and stored in a Secure, HttpOnly cookie. The current persistent local-storage JWT is not the target 2FA assurance mechanism. Sensitive actions require recent factor verification, proposed at ten minutes. These include factor and password changes, recovery-code regeneration, privileged user/role changes, Production control mutations, and any future financial execution action. Financial execution remains separately governed and disabled.

## Decisions still required

1. Approve TOTP as the initial factor.
2. Approve server-side HttpOnly session modernization before enforcement.
3. Approve which roles become mandatory in Phase 5 Sprint 3; recommendation: Super Admin and Admin only after controlled acceptance, with Owner and Driver opt-in.
4. Approve recovery identity proof, privileged reset approvers, delay, and Founder break-glass custody.
5. Approve the ten-minute elevation window and no trusted-device bypass for privileged roles.
6. Approve the additive schema and encryption-key custody before migration implementation.
7. Approve retention periods for challenges, sessions, trusted devices, and security events under CTX-POL-003.

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
