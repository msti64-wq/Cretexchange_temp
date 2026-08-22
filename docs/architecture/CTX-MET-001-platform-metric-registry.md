# CTX-MET-001 — Platform Metric Registry

**Status:** Approved through Phase 3 Sprint 4 Driver Competition and Leaderboards
**Owner:** V8 Industries LLC
**Classification:** Internal operational analytics; no financial, payment, private-storage, contact, GPS, or sensitive metadata is included.

## Operational dashboard boundary

Phase 5 Sprint 2 introduces current-state Owner operational indicators, not new Platform Intelligence metrics. Submitted/verified/rejected today, current pending review, distinct active Drivers today, and latest activity time are computed from canonical Facility-scoped lifecycle timestamps under CTX-ARCH-014. Missing/failed evidence, returned Administrative Review, readiness, configuration, terms, and unread-notification counts are action signals from their canonical operational read models. They are not trend metrics, health scores, event reconstructions, or additions to `PLATFORM_METRIC_REGISTRY`.

## Registry rules

This is the authoritative registry for platform metrics. `server/platformAnalytics.ts` exports the matching `PLATFORM_METRIC_REGISTRY`; report consumers must not recreate these formulas. Events and canonical operational tables are referenced rather than copied. All timestamps are UTC; a report that displays local time must name the presentation timezone without changing the recorded calculation window.

| Metric | Purpose | Source events / tables | Calculation | Include | Exclude | Time / visible roles |
| --- | --- | --- | --- | --- | --- | --- |
| Submitted Activity | Measure activity entering Owner review. | `activity.submitted`; `washout_activities` | Count submitted events. | One committed submission. | Payments, wallets, failures, duplicates. | Submission time; Admin, Super Admin, Owner, scoped Driver. |
| Verified Activity | Measure completed operational verification. | `activity.verified`; `washout_activities`, review audit | Count verified events. | Canonical Owner pending-to-verified decisions. | Facilitator actions, payment success, pending records. | Verification time; Admin, Super Admin, Owner, scoped Driver. |
| Rejected Activity | Measure operational exceptions. | `activity.rejected`; `washout_activities`, review audit | Count rejected events. | Canonical Owner pending-to-rejected decisions. | Open review requests and non-final records. | Rejection time; Admin, Super Admin, Owner, scoped Driver. |
| Administrative Review Requested | Measure neutral facilitation demand. | `admin_review.requested`; `washout_activity_admin_reviews` | Count request events. | One committed review round. | Owner decisions and finance. | Request time; Admin, Super Admin, scoped Owner, scoped Driver. |
| Administrative Review Completed | Measure facilitator throughput. | `admin_review.closed`, `admin_review.returned_to_owner_review`; review tables | Count either terminal facilitator event. | A completed facilitator decision. | Open requests and payment outcomes. | Decision time; Admin, Super Admin. |
| Active Drivers | Measure active operational supply. | activity submitted/verified/rejected; `drivers`, `washout_activities` | Distinct `driver_id`. | Non-null Driver on qualifying activity event. | Registration-only and financial data. | Event time; Admin, Super Admin. |
| Active Facilities | Measure active demand locations. | `activity.submitted`; `washout_locations`, `washout_activities` | Distinct `location_id`. | Submitted activity at a location. | Unused or inactive-only locations and billing data. | Submission time; Admin, Super Admin. |
| Driver Retention | Measure repeat participation. | `activity.submitted`, `activity.repeat_submitted`; `drivers`, `washout_activities` | Distinct repeat Drivers / distinct submitted Drivers × 100. | Drivers with actual first and repeat submissions. | Accounts without activity and finance. | Repeat-submission time; Admin, Super Admin. |
| Facility Utilization | Measure operational use of active locations. | `activity.submitted`; `washout_locations`, `washout_activities` | Submitted activity / active Facilities. | Submitted events with location. | Billing and financial configuration. | Submission time; Admin, Super Admin, Owner. |
| Verification Rate | Measure evidence acceptance quality. | `activity.verified`, `activity.rejected`; activity/review audit | Verified / (verified + rejected) × 100. | Final Owner decisions. | Pending records, facilitator-only actions, finance. | Owner decision time; Admin, Super Admin, Owner, scoped Driver. |

## Reusable journeys

| Journey | Ordered stages | Entity key |
| --- | --- | --- |
| Driver | Registration → First Login → Check-In → Photo Upload → Verification → Repeat Activity | `driver_id` |
| Facility | Registration → Approval → First Driver → First Verified Washout → Recurring Usage | `location_id` |
| Washout | Check-In → Photo Upload → Owner Review → Administrative Review (optional) → Verification → Completion | `activity_id` |

Completion is the actual canonical `activity.verified` terminal fact; no synthetic completion event is created. Administrative Review is optional because it applies only to a rejected activity that enters facilitation.

A platform integrity rejection is recorded only as `activity.rejected`; it does not emit submitted-success, repeat-participation, Facility-adoption, verification, achievement, competition, reward, settlement, or financial events. Its evidence archive is the canonical activity/photo/audit record, not Platform Intelligence.

## Drop-off methodology

For each bounded reporting window, the intelligence layer groups recorded events by the journey entity key and uses the earliest event that satisfies each stage. It returns:

- **Entry count:** entities that reached the first required stage.
- **Exit count:** entities that reached the last required stage.
- **Conversion:** exit count ÷ entry count.
- **Abandonment:** 1 − conversion.
- **Stage conversion/drop-off:** each required stage reached ÷ prior required stage reached; optional stages are descriptive and do not create mandatory drop-off.
- **Average/median duration:** first-stage to final-stage elapsed milliseconds for entities that reached both.

The methodology does not estimate missing stages, infer progress from mutable status, or claim coverage before instrumentation. Queries are UTC and bounded to 93 days/10,000 events. Any later cohort or local-business-time policy requires a separately versioned metric definition.

## Facility Intelligence projection

The Owner Facility Intelligence dashboard reuses this registry and journey model; it does not create client-side calculations or a parallel reporting store. Its owner-scoped overview includes submitted, verified, rejected, and Administrative Review request counts; active and repeat Driver counts; daily, weekly, and monthly trend series; peak operating hours/days; average daily volume; verification/rejection rates; and a bounded most-active Driver list.

The Facility Health Score is an advisory internal operational score. It considers verification rate, repeat Driver percentage, Administrative Review rate, operational consistency, and profile completeness. Only its score and state are shown to Owners; internal weights are intentionally not published. Data-quality indicators are direct advisories for missing operating hours/profile data, low verification rate, or high Administrative Review demand. None of these values affects approval authority, status, billability, or financial execution.

Facility drop-off reports are facts only. The Washout Journey uses activity events for the selected Facility. The Driver Journey is a cohort of Drivers with a submitted activity at that Facility within the selected period; account stages are their recorded account facts, and activity stages are constrained to the Facility. This scope prevents cross-facility activity disclosure while avoiding an invented Facility registration stage.

## Driver Intelligence projection

The Driver Intelligence dashboard uses the existing Submitted, Verified, Rejected, Administrative Review Requested, and Verification Rate definitions, scoped to the authenticated Driver's `driver_id`. Lifetime verified activity is the count of `activity.verified`; calendar values use UTC year, month, week (Monday start), and day boundaries. Administrative Review rate is requested review rounds ÷ submitted activity. Average washouts per active day is submitted activity ÷ distinct UTC submitted-activity days. The consecutive streak ends on the most recent active day; the longest streak is the maximum sequence of consecutive recorded submitted-activity days.

Favorite Facility, visited-Facility count, and peak day/hour use only the Driver's submitted facts. Driver Journey metrics use the Washout journey scoped to the Driver's events in the selected bounded window: Check-In → Upload is uploaded entities ÷ checked-in entities; Upload → Verification is verified entities ÷ uploaded entities; overall completion and durations use the canonical journey definition. These are personal operational metrics, not rankings, rewards, or financial performance measures.

## Driver achievement definitions

`DRIVER_ACHIEVEMENT_DEFINITIONS` is the implementation counterpart for this registry. Achievements are private recognition projections over the canonical metrics and event facts above; they are not additional Platform Intelligence events, public metrics, ranks, points, rewards, prizes, or financial incentives.

| Category | Achievements | Canonical source | Calculation and earned date |
| --- | --- | --- | --- |
| Verified washouts | First; 10; 25; 50; 100; 500; 1,000 Verified Washouts | `activity.verified` | Lifetime verified-event count. Earned on the `occurred_at` timestamp of the threshold event. |
| Consistency | 3-day; 7-day; 30-day streak | `activity.submitted` | Longest sequence of distinct consecutive UTC submitted-activity days, reusing the Driver Intelligence streak definition. Earned on the UTC day that first completes the threshold. |
| Quality | 25; 100 verified without rejection | `activity.verified`, `activity.rejected` | Longest chronological sequence of final verified decisions. A rejection resets the current sequence. Earned on the verifying event that first completes the threshold. |
| Participation | First Facility; Five Facilities Visited; Ten Facilities Visited | `activity.submitted` with non-null `location_id` | Lifetime count of distinct submitted-activity Facilities. Earned when the threshold distinct Facility is first observed. |

### Milestone progression

Each definition is evaluated independently and remains earned after its threshold is reached. Current progress is the applicable lifetime count or historical maximum, capped at the threshold for display. Remaining progress is `max(0, threshold − current)`, and percentage progress is the rounded ratio capped at 100%.

The next milestone for a category is its lowest unearned threshold. The overall next achievement is the category-next milestone with the highest completion percentage; ties use the smallest remaining count and then the stable definition order above. When all current definitions are earned, no next achievement is returned.

Achievement timestamps and ordering use UTC. No status, payment, wallet, payout, Stripe, reward-entry, drawing, public-profile, leaderboard, or cross-Driver data participates. Later reversal or disqualification semantics require a separately governed canonical correction event; the current engine never invents a correction from mutable state.

## Driver competition definitions

| Term | Canonical definition |
| --- | --- |
| Qualifying washout | One distinct `activity_id` with an immutable `activity.verified` event inside the selected UTC period and optional Facility-derived geography. Submitted, pending, rejected, Administrative Review, duplicate event replay, and non-activity records do not qualify. |
| Ranked Driver | Active account with role `driver` and at least one qualifying washout. Inactive accounts and zero-count Drivers are unranked. |
| Displayed rank | Qualifying count descending. Equal counts share the same dense rank. Equal-count presentation order is earliest attainment, then stable internal Driver ID; the ID is never returned. |
| Current position | Authenticated Driver's own rank and verified count, returned separately even when outside the requested page. Nearby positions are at most two ordered rows above and below. |
| Distance to next rank | For a non-leading Driver, `nearest higher distinct total - current total + 1`; null for a leading Driver and one for an unranked Driver. |
| Recognition milestone | Highest reached threshold from the existing verified-washout achievement definitions. No other private achievement history is shared. |

Week starts Monday 00:00 UTC; month and year start at their calendar UTC boundary; all-time starts at the beginning of recorded canonical coverage. Network-wide, two-letter state, and eligible-Facility views use the same formula. State and Facility always come from the Facility attached to the verified event. Pagination is server-side and bounded to 25 rows per page.

The leaderboard display identity is first name plus last initial. It never includes full surname, contact information, precise GPS, Facility history, private Driver analytics, media/storage references, event metadata, payment, wallet, payout, Stripe, or reward information. Competition recognition is operational only and has no prize or financial value.

## Network Intelligence definitions

All Network Intelligence windows use inclusive UTC timestamps. The default window is 30 days and the maximum is 366 days. The immediately preceding equal-length window is the comparison period. Year-over-year is returned only when the earliest recorded Platform Intelligence event precedes the shifted comparison start; otherwise the state is `insufficient_history`.

| Term | Canonical definition |
| --- | --- |
| New Driver | Driver account `created_at` falls inside the selected window. |
| Activated Driver | Driver has a first recorded `activity.verified` on or before the window end. |
| Active Driver | Distinct Driver with submitted, verified, or rejected activity in the selected window. |
| Returning Driver | Active Driver in the selected window with qualifying activity before the window start. |
| Retained Driver | Driver active in the immediately preceding equal-length cohort and active again in the selected window. The denominator contains only prior-window Drivers that had an opportunity to return. |
| New Facility | Active Facility owned by an approved Owner whose canonical location `created_at` falls in the window. |
| Activated Facility | Facility with a first recorded verified activity on or before the window end. |
| Active Facility | Distinct Facility with submitted activity in the selected window. |
| Recurring Facility | Facility with at least two recorded verified activities through the window end. |
| Repeat-driver rate | Drivers with `activity.repeat_submitted` in the window ÷ Active Drivers. |
| Facility reuse rate | active Facilities with at least two verified activities through the window end ÷ Active Facilities. |
| Journey completion | distinct checked-in activities also reaching verified ÷ distinct checked-in activities. |

Network density is reported as active Drivers per active Facility, verified washouts per active Facility, verified washouts per active Driver, and repeat participation by state. State is derived only from the canonical Facility address. Metro/market and operating-region aggregation remain unavailable because no authoritative model exists. Activity volume and average daily verified activity are utilization indicators; physical capacity percentages are prohibited without an authoritative capacity source.

Metrics based on Platform Intelligence events are explicitly partial when operational account or Facility records predate the earliest event. No mutable status backfill or estimated historic value is mixed into an event metric.

## Notification Center boundary

Notification creation, unread state, read/archive timestamps, categories, and delivery state are communication read-model facts, not Platform Intelligence metrics. Phase 5 Sprint 1 adds no notification analytics event and no notification-derived business KPI. Achievement and competition notices consume the existing canonical projections; they do not generate or alter achievement, competition, activity, or financial facts. Any future communication-effectiveness metric requires a separately approved registry definition and privacy review.
