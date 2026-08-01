# CTX-ARCH-012 — Platform Intelligence Layer

**Status:** Approved through Phase 3 Sprint 4 Driver Competition and Leaderboards
**Owner:** V8 Laboratories
**Scope:** Immutable operational analytics, governed metrics, journeys, role-scoped read APIs, owner-scoped Facility Intelligence, Driver-scoped personal intelligence, private Driver achievements, authenticated privacy-safe Driver competition, and Admin-only Network Intelligence. No public profile, public ranking, reward, prize, point, financial incentive, environmental claim, AI inference, or financial-execution change is authorized.

## Purpose and source of truth

The Platform Intelligence Layer is CreteXchange's single analytical source for future operational reporting. It preserves source lineage without making analytics the owner of transactional truth. `washout_activities`, `washout_photos`, `washout_activity_review_events`, `washout_activity_admin_reviews`, `drivers`, `owners`, and `washout_locations` remain authoritative for lifecycle, evidence, participant, and audit decisions.

`platform_analytics_events` contains append-only, source-referenced facts. It stores a stable `source_event_key`, event vocabulary, source identity, safe foreign-key references, `occurred_at`, and `recorded_at`. It does not copy participant names, contact details, raw GPS, private object paths, image contents, financial values, payment status, wallet state, Stripe identifiers, or mutable status snapshots.

Each instrumented operational mutation records its event inside the same PostgreSQL transaction. A failed analytics write rolls back that originating mutation; replay is a no-op because `source_event_key` is unique. Analytics never reconstructs an operational record, approves an activity, changes a status, or initiates financial activity.

## Event vocabulary

| Event type | Authoritative source | Meaning |
| --- | --- | --- |
| `driver.registered` | `drivers` | Driver profile record created. |
| `driver.profile_completed` | Driver readiness source, when instrumented | Driver reaches the governed operational-profile definition. |
| `driver.first_logged_in` | successful authenticated login | First successful Driver login. |
| `facility.registered` | `washout_locations` | Operational Facility location created. |
| `facility.approved` | approved Owner plus location | Facility becomes operationally approved. |
| `activity.checked_in` | `washout_activities.check_in_time` | Driver checked into an activity. |
| `photo.uploaded` | `washout_photos` | Evidence photo successfully persisted. |
| `activity.submitted` | `washout_activities` | Driver submission committed. |
| `activity.repeat_submitted` | submitted activity sequence | A Driver's subsequent submitted activity. |
| `facility.first_driver` | submitted activity sequence | First Driver activity at a Facility. |
| `facility.first_verified` | verified activity sequence | First verified activity at a Facility. |
| `facility.recurring_usage` | submitted activity sequence | Facility reached repeat submitted use. |
| `activity.verified` | Owner review audit | Canonical Owner pending-to-verified decision. |
| `activity.rejected` | Owner review audit | Canonical Owner pending-to-rejected decision. |
| `activity.owner_reviewed` | Owner review audit | A committed Owner pending-to-verified or pending-to-rejected decision. |
| `admin_review.requested` | Administrative Review request | Driver requested neutral facilitation. |
| `admin_review.closed` | Administrative Review resolution | Facilitator closed a request without lifecycle mutation. |
| `admin_review.returned_to_owner_review` | Administrative Review resolution | Facilitator returned an activity to Owner pending review. |

The vocabulary is operational only. It does not introduce a status, change Owner approval authority, define billability, or record payout, settlement, payment, wallet, Stripe, or private-object events. A future event requires a governed vocabulary addition and privacy review.

## Canonical metric registry

[CTX-MET-001 — Platform Metric Registry](./CTX-MET-001-platform-metric-registry.md) is the complete authoritative definition of metric names, formulas, source coverage, include/exclude rules, attribution, timezone, classification, and visible roles. The exported `PLATFORM_METRIC_REGISTRY` is the implementation counterpart. Reports must use the registry rather than inventing metric labels or formulas.

All event timestamps are stored and queried in UTC. A consuming report may render an explicitly stated local timezone, but must not silently shift cohort or calculation boundaries. Existing Admin Activity Reports remain compatible because they continue to read canonical lifecycle tables for historic coverage; Platform Intelligence provides the shared, forward-looking event layer and never changes their result contract.

## Journeys and drop-off

The reusable Driver, Facility, and Washout journeys are defined in CTX-MET-001 and represented by `PLATFORM_JOURNEYS`. A journey is calculated only from recorded event facts in a bounded UTC window. It returns entry count, exit count, conversion rate, abandonment rate, average duration, median duration, and stage-by-stage conversion/drop-off. Owner Review is a recorded Washout stage. Optional Administrative Review is reported as an actual conditional stage; it is not treated as mandatory abandonment.

There is no inferred, estimated, sampled, or backfilled journey progress. Historic records that predate instrumentation have no journey-event coverage and must not be presented as if they did.

## APIs, authorization, and performance

Admin and Super Admin may use bounded event, metric, and journey APIs. Facility Owners may use only the ownership-checked, aggregate Facility intelligence APIs for their own location. The Facility Intelligence dashboard returns aggregate overview counts, bounded trend series, a maximum of ten pseudonymous operational Driver rows, peak operating periods, data-quality indicators, a Facility Health Score, and facility-scoped drop-off reports. It never returns global Admin totals, another Owner's Facility data, contact data, image/object references, financial data, or event metadata. Drivers, anonymous callers, and public callers receive no analytics event data. Event projections exclude metadata by default.

The Facility Health Score is an internal operational calculation over verification quality, repeat Driver participation, Administrative Review demand, operational consistency, and profile completeness. Its public Owner projection returns only score and state; factor weights are internal and are not exposed outside Admin operations. It is advisory and never changes Facility approval, Owner authority, billing, or a lifecycle status.

The Driver Intelligence projection is bound only to the authenticated Driver profile. It contains that Driver's verified activity periods, final-decision quality rates, submitted-activity days and streaks, facility usage, a bounded activity trend, and a Washout Journey derived from the same immutable event stream. It returns no other Driver's activity, ranking, reward, wallet, payout, payment, Stripe, or private-storage data. Its trend and journey query window is bounded to 93 days; cumulative values are explicitly labelled lifetime or calendar period.

## Private Driver achievements

The Driver Achievement service is a read-only projection over the existing immutable Platform Intelligence stream. It does not create an achievement table, duplicate an analytics event, mutate operational state, or establish a reward ledger. `server/driverAchievements.ts` owns the versioned achievement definitions and calculation rules; the existing Platform Intelligence event table remains the only runtime fact source.

Only these existing canonical event types participate:

- `activity.verified` for verified-washout milestones;
- `activity.submitted` for submitted-day consistency and distinct-Facility participation; and
- `activity.verified` plus `activity.rejected` for final-decision quality sequences.

The projection returns earned achievements, earned dates, bounded progress, the next overall achievement, and the next milestone in each category. Earned dates are the canonical `occurred_at` timestamp of the event that first satisfied a milestone; submitted-day streak dates use the UTC start of the qualifying day. Progress is capped at the milestone threshold and does not create points or another unit of value.

`GET /api/drivers/achievements` resolves the Driver profile exclusively from the authenticated account. It accepts no Driver identifier and returns only that Driver's private projection. Owners, Admins acting through this Driver route, other Drivers, anonymous users, and public callers cannot retrieve the projection. Future competition, rewards, public recognition, or comparative use requires separately governed APIs and authorization; this endpoint does not provide cross-Driver inputs.

Achievement calculation is performed from a maximum of 10,000 qualifying canonical events in chronological order. A larger result fails closed rather than silently truncating recognition. Historical coverage begins with Platform Intelligence instrumentation; the service does not infer or backfill unrecorded activity from mutable status.

## Authenticated Driver competition

`server/driverCompetition.ts` is a reusable, read-only projection over canonical `activity.verified` events. `GET /api/drivers/competition/leaderboard` resolves the caller's Driver profile from the authenticated session and rejects non-Driver roles. It accepts week, month, year, or all-time UTC periods and optional state or eligible-Facility filters. State is attributed only from the Facility on the verified event; no Driver GPS or profile location participates.

Ranked totals count distinct activity IDs, so replayed analytics events cannot add a second washout. Only active Driver accounts with at least one qualifying event appear. Rows use first name plus last initial, shared rank for equal totals, earliest attainment then internal ID for deterministic ordering, bounded server pagination, and a separate current-Driver position with nearby ranks. The response exposes no raw identifiers, contact details, Facility history, precise GPS, media paths, event payloads, or financial fields.

The leaderboard reuses the existing verified-washout achievement thresholds for milestone recognition; it does not create points, prizes, rewards, monetary value, public profiles, or a new event stream. Queries cap the ranked set at 10,000 and eligible filter Facilities at 100 and fail closed above those bounds. Existing event type/time, Driver/time, and Facility/time indexes support the principal aggregation; no schema or pre-aggregation change is authorized for this sprint.

## Network Intelligence extension

`server/networkIntelligence.ts` is the reusable Admin-only network projection. It combines safe account and Facility lifecycle fields from canonical operational tables with immutable Platform Intelligence events; it does not create a second event stream or client-side formulas. `GET /api/admin/analytics/network/overview` accepts a bounded UTC range of at most 366 days plus optional state and Facility filters. Geography rows are sorted and paginated on the server.

The only trustworthy network geography currently available is Facility state and Facility identity. The repository has no canonical metro, market, or defined operating-region entity, so the service does not invent one. Driver adoption by state is attributed only through recorded activity at a state-known Facility; Driver profile/GPS coordinates are never used. No precise coordinates, contact fields, Owner identity, event metadata, media paths, or financial fields are selected or returned.

The projection caps each source set at 10,000 rows and fails closed at the cap. Existing `platform_analytics_events` indexes cover event type/time, Driver/time, and Facility/time paths. Queries run as three parallel bounded set reads with no per-row lookup. Pre-aggregation is not authorized because present evidence does not establish a need. Activity-per-Facility, activity-per-Driver, and active-Driver-per-active-Facility values are network-utilization indicators only; they do not claim physical capacity, service coverage, or geographic capacity.

All list queries use server-side pagination; journey reports require a bounded 93-day range and reject result sets over 10,000 events. Facility aggregation uses grouped database queries, not per-event or per-driver query loops; the dashboard caps the Driver list at ten rows. A Facility Driver Journey is explicitly a cohort of Drivers that submitted at that Facility in the selected window. Account stages are recorded account facts for that cohort, while activity stages are constrained to the selected Facility. The migration indexes event type/time and source dimensions used by these queries.

## Validation and migration posture

Migration `0038_add_platform_analytics_events.sql` is additive and nondestructive. It creates the event table, unique idempotency constraint, positive-version constraint, four read indexes, and source foreign keys. It must be run only through the governed migration procedure. Runtime PostgreSQL catalog, rollback, idempotency, and transaction-boundary validation require an explicitly confirmed isolated validation database before Production authorization.
