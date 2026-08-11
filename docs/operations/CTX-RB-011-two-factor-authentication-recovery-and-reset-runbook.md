# CTX-RB-011 — Two-Factor Authentication Recovery and Reset Runbook

- **Document ID:** CTX-RB-011
- **Version:** 0.2
- **Status:** Founder-approved recovery policy; procedure not operational until named authorities and TOTP release
- **Owner:** CreteXchange Operations and Security
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner

## 1. Purpose and current limitation

This runbook records the Founder-approved response to a lost authenticator device, exhausted recovery codes, suspected factor compromise, locked challenge, and privileged-account recovery. It is not yet operational: human custodians, evidence standards, access roles, and TOTP release must be separately approved. It never authorizes an Admin to reset or bypass 2FA unilaterally.

## 2. Recovery order

1. Use one unused recovery code through the normal authenticated recovery flow.
2. If no recovery code is available, create a governed assistance request without disabling the factor.
3. Verify the request under the role-specific Founder-approved identity-proof standard.
4. For Admin/Super Admin, require two-person approval, no self-approval, privacy-safe evidence, and a 24-hour delay. For Super Admin break-glass, both separately controlled custodians must participate.
5. Complete reset atomically: disable the old factor, revoke unused recovery codes, revoke all sessions/trusted devices, append the security event, and require fresh enrollment.
6. Confirm the participant can enroll and store new recovery codes without exposing them to support staff.

## 3. Prohibited support actions

Support and administrators must not:

- request a password, TOTP secret, current TOTP, recovery code, raw session token, or secret screenshot;
- read or generate recovery codes for a participant;
- directly edit factor/session rows;
- disable a factor merely because a request exists;
- use email or SMS as an improvised factor;
- create a bypass session or extend a pre-authentication challenge;
- reduce RBAC, privacy, financial, release, or audit controls; or
- describe verification failure as fraud or misconduct without a separately authorized finding.

## 4. Role-specific handling

| Role | Approved minimum handling |
| --- | --- |
| Driver | Recovery code first; governed identity proof and support reset; all sessions revoked; mobile reenrollment required. |
| Owner | Recovery code first; identity proof must include approved account/Facility authority evidence without exposing private Facility data; all sessions revoked. |
| Admin | Recovery code first; two authorized reviewers, no self-approval, privacy-safe evidence, 24-hour delay, high-priority audit, TOTP replacement, and all sessions revoked. |
| Super Admin | Recovery code first; two Founder-named, separately controlled break-glass custodians; no self-approval or single-person reset; 24-hour delay; all sessions revoked. |

The 24-hour delay and separation rules are approved. Exact evidence, approver-role mapping, human custodian names, service target, and escalation channel remain unresolved and must be approved before this runbook can become operational.

## 5. Work Package 0 password and session recovery

Work Package 0 provides the foundation for password recovery before TOTP exists:

1. Password-reset values are generated with at least 256 bits of entropy and stored only as HMAC-SHA-256 hashes.
2. A reset token expires after one hour, is single use, and is serialized with an advisory lock so replay and concurrent use fail.
3. A new reset request revokes prior unused reset tokens for that user.
4. Password reset increments `auth_token_version`, revokes all active server sessions, consumes the token, and appends a privacy-safe event in one transaction.
5. Authenticated password change increments the token version, revokes all sessions, and creates a rotated replacement session in one transaction.
6. Login, registration, forgot-password, and reset requests have temporary principal/network rate limits. Limits expire and do not permanently lock an account.
7. No Production reset delivery adapter is added. Development-only token return remains limited to the existing development environment behavior.

No Work Package 0 route is active until the exact-match session-foundation control is separately enabled.

## 6. Suspected compromise

Follow [CTX-POL-004](../standards/CTX-POL-004-incident-response-policy.md) and [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md). Preserve privacy-safe evidence, revoke sessions/factors under authorized incident scope, rotate affected secrets when required, and do not destroy audit history. A TOTP failure alone is not proof of compromise.

## 7. Rate-limit and lock recovery

A challenge lock expires or requires a fresh password phase; it is not a permanent account lock. Support may explain the cooldown and restart path but cannot clear attempts by editing data. Repeated or distributed attempts are escalated as a security signal under the incident process.

## 8. Verification checklist

- [ ] Request reference exists and contains no secret.
- [ ] Participant identity was verified under an approved standard.
- [ ] Required approver(s) and delay were satisfied.
- [ ] Old factor disabled; no secret disclosed.
- [ ] Unused recovery codes revoked.
- [ ] Every existing session and trusted device revoked.
- [ ] Append-only event records request, approval, completion, and actor-safe references.
- [ ] Fresh enrollment is required before a final enforced session.
- [ ] English/Spanish and accessible recovery guidance is available.
- [ ] No financial execution or unrelated participant/workflow record changed.

## 9. Rollback and emergency posture

If the 2FA service is unavailable, do not bypass an enforced factor. The governed operational response is to disable the applicable enforcement feature control only under explicit Founder emergency authority, preserve enrollment and audit data, restore service, and require normal verification. Admin role alone does not authorize the change.

For the future Work Package 0 cutover, first create and verify a permanent database recovery checkpoint. Increment every user's legacy `auth_token_version` in the separately authorized bounded cutover transaction, deploy the exact accepted session-foundation SHA/configuration, and require fresh sign-in. Immediate rollback disables the foundation control and redeploys the accepted prior compatible SHA without reversing the token-version increment. This prevents rollback from reviving a pre-cutover JWT. Preserve the additive tables and audit history; do not drop migration `0042` as the first recovery action.

## 10. Founder decisions required

1. Assign exact recovery approval/revocation roles under CTX-POL-008 and name both break-glass custodians.
2. Define privacy-safe identity-proof evidence by role.
3. Define the recovery service target, escalation channel, and periodic test cadence.
4. Approve incident-escalation thresholds.
5. Approve whether any Owner/Driver trusted-device recovery is allowed in a later work package.

## 11. Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)
- [CTX-POL-004](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md)
- [CTX-RB-004](./CTX-RB-004-database-recovery-runbook.md)

## 12. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-11 | Initial discovery-stage runbook; procedure not operational. |
| 0.2 | 2026-08-11 | Recorded Founder-approved recovery, separation, 24-hour delay, retention, Work Package 0 reset/session behavior, and cutover recovery plan. |
