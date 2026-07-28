# CTX-MET-001 — Platform Metric Registry

**Status:** Approved for Phase 2 Sprint 2 foundation implementation
**Owner:** V8 Laboratories
**Classification:** Internal operational analytics; no financial, payment, private-storage, contact, GPS, or sensitive metadata is included.

## Registry rules

This is the authoritative registry for platform metrics. `server/platformAnalytics.ts` exports the matching `PLATFORM_METRIC_REGISTRY`; report consumers must not recreate these formulas. Events and canonical operational tables are referenced rather than copied. All timestamps are UTC; a report that displays local time must name the presentation timezone without changing the recorded calculation window.

| Metric | Purpose | Source events / tables | Calculation | Include | Exclude | Time / visible roles |
| --- | --- | --- | --- | --- | --- | --- |
| Submitted Activity | Measure activity entering Owner review. | `activity.submitted`; `washout_activities` | Count submitted events. | One committed submission. | Payments, wallets, failures, duplicates. | Submission time; Admin, Super Admin, Owner. |
| Verified Activity | Measure completed operational verification. | `activity.verified`; `washout_activities`, review audit | Count verified events. | Canonical Owner pending-to-verified decisions. | Facilitator actions, payment success, pending records. | Verification time; Admin, Super Admin, Owner. |
| Rejected Activity | Measure operational exceptions. | `activity.rejected`; `washout_activities`, review audit | Count rejected events. | Canonical Owner pending-to-rejected decisions. | Open review requests and non-final records. | Rejection time; Admin, Super Admin, Owner. |
| Administrative Review Requested | Measure neutral facilitation demand. | `admin_review.requested`; `washout_activity_admin_reviews` | Count request events. | One committed review round. | Owner decisions and finance. | Request time; Admin, Super Admin. |
| Administrative Review Completed | Measure facilitator throughput. | `admin_review.closed`, `admin_review.returned_to_owner_review`; review tables | Count either terminal facilitator event. | A completed facilitator decision. | Open requests and payment outcomes. | Decision time; Admin, Super Admin. |
| Active Drivers | Measure active operational supply. | activity submitted/verified/rejected; `drivers`, `washout_activities` | Distinct `driver_id`. | Non-null Driver on qualifying activity event. | Registration-only and financial data. | Event time; Admin, Super Admin. |
| Active Facilities | Measure active demand locations. | `activity.submitted`; `washout_locations`, `washout_activities` | Distinct `location_id`. | Submitted activity at a location. | Unused or inactive-only locations and billing data. | Submission time; Admin, Super Admin. |
| Driver Retention | Measure repeat participation. | `activity.submitted`, `activity.repeat_submitted`; `drivers`, `washout_activities` | Distinct repeat Drivers / distinct submitted Drivers × 100. | Drivers with actual first and repeat submissions. | Accounts without activity and finance. | Repeat-submission time; Admin, Super Admin. |
| Facility Utilization | Measure operational use of active locations. | `activity.submitted`; `washout_locations`, `washout_activities` | Submitted activity / active Facilities. | Submitted events with location. | Billing and financial configuration. | Submission time; Admin, Super Admin, Owner. |
| Verification Rate | Measure evidence acceptance quality. | `activity.verified`, `activity.rejected`; activity/review audit | Verified / (verified + rejected) × 100. | Final Owner decisions. | Pending records, facilitator-only actions, finance. | Owner decision time; Admin, Super Admin, Owner. |

## Reusable journeys

| Journey | Ordered stages | Entity key |
| --- | --- | --- |
| Driver | Registration → Profile Completed → First Login → Check-In → Photo Upload → Verification → Repeat Activity | `driver_id` |
| Facility | Registration → Approval → First Driver → First Verified Washout → Recurring Usage | `location_id` |
| Washout | Check-In → Photo Upload → Administrative Review (optional) → Verification → Completion | `activity_id` |

Completion is the actual canonical `activity.verified` terminal fact; no synthetic completion event is created. Administrative Review is optional because it applies only to a rejected activity that enters facilitation.

## Drop-off methodology

For each bounded reporting window, the intelligence layer groups recorded events by the journey entity key and uses the earliest event that satisfies each stage. It returns:

- **Entry count:** entities that reached the first required stage.
- **Exit count:** entities that reached the last required stage.
- **Conversion:** exit count ÷ entry count.
- **Abandonment:** 1 − conversion.
- **Stage conversion/drop-off:** each required stage reached ÷ prior required stage reached; optional stages are descriptive and do not create mandatory drop-off.
- **Average/median duration:** first-stage to final-stage elapsed milliseconds for entities that reached both.

The methodology does not estimate missing stages, infer progress from mutable status, or claim coverage before instrumentation. Queries are UTC and bounded to 93 days/10,000 events. Any later cohort or local-business-time policy requires a separately versioned metric definition.
