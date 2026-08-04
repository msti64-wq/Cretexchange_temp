# CTX-ARCH-015 — Photo Review Retention and Integrity Routing

- **Status:** Implemented; Founder Production acceptance pending
- **Date:** 2026-08-04

## Boundary

Canonical `washout_activities`, `washout_photos`, append-only review events, and Administrative Review records are the evidence source. Analytics events are not an evidence archive. No duplicate photo-review record or summary table is created.

The Admin read model provides five bounded, server-filtered views: Needs Review, Rejected by Owner, Escalated/Disputed, Completed, and All History. Routine Owner rejection is identified by `activity.status=rejected` with a non-null `rejected_by`; it remains discoverable but is not actionable unless an open Administrative Review exists. A platform integrity rejection uses the same canonical rejected lifecycle with `rejected_by=null`, a factual reason, non-verified photo state, and an append-only `platform-evidence-validation` event. Legacy rejected records with no actor are not reclassified by backfill.

## Submission routing

When submitted photo evidence fails a governed location, freshness, duplicate, or technical validation, the activity and exactly one copy of each supplied photo are committed atomically as a platform integrity rejection. The Facility Owner is not notified and the activity never enters the Owner pending queue. The Driver receives neutral language, while Admin and Super Admin recipients receive an idempotent Notification Service item. No verified, submitted-success, repeat, Facility-adoption, reward, achievement, competition, settlement, or financial event is created.

Routine Owner rejection retains its reason, timestamp, actor, private evidence, Driver notification, and audit event. It creates no Admin notification and no active Photo Review item. A Driver Administrative Review request reuses the existing governed dispute record and makes the evidence actionable.

## Read and privacy model

`GET /api/admin/photo-review` is Admin/Super Admin only, limits pages to 50, uses stable upload-time/id ordering, and executes a constant number of bulk queries. It returns safe activity context, privacy-reduced Driver identity, material, rejection state, review history, and an opaque evidence endpoint. It excludes object keys, signed URLs, coordinates, contacts, financial data, auth data, and raw analytics.

`GET /api/admin/photo-review/:photoId/evidence` reauthorizes every read and redirects only after Admin/Super Admin authorization to a short-lived private provider URL or the authenticated object proxy. List rows do not fetch images; the selected detail loads one authorized preview.

## Governance

No schema migration or Production backfill is required. Repeated integrity failures may inform a future separately approved account-integrity policy; an automated signal is not a fraud finding. Financial execution remains disabled. Phase 5 Sprint 3 Two-Factor Authentication remains the next mandatory major sprint after Founder acceptance of this remediation.
