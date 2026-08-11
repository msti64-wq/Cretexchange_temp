# CTX-UX-010 — Two-Factor Authentication Experience

- **Document ID:** CTX-UX-010
- **Version:** 0.2
- **Status:** Founder-approved direction; Work Package 0 has API foundations only and no new UI is activated
- **Owner:** CreteXchange Product and Experience
- **Product:** CreteXchange
- **Date:** 2026-08-11
- **Classification:** Internal
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner

## 1. Experience objective

The 2FA experience protects accounts without creating hidden bypasses, recurring SMS cost, inaccessible challenges, or unsafe recovery. Authenticator-app TOTP is the Founder-approved initial method; Passkeys/WebAuthn are future work and SMS/email OTP are deferred. Only the underlying Work Package 0 session foundation is currently authorized for controlled-branch implementation.

## 2. Work Package 0 compatibility experience

Work Package 0 intentionally preserves the existing English/Spanish login, registration, password change/reset, mobile, accessibility, role routing, Facility scoping, geofence, notification, and financial experiences while the new session path remains disabled.

At a separately authorized cutover:

- every user must sign in again; no old browser bearer token is silently upgraded;
- expired, idle, revoked, inactive-account, or role-changed sessions return neutral sign-in guidance;
- logout revokes the server session before local UI cleanup;
- password reset/change revokes existing sessions and requires fresh authenticated state;
- session-management foundations can list broad device type and safe timestamps, revoke one owned session, and sign out all devices without showing IP address or a full user agent;
- loading or failure never displays a false authenticated state; and
- the browser sends credentials and CSRF proof without exposing the HttpOnly session token to JavaScript.

The session-management user interface is a separate Founder decision. Its server APIs exist in Work Package 0, but no new screen is introduced or activated by this package.

## 3. Enrollment

1. Explain what an authenticator app is, why CreteXchange recommends it, and that it works without SMS.
2. Require recent password confirmation.
3. Present a QR code and an accessible manual setup key exactly once. Provide copy feedback without exposing the secret to logs or analytics.
4. Ask for the current six-digit code. Inputs accept paste and platform autofill where safe, use a visible label, and are not split into keyboard-hostile controls.
5. Display recovery codes once, provide copy/download/print choices, and require acknowledgment that CreteXchange cannot show them again.
6. Activate the factor only after successful verification and recovery-code acknowledgment. Cancel leaves no active factor.

The interface never claims enrollment succeeded before the server confirms the atomic transition.

## 4. Login and elevation

After password verification, an enforced user sees a stable page shell, account-safe guidance, the authenticator-code field, a recovery-code alternative, and an explicit restart/cancel action. The challenge must not expose whether an unknown account exists. Errors distinguish expired challenge, invalid code, attempts exhausted, and controlled service failure without disclosing security internals.

Sensitive actions use a compact recent-verification dialog or page. It names the action being protected, accepts TOTP or an approved recovery path, and returns focus to the originating control. Cancel is the safe default and creates no mutation.

## 5. Recovery and device management

Account Security shows factor status, enrollment time, recovery-code availability count without values, active sessions, and trusted devices only if that later feature is approved. Users can revoke individual sessions and all other sessions.

Lost-device recovery offers:

1. use one recovery code;
2. start the governed assistance request; or
3. return to login.

It never asks a user to send a TOTP secret, recovery code, password, screenshot of a secret, or identity evidence through ordinary support messages. Admin assistance status is factual and does not promise immediate access.

## 6. Role-specific presentation

- **Super Admin/Admin:** clearly communicate mandatory status, no initial trusted-device bypass, sensitive-action elevation, and governed recovery delay/separation.
- **Owner:** initial opt-in wording explains account and Facility protection without implying financial execution or changing delivery visibility.
- **Driver:** initial opt-in experience is mobile-first, tolerates field connectivity after the authenticator app has been configured, and does not imply that 2FA affects achievements, rewards, submissions, or Facility access.

## 7. English, Spanish, accessibility, and mobile

Every step must have complete English and Spanish strings, including loading, expiry, failure, attempts remaining where safe, recovery, session management, and support status. Raw translation keys are prohibited.

Requirements include:

- semantic headings, labels, descriptions, and live-region status;
- keyboard-only completion and visible focus;
- screen-reader announcements that do not read secret values unexpectedly;
- no color-only state;
- 320×568 and 375×667 viewport support, portrait/landscape, text enlargement, safe-area insets, and keyboard-visible layout;
- bounded internally scrolling dialogs with reachable Cancel and Apply controls;
- paste support and numeric mobile keyboard hints for codes;
- reduced-motion compliance; and
- no time-only interaction without an accessible restart path.

## 8. Safe states

- Loading never renders a false authenticated or enabled state.
- Expired challenge returns to password verification without losing the user’s understanding of the next step.
- Offline or server failure does not consume a recovery code unless verification committed successfully.
- Opening enrollment, recovery, or elevation creates no security mutation.
- A failed mutation restores the authoritative state and never displays optimistic success.
- Recovery-code regeneration warns that every prior unused code will stop working.
- Factor disable/reset warns that sessions will be revoked and requires recent verification plus the approved recovery authority.

## 9. Acceptance criteria

Acceptance covers enrollment, login, elevation, recovery code, lost device, factor reset, session revocation, expiry, rate limits, and safe failures for each approved rollout role. It includes physical mobile, desktop, English, Spanish, keyboard, screen reader, text enlargement, reduced motion, protected focus, and zero secret leakage in UI diagnostics.

Founder acceptance is separate for Super Admin, Admin, Owner, and Driver. Passing automated checks or deployment does not replace Founder-visible acceptance.

## 10. Related documents

- [CTX-ARCH-017](../architecture/CTX-ARCH-017-two-factor-authentication-architecture.md)
- [PD-063](../product/PD-063-two-factor-authentication-and-account-recovery-policy.md)
- [CTX-RB-011](../operations/CTX-RB-011-two-factor-authentication-recovery-and-reset-runbook.md)
- [CTX-UX-004](./CTX-UX-004-first-time-user-onboarding-experience.md)

## 11. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-11 | Initial 2FA discovery and UX planning document. |
| 0.2 | 2026-08-11 | Recorded Founder decisions and Work Package 0 forced-sign-in, session, CSRF, privacy, and compatibility experience. |
