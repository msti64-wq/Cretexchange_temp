# CTX-ARCH-017 — Two-Factor Authentication Architecture

- **Document ID:** CTX-ARCH-017
- **Version:** 0.3
- **Status:** Founder-approved direction; Work Package 0 implemented on a controlled branch, not activated or deployed
- **Owner:** CreteXchange Product, Security, and Engineering
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Next Review:** Work Package 0 Level 4 release checkpoint

## 1. Purpose and authority boundary

This architecture defines the Founder-approved Phase 5 Sprint 3 Two-Factor Authentication (2FA) direction. Authenticator-app TOTP is the initial factor, Passkeys/WebAuthn are the future phishing-resistant enhancement, and SMS/email OTP are deferred. Revocable server sessions are mandatory Work Package 0 before any TOTP enrollment.

The Founder authorized implementation and validation of Work Package 0 only on a controlled feature branch. This authority does not include TOTP, enrollment, enforcement, merge, deployment, Production migration, Railway secret changes, Production session revocation, or Production data changes.

## 2. Current-state inventory

The active application authentication path is `server/tokenAuth.ts`, registered by `server/routes.ts`.

| Concern | Current implementation | Finding |
| --- | --- | --- |
| Primary login | Username/password with bcrypt comparison | Password is the only active factor. |
| Session credential | Signed JWT containing user ID, username, and `authTokenVersion` | Seven-day bearer lifetime; no refresh-token or device-session ledger. |
| Browser storage | Client stores the bearer JWT in `localStorage` | A script running in the origin can read the long-lived token; this is insufficient as the target 2FA session design. |
| Authentication secrets/configuration | Mandatory `JWT_SECRET` is validated for minimum strength; alternate session modules also reference a session secret | New TOTP encryption keys and session-token controls require separate governed secrets and rotation; values must never enter source, docs, logs, screenshots, or reports. |
| Request authentication | Bearer token; server reloads user, active status, and token version | Current-request authorization is server checked and role based. |
| Revocation | Per-user `auth_token_version` comparison | Capable of revoking all JWTs, but password change/reset does not currently increment the version. |
| Logout | Client removes its token; server logout has no session record to revoke | No server-side individual-session revocation. |
| Password recovery | One-hour random reset token in `password_reset_tokens` | Token is stored directly, not as a one-way hash; no Production email delivery adapter exists. |
| Password policy | Minimum length of six in current change/reset paths | Requires separate hardening approval; 2FA must not be used to justify a weak first factor. |
| Rate limiting | No login, reset, or MFA challenge limiter found | Withdrawal-specific limiting does not protect authentication. |
| Lockout | No failed-login ledger or governed lockout model found | Must avoid both unlimited guessing and denial-of-service account locking. |
| Security audit | General logs with shared redaction; no append-only authentication security-event domain | Console logs are not a durable security audit trail. |
| Roles | `driver`, `owner`, `admin`, `super_admin` | Public registration is limited to Driver and Owner; privileged roles require governed creation. |
| OTP UI | `input-otp` presentational component and dependency already exist | No OTP, TOTP, MFA, WebAuthn, passkey, or recovery-code service/schema exists. |
| Alternate auth modules | `server/localAuth.ts` and `server/replitAuth.ts` | Not the active Production path. The insecure development cookie settings in `localAuth.ts` must never be promoted or reused without correction. |
| Email/SMS | No transactional email or SMS provider integration found | In-app Notification Center explicitly defers external delivery adapters. |

### 2.1 Work Package 0 branch state

The controlled branch adds an inactive compatibility path that replaces the browser bearer credential with an opaque server session only when `AUTH_SESSION_FOUNDATION_ENABLED` equals `true`. It is false when absent and is not configured for Production. The server stores HMAC-SHA-256 hashes of session, CSRF, reset, rate-limit, and bounded network keys; the raw session token exists only in a Secure, HttpOnly, SameSite cookie. The companion CSRF cookie is readable only so the browser can submit the double-submit header. No TOTP factor or secret exists in Work Package 0.

Session policy is 24-hour absolute/one-hour idle for Admin and Super Admin, and the Founder-approved seven-day absolute/24-hour idle policy for Owner and Driver. A localized, responsive Security & Sessions page lists only the signed-in user's privacy-safe session summaries and supports revoking another session, all other sessions, or all sessions. No Admin receives an unrestricted cross-user session browser.

New and changed passwords use the Founder-approved 15–128 character policy, permit spaces and supported Unicode, impose no composition or periodic-change rule, and reject a deterministic local set of compromised/common choices plus context-specific values derived from the account. Existing hashes remain verifiable and are not force-reset solely for the policy change. New hashes prehash the complete UTF-8 password with SHA-256 before bcrypt so bcrypt's input boundary cannot silently truncate long or multibyte passwords; the stored format is version-marked for legacy compatibility.

## 3. Recommended initial method

Authenticator-application Time-based One-Time Passwords (TOTP) are the recommended initial second factor.

TOTP provides an offline, standards-based factor without recurring SMS expense, carrier dependence, SIM-swap exposure, or coupling recovery to the same email account. Enrollment uses a standard `otpauth://` URI and QR code plus a one-time manual secret display. The server verifies codes using RFC 6238-compatible behavior, a narrow clock-skew window, constant-time comparison where applicable, replay prevention, bounded attempts, and no secret or code logging.

### Alternatives

| Method | Strengths | Risks and disposition |
| --- | --- | --- |
| Authenticator-app TOTP | No per-message cost; offline; mature ecosystem; suitable across roles | Susceptible to real-time phishing and lost-device support. **Recommended initial method.** |
| Email one-time code | Familiar and inexpensive when a trusted delivery service exists | No provider exists; inbox compromise and email recovery become the 2FA recovery boundary. Defer as a separately governed fallback, not the initial factor. |
| SMS one-time code | Broad familiarity | Recurring cost, SIM swapping, number reassignment, delivery failures, and support burden. Not recommended. |
| Passkeys/WebAuthn | Phishing resistant and strong device-bound assurance | Requires RP ID/origin governance, credential lifecycle, device/cross-platform acceptance, recovery design, and library review. Recommended future method after the TOTP foundation, not the first sprint. |

## 4. Target authentication and session flow

1. Username/password verification creates a short-lived, single-purpose pre-authentication challenge. It does not create a fully authenticated application session for an enforced user.
2. The user supplies a TOTP or one unused recovery code.
3. Successful verification atomically consumes the challenge, records the factor event, and creates the final server-governed session.
4. The final session carries an assurance level and `mfaVerifiedAt`. Sensitive actions require the Founder-approved ten-minute recent-factor elevation window.
5. Logout, password reset, factor reset, role change, account disablement, or security recovery can revoke one or all server-side sessions.

The preferred final credential is an opaque, high-entropy session token stored only in a `Secure`, `HttpOnly`, appropriately `SameSite` cookie. The database stores only a one-way token hash and bounded device/session metadata. This replaces persistent local-storage bearer use for the final authenticated session. If engineering review proposes short-lived access tokens instead, the refresh credential must still be HttpOnly, rotated, replay-detected, and backed by a revocable server ledger. A second prompt layered onto the existing seven-day local-storage JWT is not an acceptable target.

## 5. Additive data model

Migration `0042_add_revocable_authentication_session_foundation.sql` is additive, creates no rows, performs no inferred backfill, and does not alter existing workflow or financial tables.

| Entity | Minimum purpose and controls |
| --- | --- |
| `auth_sessions` | User, unique opaque-token hash, CSRF-token hash, role snapshot, broad device label, bounded keyed network reference, created/last-seen/idle/absolute/MFA/revocation timestamps, reason, and rotation predecessor. |
| `auth_password_reset_tokens` | Unique reset-token hash, user, bounded request reference, bounded keyed network reference, expiry, consumption, revocation, and creation time. Raw reset tokens are never stored. |
| `auth_security_events` | Append-only privacy-safe event, result/reason, actor/subject/session references, request reference, retention class/deadline, 90-day network-metadata deadline, allowlisted metadata, and creation time. |
| `auth_rate_limit_buckets` | Unique action/key hash, bounded window and attempts, temporary block, retention deadline, and update time. It contains no raw username, email, address, or token. |

The migration adds exact checks, foreign keys, unique constraints, expiry/order checks, bounded indexes, an append-only event trigger, governed 90-day network minimization, retention purge, and rate-bucket purge functions. `auth_security_events` uses 24-month routine or seven-year privileged retention. Detailed network/device material is minimized or deleted after no more than 90 days.

Future TOTP work packages may add `user_mfa_factors`, `mfa_recovery_codes`, and `auth_challenges` only through a separately approved migration. Work Package 0 does not create these entities.

The migration creates no session, reset token, audit event, rate bucket, enrolled factor, recovery code, trusted device, or enforced user. It requires an approved checksum, disposable-PostgreSQL validation, rollback and clean-reapplication evidence, and a governed Production recovery checkpoint before any Production execution.

## 6. Secret and cryptographic controls

- Work Package 0 uses Node's governed `node:crypto` primitives: at least 256 bits from `randomBytes`, HMAC-SHA-256 domain-separated hashes, and constant-time hash comparison.
- Generate future TOTP secrets and recovery codes with the platform cryptographic random source.
- Encrypt TOTP secrets at rest with an application encryption key separate from the database and JWT/session secrets; record a key version for rotation.
- Store recovery codes and session/challenge tokens only as one-way hashes with domain separation.
- Display the TOTP secret and recovery codes only during the governed one-time flow; never return them in later reads.
- Never put authentication secrets or codes in notification metadata, URLs, analytics, logs, screenshots, support messages, or audit metadata.
- Prevent acceptance of the same TOTP time step more than once for the same factor/challenge.
- Keep server time monitored; fail safely when clock integrity cannot be trusted.
- `otpauth` remains the preferred server-only TOTP candidate, subject to final license, maintenance, dependency, and supply-chain review. It is not added by Work Package 0.
- Future TOTP authenticated-encryption keys are versioned Railway secrets. The reader must support the current and immediately previous version during a controlled rotation. No Production key is generated or configured by Work Package 0.

## 7. Rate limiting and lockout protection

Rate limits apply independently to password login, challenge creation, TOTP verification, recovery-code verification, reset requests, and Admin-assisted recovery. Controls combine account-safe keyed identifiers, network-level limits, challenge attempt limits, progressive delay, and short challenge expiry.

A failed challenge is locked or expires without permanently locking the account. Responses remain generic to prevent account enumeration. Repeated failure creates a privacy-safe security event and may revoke the challenge or require restarting password verification. Administrative unlock does not bypass the factor.

## 8. Enrollment, recovery, and reset

- Enrollment requires a recent password reauthentication and a short-lived pending enrollment record.
- Activation occurs only after a valid TOTP confirmation and explicit recovery-code acknowledgment.
- Regenerating recovery codes invalidates every prior unused code.
- Lost-device recovery prefers an unused recovery code. A future second factor may be added only through separate approval.
- Admin assistance never reveals, generates, or accepts an OTP on the participant’s behalf.
- A governed reset requires identity proof, separation of duties for privileged accounts, a bounded delay or out-of-band review where appropriate, append-only audit, factor disablement, recovery-code revocation, and revocation of all existing sessions.
- Founder/Super Admin break-glass designates Jonathan Stiger and Joe Kelly as the two independent governed custodians. Both must participate; neither can complete recovery alone; the Founder cannot approve recovery of the Founder-controlled account. Designation grants no application, database, Railway, GitHub, financial, or Production access.
- Custodian contact information, identity documents, credentials, QR codes, secret material, encryption keys, and recovery material remain outside the repository. Production activation stays blocked until both custodians separately acknowledge the role and receive secure instructions/material out of band.
- Ordinary privileged recovery retains the 24-hour delay. Emergency break-glass may bypass that delay only with both custodians, a bounded documented emergency reason, immediate session/authenticator revocation, and permanent append-only evidence.
- Routine Owner/Driver recovery has a one-business-day response target. Admin recovery requires Super Admin plus one separately authorized recovery approver and the 24-hour delay.

## 9. Device trust

Trusted-device bypass is disabled for the initial Admin and Super Admin rollout. If later approved for Owner or Driver usability, it must be explicit, revocable, shown in account security, limited to 30 days or less, backed by a random selector/verifier cookie, and independent of browser fingerprinting. Password reset, factor reset, suspicious recovery, role elevation, or global session revocation removes every trusted device.

## 10. Role-specific enforcement

| Role | Proposed sequence |
| --- | --- |
| Super Admin | Controlled enrollment first; mandatory on login after Founder acceptance; no trusted-device bypass initially; recent elevation for privileged mutations and recovery approval. |
| Admin | Controlled enrollment and acceptance after Super Admin; then mandatory; no trusted-device bypass initially; recent elevation for sensitive administrative actions. |
| Owner | Opt-in enrollment and recovery validation first; staged required rollout only after support capacity and controlled acceptance; recent elevation for security/profile and future sensitive actions. |
| Driver | Opt-in enrollment first with mobile and field-recovery acceptance; mandatory rollout only through a later explicit decision that accounts for lost-device and connectivity risk. |

Role policy is server authoritative. A role or user without an enrolled factor must never be stranded by enabling enforcement; rollout requires an enrollment grace state and verified recovery readiness.

## 11. Compatibility controls and precedence

Work Package 0 uses two server-only environment controls rather than a participant-visible feature flag:

- `AUTH_SESSION_FOUNDATION_ENABLED` — exact string `true` activates the new credential path; absent or any other value is disabled;
- `AUTH_SESSION_HASH_PEPPER` — independently governed hash key, required only when the foundation is active, at least 32 characters, never stored in source, migration, fixtures, logs, build output, or documentation.

The database migration alone changes no runtime behavior. Before a future cutover, a permanent recovery checkpoint and an explicitly authorized global `auth_token_version` increment must invalidate all legacy bearer tokens and require every user to sign in again. While the foundation is active, bearer JWTs are not accepted. The version increment remains in place if application rollback is needed, so a rollback cannot resurrect pre-cutover JWTs.

Future TOTP controls are independent of Facility controls and financial execution:

Proposed controls are independent of Facility controls and financial execution:

- `mfa_enrollment_enabled` — allows governed enrollment; default disabled;
- `mfa_enforcement_super_admin` — default disabled;
- `mfa_enforcement_admin` — default disabled;
- `mfa_enforcement_owner` — default disabled; and
- `mfa_enforcement_driver` — default disabled.

Server precedence is: financial and account safety restrictions first; global MFA capability; role enforcement policy; then user enrollment state. No Facility override applies. A missing, invalid, or unenrolled required context fails closed into the approved enrollment/recovery experience, never into a fully authenticated session. No MFA control can enable financial execution.

## 12. Audit, retention, and privacy

Append-only events cover enrollment start/completion/cancellation, verification success/failure/lock, recovery-code use/regeneration, trusted-device creation/revocation if later enabled, factor disable/reset, recovery request/approval/denial/completion, session creation/elevation/revocation, and enforcement-policy changes.

Participant-facing history uses safe time, event, result, and device labels. Admin views use minimum necessary scope. IP addresses, exact location, raw user agents, TOTP/recovery values, secret material, tokens, private participant data, and unrelated analytics are excluded.

Routine events retain for 24 months. Privileged enrollment, reset, recovery, break-glass, role, and security-control events retain for seven years. Detailed network/device material has a maximum 90-day lifetime and is governed by the migration's minimization function. Purge functions are denied to `PUBLIC` and must be invoked only by a governed maintenance identity and schedule.

## 13. Failure, rollback, and recovery

- Delivery-provider failure cannot apply because the initial method is offline TOTP; no SMS or email delivery is required.
- A verification persistence failure creates no final session.
- Audit failure for a security mutation fails the mutation closed; a non-security presentation failure does not weaken enforcement.
- Work Package 0 application rollback sets the session-foundation compatibility control to disabled and redeploys the last accepted compatible SHA while retaining additive tables and append-only audit history.
- Cutover is a separate Level 4 action. It requires a permanent database recovery checkpoint, exact SHA/configuration evidence, a global legacy token-version increment, a forced sign-in, health/RBAC/workflow verification, and Founder acceptance.
- Immediate cutover rollback disables the new credential path, deploys the accepted prior build, preserves the token-version increment so old bearer tokens remain invalid, and requires new sign-in through the legacy path. Migration rollback is not the first response.
- Migration rollback is allowed only before dependent records exist and through the approved recovery plan; Production rollback normally preserves data and deploys compatible code.
- The recovery checkpoint must include database identifier, timestamp, retention, restore procedure, and verification owner.

## 14. Required validation

Validation must include RFC-compatible TOTP vectors, clock skew, replay, concurrency, challenge expiry/consumption, rate limits, recovery-code uniqueness/use, encrypted-secret handling, session issuance/revocation/elevation, password-reset invalidation, RBAC, Admin-assistance separation, append-only audit, migration constraints/rollback/reapplication, English/Spanish, mobile/desktop, keyboard/screen reader, reduced motion, privacy, log redaction, and financial isolation.

Production acceptance requires separate role-controlled enrollment and login walkthroughs. No uncontrolled Production identity may be substituted.

## 15. Founder decisions

Approved on 2026-08-11: TOTP first; Passkeys/WebAuthn later; SMS/email OTP deferred; Work Package 0 mandatory; Super Admin then Admin; Owner/Driver opt-in; ten-minute privileged elevation; no privileged trusted-device bypass; single-use hashed recovery codes; two-person privileged recovery with a 24-hour delay and no self-approval; Jonathan Stiger and Joe Kelly as the joint break-glass custodians; versioned Railway-held authenticated-encryption keys with current/previous-version rotation; the 24-month/seven-year/90-day retention schedule; seven-day absolute/24-hour idle Owner/Driver sessions; a self-service Sessions page; the 15–128 character password policy; and the stated recovery service targets.

Remaining before Work Package 0 release or cutover:

1. Approve the exact migration checksum, permanent recovery checkpoint, legacy token-version invalidation operation, Railway secret configuration ceremony, release SHA, and cutover/rollback window.
2. Confirm both named custodians have acknowledged their roles and received separate secure instructions/material outside the repository before privileged enforcement.
3. Assign the authorized Admin-recovery approver role, privacy-safe identity-evidence standard, escalation thresholds, and periodic recovery test cadence before enforcement.

Remaining before TOTP implementation or enforcement:

1. Complete and approve the pinned `otpauth` version, license, maintenance, vulnerability, transitive-dependency, and package-lock review.
2. Approve identity-proof evidence, access scope, escalation thresholds, and periodic recovery tests.
3. Approve the versioned TOTP encryption-key generation, rotation, dual-read, destruction, and emergency custody procedure.

## 16. Related documents

- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)
- [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-004](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-STD-001](../standards/cretexchange-platform-standards.md)
- [CTX-ARCH-013](./CTX-ARCH-013-notification-and-communication-center.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-UX-010](../ux/CTX-UX-010-two-factor-authentication-experience.md)
- [CTX-RB-011](../operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md)
- [CTX-DEP-001](../standards/CTX-DEP-001-production-deployment-protocol.md)

## 17. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-11 | Initial discovery and planning architecture; no implementation authority. |
| 0.2 | 2026-08-11 | Recorded Founder decisions and exact default-off Work Package 0 session, migration, retention, cutover, and rollback architecture. |
| 0.3 | 2026-08-11 | Recorded approved session limits, password policy, self-service Sessions UI, named joint custodians, recovery service targets, and versioned key-rotation governance. |
