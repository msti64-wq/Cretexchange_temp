# PD-060 — Photo Review Retention and Platform-Detected Rejection

- **Version:** 1.1
- **Status:** Active
- **Date:** 2026-08-04
- **Last Reviewed:** 2026-08-08

1. Every Owner-rejected Material Recovery Activity with canonical photo evidence remains privately discoverable to authorized Admins.
2. Routine Owner rejection is history, not automatic Admin workload. It creates no Admin notification unless separately escalated or disputed.
3. Driver Administrative Review is the existing governed dispute mechanism. It appends history and creates Admin attention without transferring Owner approval authority.
4. A platform-detected invalid, impossible, prohibited, or materially suspicious evidence submission is rejected or quarantined before Owner review, retained with append-only audit evidence, placed in active Admin Photo Review, and communicated through the existing Notification Service.
5. Driver language must describe the confirmed evidence rule neutrally. Automated detection never labels a Driver fraudulent.
6. Platform-rejected activity is excluded from verification, rewards, achievements, competition, settlement, and operational-success metrics.
7. Repeated verification failures require a separately governed account-integrity policy before warnings, suspension, or disabling are automated.
8. Evidence remains private and minimum-necessary; object keys, precise GPS, contacts, financial data, credentials, and raw analytics are not part of the Admin list contract.
9. No Production reconciliation or backfill may run without explicit Founder authorization and a recovery checkpoint.
10. A completed yellow geofence exception or Gray uncertainty/configuration result is not a platform-detected rejection and does not enter active Admin Photo Review unless independently escalated, disputed, or failed by another governed evidence rule.
11. Under separately authorized submission enforcement, a completed `OUTSIDE_EXCEPTION_ZONE` submission follows this decision's retention/quarantine path before Owner review. It creates active Admin/Super Admin attention and neutral Driver communication, but no Owner notification, ordinary Owner review item, fraud label, or financial/success outcome.

This decision refines [PD-052](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md), [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md), and [CTX-ARCH-015](../architecture/CTX-ARCH-015-photo-review-retention-and-integrity-routing.md). [PD-061](./PD-061-facility-geofence-and-operational-exception-policy.md) governs the geofence classification and notification matrix; it does not weaken this decision's retention, privacy, neutrality, or Admin-authority requirements.
