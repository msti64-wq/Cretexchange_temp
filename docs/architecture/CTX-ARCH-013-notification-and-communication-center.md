# CTX-ARCH-013 — Notification and Communication Center

- **Document ID:** CTX-ARCH-013
- **Version:** 1.0
- **Status:** Approved for Phase 5 Sprint 1 implementation
- **Owner:** CreteXchange Product and Engineering
- **Effective Date:** August 3, 2026

## Purpose

This architecture defines the reusable, in-application Notification domain for Drivers, Facility Owners, Admins, and Super Admins. It extends the existing `notifications` table and authenticated routes instead of creating a parallel message system.

## Source-of-truth boundaries

- Canonical operational transitions remain authoritative for activity, review, achievement, competition, and photo-review state.
- `notifications` is a recipient-scoped delivery/read model. It is not an operational, analytics, financial, or audit ledger.
- Platform Intelligence events remain analytics facts and are never used as the notification database.
- `messages` remains the Admin support-history surface for user-submitted or system support records. It is not merged into private notifications.
- Driver `/messages` remains a backward-compatible route alias for the Notification Center; `/notifications` is the canonical route.

## Domain model

Each notification has a recipient user and role, stable type and category, governed localization template key, allowlisted interpolation metadata, creation/read/archive timestamps, safe deep link, safe source reference, idempotency key, priority, in-app delivery state, and schema version. Existing `title`, `message`, `type`, `is_read`, `data`, and `created_at` fields remain compatible while structured fields govern new records.

Initial categories use stable identifiers: `operational`, `achievement`, `competition`, `administrative`, `system`, and `announcement`. Customer-facing category labels are localized.

Notification metadata never stores passwords, tokens, contact information, precise GPS, storage paths, photo URLs, payment or wallet information, Stripe identifiers, or raw analytics payloads.

## Service boundary

`server/notificationService.ts` owns validation, safe metadata projection, deep-link resolution, idempotent creation, recipient-scoped pagination, unread count, mark-one-read, mark-all-read, archive, and announcement fan-out. Routes and canonical workflows call this boundary rather than writing notification rows directly.

All reads derive the recipient from the authenticated session. Admin status does not grant access to another recipient's notifications.

## Event-to-notification behavior

Canonical transitions emit notification intents only after the transition succeeds:

| Workflow | Delivery posture | Recovery behavior |
| --- | --- | --- |
| Activity submitted | Best effort after the transactional activity/photo commit | Deterministic recipient/source idempotency keys permit safe replay. |
| Owner verified or rejected | Best effort after the compare-and-set succeeds | Duplicate retries resolve to the existing notification. |
| Administrative Review requested or decided | Best effort after the review transaction succeeds | The review ID and resolution form the idempotency identity. |
| Newly earned achievement | Best effort from the canonical achievement projection after a qualifying transition | One notification per recipient and achievement definition. |
| Competition milestone | Best effort only for existing governed verified-activity milestones | One notification per recipient and milestone; no speculative rank movement. |
| Photo Review attention | Best effort after an activity with review-required evidence is committed | One notification per Admin recipient and activity. |
| Platform evidence rejection | Best effort after the quarantined activity/evidence commit | Neutral Driver notice and one Admin notice per recipient/activity; no Owner notice. |
| Governed announcement | Transactional per recipient; idempotent fan-out | Admin/Super Admin authorization and governed template allowlist are mandatory. |

Routine Owner rejection is retained history and does not produce an Admin notice. A governed platform evidence failure or explicit dispute/escalation does. No other Facility reminder or Admin warning is inferred from analytics or mutable UI state.

A notification failure is logged with only safe identifiers and never rolls back or blocks Driver submission, Owner review, or Administrative Review. The stable idempotency key is the recovery mechanism; a later retry may create the missing row without duplication.

## Localization and templates

New system notifications store a template identifier and allowlisted metadata, not rendered English alone. The client renders title and body in the current English or Spanish locale. Legacy records without a governed template retain their stored text for backward compatibility and are clearly treated as legacy content. User-authored content is never automatically translated.

## Deep links

Deep links are selected from role-specific route allowlists. Query parameters are limited to safe identifiers and existing authorized destination routes. Destination APIs continue to enforce RBAC and ownership. Invalid links are omitted; obsolete authorized destinations retain the application's normal not-found behavior.

## Read, archive, and ordering

- New notifications are unread.
- Opening the center does not mark all records read.
- Selecting or explicitly marking one notification records `read_at`.
- Mark all read updates only the authenticated recipient's unarchived unread records.
- Archive records `archived_at`; archived records are excluded by default.
- Lists are newest-first with a stable ID tie-breaker and bounded cursor/page pagination.

## Performance and indexing

Unread count uses a count-only query. Lists are bounded to 25 by default and 50 maximum. Recipient/archived/created, recipient/read/archived, category, and unique idempotency indexes support the primary queries without N+1 reads. Notification lists load only on the Notification Center route; the lightweight unread count is independent and never blocks critical Driver content. No WebSocket or aggressive polling is introduced.

The Facility Owner Operational Dashboard may reuse the authenticated Owner's count and a maximum five-item safe preview. That projection does not change read/archive state, create a second notification model, or redesign the full Notification Center.

## Auditability and privacy

Creation, read, archive, type, recipient, source workflow, source reference, idempotency key, and timestamps are durable on the notification row. Admin announcement requests are logged with the actor and governed template identifier without content or private metadata. Notification rows do not replace operational audit records.

## Message Center boundary

The separate `messages` table continues to support Admin review of support/system messages. It may contain user-authored text and is not exposed through the private Notification API. The Notification Center contains structured, actionable, recipient-scoped lifecycle records. Driver bookmarks to `/messages` remain valid and show the Notification Center.

## Future channels

Email, SMS, browser/native push, webhooks, scheduled summaries, user preferences, chat, support-mode messaging, and marketing automation are deferred. Future adapters may consume the same structured notification records or intents, but no future-channel behavior belongs in operational workflows.

## Financial isolation

Phase 5 Sprint 1 creates no financial notification type, payment reminder, financial metadata, provider action, wallet mutation, payout, settlement, or execution path. Legacy financial/account notification producers are outside this sprint and are not extended. Financial execution remains fail closed.

## Migration and recovery

Migration `0039_extend_notifications_for_communication_center.sql` is additive. It preserves legacy columns and rows, adds structured nullable/defaulted fields and indexes, and requires governed Production authorization before application code that depends on those fields is deployed. Recovery uses application rollback while retaining additive columns; destructive schema reversal is not required.
