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
