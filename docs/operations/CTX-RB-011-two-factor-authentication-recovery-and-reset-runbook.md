# CTX-RB-011 — Two-Factor Authentication Recovery and Reset Runbook

- **Document ID:** CTX-RB-011
- **Version:** 0.1
- **Status:** Draft — procedure not operational; Founder approval required
- **Owner:** CreteXchange Operations and Security
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal
- **Approval Authority:** To be assigned before implementation

## 1. Purpose and current limitation

This draft defines the proposed response to a lost authenticator device, exhausted recovery codes, suspected factor compromise, locked challenge, and privileged-account recovery. It is not an operational procedure and does not authorize an Admin to reset or bypass 2FA.

## 2. Recovery order

1. Use one unused recovery code through the normal authenticated recovery flow.
2. If no recovery code is available, create a governed assistance request without disabling the factor.
3. Verify the request under the Founder-approved identity-proof standard.
4. Apply required separation of duties and delay for Admin/Super Admin accounts.
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

| Role | Proposed minimum handling |
| --- | --- |
| Driver | Recovery code first; governed identity proof and support reset; all sessions revoked; mobile reenrollment required. |
| Owner | Recovery code first; identity proof must include approved account/Facility authority evidence without exposing private Facility data; all sessions revoked. |
| Admin | Recovery code first; Super Admin approval and second authorized reviewer; delay and high-priority audit; all sessions revoked. |
| Super Admin | Offline recovery code first; Founder-approved break-glass custodian and second reviewer; no single-person reset. |

The exact evidence, approver identities, delay, service-level target, and escalation channel are unresolved and must be approved before this runbook can become operational.

## 5. Suspected compromise

Follow [CTX-POL-004](../standards/CTX-POL-004-incident-response-policy.md) and [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md). Preserve privacy-safe evidence, revoke sessions/factors under authorized incident scope, rotate affected secrets when required, and do not destroy audit history. A TOTP failure alone is not proof of compromise.

## 6. Rate-limit and lock recovery

A challenge lock expires or requires a fresh password phase; it is not a permanent account lock. Support may explain the cooldown and restart path but cannot clear attempts by editing data. Repeated or distributed attempts are escalated as a security signal under the incident process.

## 7. Verification checklist

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

## 8. Rollback and emergency posture

If the 2FA service is unavailable, do not bypass an enforced factor. The governed operational response is to disable the applicable enforcement feature control only under explicit Founder emergency authority, preserve enrollment and audit data, restore service, and require normal verification. Admin role alone does not authorize the change.

## 9. Founder decisions required

1. Assign recovery approval and revocation authorities under CTX-POL-008.
2. Define identity-proof evidence by role.
3. Define privileged-account separation, delay, and second approver.
4. Define offline Super Admin break-glass custody and test cadence.
5. Approve retention periods and incident-escalation thresholds.
6. Approve whether any Owner/Driver trusted-device recovery is allowed in a later work package.

## 10. Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)
- [CTX-POL-004](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md)
- [CTX-RB-004](./CTX-RB-004-database-recovery-runbook.md)

## 11. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-11 | Initial discovery-stage runbook; procedure not operational. |
