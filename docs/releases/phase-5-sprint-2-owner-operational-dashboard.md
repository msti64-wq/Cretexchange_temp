# Phase 5 Sprint 2 — Facility Owner Operational Dashboard

## Release status

**Founder Production acceptance complete — August 21, 2026.** The original operational-dashboard release and its final All-Facilities correction are published and accepted. The related login/dashboard performance correction is also published and accepted.

## Scope

This release makes the default Facility Owner dashboard an action-first operational workspace. It adds a bounded Owner-only operational-summary API, explicit multi-Facility selection, canonical UTC today counts, supported attention conditions, bounded pending/recent activity previews, Facility status, notification preview, English/Spanish localization, accessible loading/error/empty states, and deep links to the existing review, Facility Intelligence, Facility management, and Notification Center surfaces.

## Data and migration

No schema change or migration is required. Existing canonical operational, Facility configuration, Administrative Review, terms-ledger, and Notification Service records are reused. No dashboard summary table or duplicate analytics projection is created.

## Security and financial boundary

The endpoint requires the Owner role and verifies selected-Facility ownership. Responses exclude contact information, precise GPS, private media/storage data, raw audit or analytics data, and all financial fields. Stripe, wallets, collections, settlement, withdrawals, payout logic, payment-account behavior, and financial flags are unchanged. Financial execution remains disabled.

## Validation and acceptance

Publication requires focused service/API/UI/RBAC/privacy/localization/accessibility tests; existing Owner review, Notification Center, Facility Intelligence, Administrative Review, Driver golden-path, and Admin regression tests; TypeScript; Production build; diff validation; Production SHA/health/database/terms/financial checks; and authenticated Founder acceptance in English, Spanish, desktop, and mobile.

## Founder Production acceptance closeout — August 21, 2026

- **Login and dashboard performance:** commit `5b8ced00a8409bb2fe3a1d00251ae0d3a9aa50cc`, Railway deployment `cc5388cf-54ca-43ce-8f51-1e79f6343c8a`. Founder-authenticated Production use confirmed that the excessive login/dashboard delay and blank white startup were resolved; the accessible loading presentation and Super Admin, Owner, and Driver dashboard loading were accepted. Provider cold-start duration was not independently isolated. Replit is not part of the current hosting architecture; this correction removed only a legacy browser script and unnecessary third-party font requests.
- **Owner All-Facilities operational dashboard:** commit and final accepted Production SHA `58275ee99fe463598e1c3e6074c8b5efb6e0c9c5`, Railway deployment `9661a1aa-988a-4aaf-808c-b5a3562915e8`. Founder-authenticated Production use accepted **Today — All Facilities**, Owner-wide metrics, latest activity, pending preview, Recent Activity, Facility names, individual Facility drill-down, **Return to All Facilities**, and protected review/evidence navigation.
- **Closeout:** the login/dashboard performance defect and misleading default Owner Facility view are closed. A read-only checkpoint confirmed GitHub `main`, Railway, and `/api/version` at the final accepted SHA; HTTP 200 health; connected Production database; and disabled financial execution. GitHub, Railway, and Neon remain the source, deployment, and database architecture.
- **Authentication and governed controls:** the session foundation remains disabled, legacy JWT authentication remains canonical, and TOTP enrollment/enforcement has not begun. Existing geofence control states were not changed by either release or this closeout.

## Next approved sprint

Phase 5 Sprint 3 — Two-Factor Authentication is separate from this release. Its additive Work Package 0 foundation is deployed and Founder-accepted default-off; session cutover/activation and TOTP Work Package 1 remain separately gated.
