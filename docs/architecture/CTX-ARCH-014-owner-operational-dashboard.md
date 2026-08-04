# CTX-ARCH-014 — Facility Owner Operational Dashboard

- **Status:** Approved for Phase 5 Sprint 2 implementation
- **Owner:** CreteXchange Product and Engineering
- **Effective date:** August 3, 2026

## Purpose

The Facility Owner Operational Dashboard is the action-first Owner workspace. It answers what requires attention today, what happened recently, which Recovery Facility is in context, and where the Owner should act next. It is not an analytics surface. Historical trends, health scoring, Driver Journey, and deeper interpretation remain in Facility Intelligence under CTX-ARCH-012.

## Canonical sources

The dashboard reads current state from `washout_activities`, `washout_photos`, `washout_activity_admin_reviews`, `washout_locations`, `location_material_intents`, `materials`, and the recipient-scoped Notification Service. Owner readiness uses the established Owner operational-access resolver; current terms action uses the existing terms ledger. Platform Intelligence events are not used as the sole source for queues or lifecycle counts.

The dashboard creates no operational state, analytics event, notification, financial record, or duplicate summary table.

## API and selection contract

`GET /api/owners/dashboard/operational-summary` is Owner-only and accepts an optional owned `facilityId` UUID.

- One owned Facility is selected automatically.
- Multiple owned Facilities require an explicit valid selection. Before selection, Facility-scoped metrics are `null`, not zero.
- No owned Facilities returns an explicit setup state.
- A requested Facility not owned by the caller is denied.
- The response includes safe Facility choices, UTC today counts, attention counts, at most five pending-review rows, at most five recent-activity rows, Facility status, at most five notifications, unread count, and generation time.

The client persists the selected Facility through the existing Owner-scoped storage key and the visible `facilityId` URL parameter. It never selects `locations[0]` for a multi-Facility Owner.

## Operational definitions

- **Submitted today:** activity `created_at` falls within the current UTC day.
- **Verified today:** `verified_at` falls within the current UTC day.
- **Rejected today:** `rejected_at` falls within the current UTC day.
- **Active Drivers today:** distinct activity `driver_id` values submitted in the UTC day.
- **Awaiting Owner review:** canonical activity status is `pending`.
- **Latest activity:** greatest canonical activity `created_at` for the selected Facility.
- **Missing evidence:** a pending activity has no `washout_photos` row.
- **Failed evidence:** a pending activity has at least one photo with canonical verification status `failed`.
- **Returned from Administrative Review:** a pending activity has a review resolution of `returned_to_owner_review`.
- **Aged pending review:** a normal pending activity whose `created_at` is older than 72 hours. The threshold is an operational attention signal, not a defect, fault finding, or automatic lifecycle change.
- **Unresolved operational notices:** the authenticated Owner's unread, unarchived Notification Service count.
- **Facility configuration issues:** only proven inactive, hidden, missing accepted materials, missing operating hours, incomplete Owner profile, missing Owner approval, or current terms-acceptance conditions.

## Review and navigation

The dashboard previews work but does not add a second approval mechanism. Review links open the existing governed Owner review workflow. Facility Intelligence and the complete Notification Center remain separate destinations. Narrow query invalidation in those established workflows remains authoritative.

## Privacy and authorization

The authenticated account must resolve to the Owner role, and the selected Facility must belong to that Owner. Activity rows use first name plus last initial. The API returns no contact information, precise GPS, private photo URL, storage key, raw audit/analytics payload, financial amount, payment, wallet, Stripe, payout, or settlement field. Notification projection remains recipient-scoped and destination APIs retain their own RBAC.

## Performance and data states

The client renders its shell and localized loading state immediately, uses a bounded 15-second request, exposes retry, and performs no aggressive polling. Server work is grouped into bounded set queries with no per-row query loop. Existing foreign-key and operational indexes support the current pilot volume; a new index or pre-aggregation is not justified without measured query-plan evidence. Selection-required and unavailable data are never displayed as false zeroes.

## Localization and accessibility

English and Spanish provide equivalent headings, actions, states, timestamps, and recovery text. Semantic sections, keyboard-native controls, visible focus behavior, live status announcements, text status labels, accessible timestamps, touch-sized actions, and reduced-motion behavior are required.

## Deferred capabilities

This architecture does not authorize new analytics, public Owner data, inline review shortcuts outside the established workflow, bulk review, real-time transport, financial expansion, schema expansion, or Two-Factor Authentication. The next approved sprint is **Phase 5 Sprint 3 — Two-Factor Authentication**.

