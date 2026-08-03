# Phase 5 Sprint 1 — Notification & Communication Center

## Release status

Release candidate implemented and locally validated. Production publication and Founder acceptance are not recorded by this document until independently verified.

## Scope

This release extends the existing private in-application notification model into one shared Driver, Facility Owner, Admin, and Super Admin Notification Center. Driver `/messages` remains a compatibility alias. The separate Admin support-history `messages` model remains unchanged.

Implemented scope includes structured bilingual templates, role and category classification, safe deep links, allowlisted metadata, recipient-scoped bounded pagination, unread count, mark-one/mark-all read, archive, deterministic idempotency, Admin-governed announcement fan-out, lifecycle generation for activity submission and review, Administrative Review, photo-review attention, newly earned achievements, and existing competition milestones.

## Data and migration

Migration `0039_extend_notifications_for_communication_center.sql` adds structured fields, constraints, and indexes without deleting legacy notification rows or columns. It is governed by the staging and Production controlled migration runners with an immutable checksum and catalog verification.

## Security and privacy

All reads and mutations resolve the recipient from the authenticated session. Admin recipients have no cross-recipient notification-reading API. Notification metadata excludes contact information, credentials, authentication tokens, precise GPS, storage/media paths, raw analytics payloads, payment/wallet/Stripe fields, and financial amounts. Links are same-origin and role-allowlisted; destination authorization remains authoritative.

## Financial boundary

No new financial notification type, payment reminder, wallet mutation, provider call, payout, settlement, or financial execution path is included. Existing legacy financial producers are not extended. Financial execution remains fail closed.

## Validation required before publication

- TypeScript and Production build
- Notification domain, RBAC, privacy, idempotency, localization, UI, workflow, migration, and regression tests
- Controlled migration plan/apply evidence and catalog verification
- GitHub main, Railway Production, `/api/version`, health, database, terms-ledger, and financial-execution verification
- Authenticated Driver, Owner, Admin, English, Spanish, read/archive, deep-link, lifecycle, and performance acceptance
- Explicit Founder acceptance

## Rollback

Application rollback may retain the additive notification columns and indexes. Existing legacy readers remain compatible. Destructive schema rollback is neither required nor authorized.
