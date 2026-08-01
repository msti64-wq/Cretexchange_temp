# Phase 3 Sprint 4 — Driver Competition and Leaderboards

Adds an authenticated, bilingual, mobile-first Driver Competition experience and reusable API over canonical Platform Intelligence `activity.verified` facts.

The release provides network-wide, state, and eligible-Facility rankings for week, month, year, and all-time periods; shared deterministic ranks; server-side pagination; the authenticated Driver's current and nearby positions; distance to the next rank; privacy-safe display names; and recognition from the existing verified-washout achievement thresholds.

Only distinct verified activity qualifies. Pending, submitted-only, rejected, Administrative Review, replayed, zero-count, and inactive-account activity cannot create a ranked row. The API is Driver-only and session-bound. It returns no contact data, raw Driver identifiers, precise GPS, Facility history, private analytics, media paths, event payloads, or financial data.

No schema migration, public profile, public leaderboard, points, reward, prize, cash value, financial execution, Owner visibility change, Admin ranking feature, or check-in/upload/submission change is introduced.

## Pre-release performance evidence

A read-only Production `EXPLAIN (ANALYZE, BUFFERS)` on August 1, 2026 used `platform_analytics_events_type_occurred_idx`, completed the principal aggregation in 0.084 ms after 0.325 ms planning, and performed no disk reads. The complete three-query service projection completed in 295.252 ms including remote database round trips. Production contained no canonical verified-activity events at inspection time, so this proves the empty-state path and index selection but is not representative load evidence. The existing bounded query and indexes are retained; no speculative index or cache was added.
