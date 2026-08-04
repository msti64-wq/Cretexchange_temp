# Phase 5 Sprint 2 — Facility Owner Operational Dashboard

## Release status

Implemented and locally validated on the final candidate. Production publication and Founder acceptance must be recorded only after exact-SHA deployment and independent Production verification.

## Scope

This release makes the default Facility Owner dashboard an action-first operational workspace. It adds a bounded Owner-only operational-summary API, explicit multi-Facility selection, canonical UTC today counts, supported attention conditions, bounded pending/recent activity previews, Facility status, notification preview, English/Spanish localization, accessible loading/error/empty states, and deep links to the existing review, Facility Intelligence, Facility management, and Notification Center surfaces.

## Data and migration

No schema change or migration is required. Existing canonical operational, Facility configuration, Administrative Review, terms-ledger, and Notification Service records are reused. No dashboard summary table or duplicate analytics projection is created.

## Security and financial boundary

The endpoint requires the Owner role and verifies selected-Facility ownership. Responses exclude contact information, precise GPS, private media/storage data, raw audit or analytics data, and all financial fields. Stripe, wallets, collections, settlement, withdrawals, payout logic, payment-account behavior, and financial flags are unchanged. Financial execution remains disabled.

## Validation and acceptance

Publication requires focused service/API/UI/RBAC/privacy/localization/accessibility tests; existing Owner review, Notification Center, Facility Intelligence, Administrative Review, Driver golden-path, and Admin regression tests; TypeScript; Production build; diff validation; Production SHA/health/database/terms/financial checks; and authenticated Founder acceptance in English, Spanish, desktop, and mobile.

## Next approved sprint

Phase 5 Sprint 3 — Two-Factor Authentication. It is not part of this release.
