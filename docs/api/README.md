# API

## Purpose

This section documents the application programming interfaces used by CreteXchange.

## What Belongs Here

- Authentication endpoints
- User and role endpoints
- Driver API references
- Owner API references
- Admin API references
- Stripe and wallet endpoints
- Rewards endpoints
- GPS and location endpoints
- Notification and message endpoints

## What Does Not Belong Here

- Product roadmap items
- Design system rules
- Implementation code
- Release notes or changelog entries
- Architecture diagrams unless they are needed for API context

## Planned Contents

- Endpoint summaries and request/response notes
- Authentication and authorization expectations
- Role-specific API behavior
- Integration notes for payment, GPS, and notifications flows
- Examples of stable API usage when useful

## Maintenance Note

Document API changes when contracts or expected behavior change. Keep this folder focused on external interface details, not internal implementation.
# Network Intelligence

`GET /api/admin/analytics/network/overview` is a read-only Admin/Super Admin contract. Query parameters are `start`, `end` (inclusive UTC, maximum 366 days), optional two-letter `state`, optional `facilityId`, and bounded geography `page`, `pageSize`, `sort`, and `direction`.

The stable response contains `window`, `history`, `overview`, `engagement`, `quality`, `growth`, `adoption`, `trends`, paginated `geography`, `utilization`, and explicit privacy flags. It never returns raw events, metadata, contacts, coordinates, media paths, Owner identities, or financial fields. Anonymous access is rejected by authentication; Driver and Owner roles receive 403.

# Driver Competition

`GET /api/drivers/competition/leaderboard` is an authenticated Driver-only, read-only contract. It accepts `period=week|month|year|all_time`, optional two-letter `state`, optional eligible `facilityId`, and bounded `page`/`pageSize` values. The caller cannot supply a Driver identity; the current Driver is resolved from the session.

The response contains the UTC window, privacy-safe ranked rows, the caller's separate current position, nearby ranks, total ranked Drivers, pagination, available state/Facility filters, and explicit empty or insufficient-data state. Counts are distinct canonical verified activities. Anonymous access is rejected by authentication; Owner, Admin, and Super Admin roles receive 403. No raw Driver ID, contact data, precise GPS, private Facility history, event payload, media path, or financial field is returned.

# Notification & Communication Center

All Notification Center endpoints require authentication and derive the recipient from the authenticated session. They never accept a target user ID.

- `GET /api/notifications/center?page=1&pageSize=25&category=operational` returns unarchived items and bounded pagination. `pageSize` is capped at 50. Category is optional.
- `GET /api/notifications/unread` returns a count-only compatibility payload; notification content is not loaded for the navigation badge.
- `PUT /api/notifications/:id/read` marks one notification owned by the caller read.
- `PUT /api/notifications/read-all` marks only the caller's unarchived unread notifications read.
- `POST /api/notifications/:id/archive` archives only a notification owned by the caller.
- `POST /api/admin/notifications/announcements` is Admin/Super Admin only. It accepts a governed recipient role, plain-text title/body, and optional role-allowed internal deep link. It cannot send HTML, external links, or private metadata.

`GET /api/notifications` remains a bounded legacy compatibility response, and Driver `/messages` remains a UI alias. Structured response items expose presentation fields, safe metadata, read state, priority, and safe deep link. They exclude recipient user IDs, idempotency keys, internal source identifiers, authentication data, contact data, precise GPS, media/storage paths, raw analytics payloads, and financial information.

# Facility Owner Operational Dashboard

`GET /api/owners/dashboard/operational-summary` is an authenticated Owner-only read contract. It accepts an optional owned `facilityId` UUID. Another Owner's Facility is denied. Exactly one owned Facility auto-selects; multiple Facilities without a selection return `dataState=facility_selection_required` with `today`, `attention`, and `facilityStatus` set to `null`; no Facilities returns `dataState=no_facilities`.

For a selected Facility the response provides UTC today counts, supported attention counts, at most five pending-review items, at most five recent activity items, Facility status and accepted-material labels, the authenticated Owner's unread notification count and at most five safe notification previews, and `generatedAt`. Review and navigation fields are same-origin paths whose destination endpoints retain authorization.

The response excludes financial fields, contact data, precise GPS, private photo/media URLs, storage keys, raw audit records, and analytics metadata. Driver identity is reduced to first name plus last initial. Current operational status comes from canonical activity, evidence, Administrative Review, Facility configuration, readiness, terms, and Notification Service sources.

# Admin Photo Review Retention

`GET /api/admin/photo-review` is Admin/Super Admin only. It accepts `view=needs_review|rejected_by_owner|escalated_disputed|completed|all`, optional `driverId`, `facilityId`, `activityStatus`, `escalationState`, inclusive `from`/`to` dates, `sort=newest|oldest`, and bounded `page`/`pageSize` (maximum 50). The response includes a filtered page, pagination, and `summary.activeCount`, where the count represents actionable evidence only—not retained routine rejection history.

Rows expose a safe activity reference, Facility, privacy-reduced Driver name, material, lifecycle/evidence states, rejection reason/time, escalation state, bounded audit history, and an opaque `evidencePath`. They exclude object keys, signed URLs, precise GPS, contact data, financial fields, credentials, and raw analytics. `GET /api/admin/photo-review/:photoId/evidence` reauthorizes Admin/Super Admin access and serves one private preview; anonymous access receives 401 and Driver/Owner access receives 403.
