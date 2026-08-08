# Facility Geofence Architecture Discovery and Validation Plan

- **Version:** 2.1
- **Status:** Advisory and submission-time Owner context accepted; notification implementation and red enforcement pilot pending; legacy transition deferred
- **Owner:** CreteXchange Product and Engineering
- **Date:** 2026-08-08
- **Classification:** Internal

## 1. Work-package boundary

This record began as the documentation-first audit and sequencing for canonical Facility geofencing. The additive geofence foundation, migrations `0040` and `0041`, Owner boundary management, Driver advisory evaluation, submission-time evidence capture, submission-time Owner review context, and default-off Facility-scoped control foundation were later released under bounded Founder authorizations. Owner/Driver advisory scope and submission-time Owner context are accepted.

The next bounded geofence work is the completed-submission notification workflow defined by the Founder on 2026-08-08. Notification implementation is not activated. The red submission-enforcement pilot is not activated. Legacy transition is unrelated to notifications and deferred. Owner delivery and Washout Review visibility is independent of all geofence controls. Phase 5 Sprint 3 Two-Factor Authentication has not begun.

## 2. Verified baseline

- Local branch: `main`
- Local SHA at discovery: `8c9b9d7b947bba766d3f6f670c27b0a6603cb91f`
- GitHub `main` SHA at discovery: `8c9b9d7b947bba766d3f6f670c27b0a6603cb91f`
- Railway Production deployment: `04e27b8f-b00c-4409-9ed1-59e7fde52281`, `SUCCESS`
- Railway Production SHA: `8c9b9d7b947bba766d3f6f670c27b0a6603cb91f`
- Starting worktree: clean
- Stopped location-indicator remnants: none

## 3. Governing sources

- Documentation Library and Project Context
- CTX-STD-001, CTX-GOV-001, CTX-POL-003, CTX-POL-008, and CTX-DEP-001
- CTX-ARCH-002, CTX-ARCH-003, CTX-ARCH-004, CTX-ARCH-013, and CTX-ARCH-015
- PD-050, PD-051, PD-052, PD-058, and PD-060
- CTX-UX-003, CTX-UX-004, CTX-UX-005, CTX-UX-006, and CTX-UX-008
- ADR-006, ADR-011, ADR-012, ADR-016, ADR-018, ADR-020, ADR-028, and ADR-029 as cataloged in their governing architecture/standards documents
- CTX-RB-006, CTX-RB-007, CTX-RB-008, and the Assisted-Pilot Operations Runbook
- Development Protocol and CTX-OPS-001 for any later release

### Work Package 1 implementation baseline

- Starting local/GitHub/Railway Production SHA: `20ffc55d01d9416ac6d211382c6b2332a47039bc`
- Starting worktree: clean
- Validation level: Level 3; eventual release remains Level 4
- Migration: `0040_add_canonical_facility_geofence_foundation.sql`, additive and not executed against Production
- Server geometry decision: focused Turf 7.3.5 modules under [ADR-033](../architecture/ADR-033-canonical-server-geofence-library.md)
- Feature controls: advisory, Owner boundary management, submission enforcement, notifications, and legacy transition; all disabled
- Production status: unchanged; database connected and financial execution disabled at preflight

### Integrated Level 4 checkpoint baseline

- Feature branch: `feature/canonical-facility-geofence`
- Checkpoint starting SHA: `33d356acee69dac6d3218a4e6788f18d8dfb454f`
- Production/main isolation baseline: `20ffc55d01d9416ac6d211382c6b2332a47039bc`
- Migration checksum: `cc1686086b3c713b1567a35a9cada82d2690746f4d3527358023d2a97fc57bcd`
- Detailed evidence: [Canonical Facility Geofence Level 4 Validation Closeout](../releases/canonical-facility-geofence-level-4-validation.md)

## 4. Discovery baseline findings

This section preserves the gaps observed before implementation. It is historical discovery evidence and is superseded for current status by the Level 4 closeout linked above.

### Canonical operational sources

- Facility point/address: `washout_locations` and Owner location routes/storage.
- Driver material/Facility eligibility: `drivers.active_material_slug`, `location_material_intents`, `server/driverLocationEligibility.ts`, and `GET /api/drivers/locations`.
- Driver position acquisition: browser Geolocation API through `client/src/lib/gps.ts` and direct uses in legacy map components.
- Evidence location validation: `shared/photoVerification.ts` called by `POST /api/activities/create-with-photos`.
- Photo/integrity retention and routing: canonical activity/photo/review records plus `server/adminPhotoReviewRetention.ts` and CTX-ARCH-015.
- Owner review: Owner activity verify/reject routes and append-only activity review events.
- Dispute: `washout_activity_admin_reviews` and existing Administrative Review routes.
- Notification delivery: `server/notificationService.ts` and governed templates in `shared/notifications.ts`.

### Missing capabilities

- No activated Production Facility radius setting.
- No activated Production polygon or operational zone. Work Package 1 provides only not-yet-migrated versioned storage.
- No Production boundary version/effective-time record. Work Package 1 provides only the additive contract.
- No Production durable activity-to-boundary evaluation. Work Package 1 provides only append-only persistence and service preparation.
- No Driver accuracy in the submitted photo/geofence contract.
- No participant-facing use of polygon validation or nearest-edge evaluation. The canonical server service now exists locally behind disabled controls.
- No Owner boundary editor or history.

### Duplicate/conflicting logic

1. `shared/photoVerification.ts` calculates Haversine center distance and uses 1-mile/3-mile thresholds.
2. `client/src/lib/gps.ts` implements Haversine for Driver Dashboard ranking.
3. `client/src/pages/driver/locations.tsx` contains another Haversine implementation and substitutes Denver after GPS failure.
4. Rubble search in `server/routes.ts` contains another Haversine implementation.
5. Rubble arrival and completion each duplicate a 500-foot center-distance check.

There is no repository four-mile constant. Any observed four-mile rejection is an outcome under center-distance validation, not an approved four-mile rule.

## 5. Approved development sequence

The Founder has approved CTX-ARCH-016, PD-061, CTX-UX-009, CTX-RB-010, and this documentation set. The approved sequence and current state are:

1. Governance-document approval
2. Documentation-only commit
3. Isolated migration and implementation design — complete
4. Founder approval of migration/implementation design — complete
5. Canonical server geofence service — released
6. Owner boundary-management workflow — released and Founder-accepted
7. Driver advisory indicator — released and Founder-accepted
8. Submission-time geofence evidence and Owner review context — released and Founder-accepted
9. Facility-scoped default-off control foundation and Admin interface — released; control safety correction released
10. Completed-submission notification documentation — current approved checkpoint
11. Gray-capable notification implementation and isolated validation — not begun
12. Controlled yellow/Gray notification release and Founder acceptance — pending separate authorization
13. Controlled red submission-enforcement pilot — not activated; requires separate authorization after notification acceptance
14. Legacy transition — deferred until configured Facilities complete acceptance
15. Phase 5 Sprint 3 — Two-Factor Authentication — not begun

Migration `0040` is additive and covers versioned boundary rows, revision events, durable activity evaluations, indexes, lifecycle/mode/uniqueness and idempotency constraints, feature flags, recovery evidence, and application rollback that retains additive data. It does not infer polygons or backfill active geometry. It must not reach Production without explicit Founder authorization and a recovery checkpoint.

## 6. Required test matrix

| Area | Required cases |
| --- | --- |
| Radius | Center/inside, exact circumference, just outside, exact exception threshold from radius edge, beyond threshold |
| Polygon | Inside, exact edge/vertex, just outside, nearest edge not centroid, exact exception threshold, beyond threshold |
| Geometry validation | Open ring normalization policy, fewer than 3 distinct points, non-finite/out-of-range coordinate, adjacent duplicate, collinear/near-zero area, self-intersection, vertex/area/extent limits, invalid JSON/type |
| GPS | Permission denied, unavailable, stale, missing accuracy, accuracy above maximum, `LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY`, `LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD` |
| Versioning | Draft has no runtime effect, atomic activation, one active primary zone, active workflow retains earlier version, correction is prospective, invalidated boundary fails safely |
| Driver advisory | Green/yellow/red/neutral, status loading/error/retry, nearest ordering unchanged, yellow/red selectable, no precise data/geometry, no passive notification/audit/analytics |
| Yellow submission | Every reason code, acknowledgement required, optional bounded note, required photo, accuracy/timestamp, boundary version, incomplete attempt creates no activity, ordinary Owner queue, combined Owner notice, low-priority Admin/Super Admin notice, neutral Driver confirmation, idempotency, no active Photo Review by default |
| Red submission | Retain/quarantine, bypass Owner, active Admin Photo Review, Driver neutral notice, Admin/Super Admin notices, exclusions from success/reward/settlement metrics |
| Owner | Ownership enforcement, another Owner denied, radius/polygon draft, preview, server validation, activation, revision history, temporary context, correction, assistance request |
| Admin and dispute | Existing Photo Review classifications preserved, evidence endpoint privacy, Administrative Review unchanged, no automatic fraud label |
| Notification | No passive side effects; ordinary green Owner notice not duplicated; yellow and all six Gray states; red no-Owner rule under authorized enforcement; Notification Service only; one idempotent notice per approved recipient/event; English/Spanish; safe RBAC deep links; delivery failure does not roll back canonical activity/evidence |
| Accessibility/localization | English/Spanish parity, visible non-color label/icon, contrast, keyboard, screen reader, touch, reduced motion, map fallback/structured vertex editing |
| Performance | Bounded location/vertex/request limits, bulk active-boundary query, no N+1, geometry cache, query plans, server evaluation budget |
| Regression | Driver golden path, eligibility, GPS recovery, Owner verification/rejection, Admin Photo Review, Administrative Review, Notification Center |
| Financial isolation | No wallet, Stripe, billing, reward, achievement, competition, settlement, payout, or financial-execution mutation; execution remains disabled |

## 7. Risk and validation

The original documentation package was assigned Development Protocol Level 2. Work Package 1 was Level 3 because it changed schema definitions, added a migration and persistent private evidence contract, and created authorization-sensitive server infrastructure. The integrated release checkpoint is Level 4.

The earlier Level 4 checkpoint passed TypeScript, Production build, one complete suite, the focused geofence/Owner/Driver/Admin/Notification/RBAC/privacy/localization/financial matrix, isolated PostgreSQL migration/rollback/reapplication, schema and immutability checks, and final privacy/performance/query-bounding review. Later bounded releases and Founder visual acceptance established the current advisory and submission-time Owner-context baseline. Those results do not validate the newly expanded Gray notification contract; the notification implementation requires its own focused Level 3 engineering checkpoint and a separately authorized Production release/acceptance sequence.

### Work Package 1 migration verification and recovery plan

1. Verify migration `0040` checksum and exact release scope before any later authorized execution.
2. Confirm target identity, approved recovery checkpoint, schema compatibility, and absence of pre-existing conflicting geofence flag keys.
3. Execute the migration as one controlled transaction, separately from application startup.
4. Verify all three tables, foreign keys, checks, unique/partial indexes, append-only triggers, activated-version immutability, and five disabled flags.
5. Verify no boundary rows were inferred/backfilled and no existing operational/financial records changed.
6. For application rollback, keep the additive data and set all five geofence controls false; the unchanged legacy paths remain authoritative.
7. If transaction execution fails before commit, roll back the transaction and retain evidence. After commit, prefer disabled application rollback or separately approved forward repair. Do not destructively remove retained boundary/evaluation evidence without a new recovery authorization.

The isolated validation test created only minimal prerequisite tables in a temporary local PostgreSQL cluster, applied `0040` inside `BEGIN`, verified the catalog, rolled back and confirmed the new tables were absent, reapplied the migration, exercised constraints/triggers/idempotency/version references, forced all geofence flags false, and confirmed revision/evaluation evidence remained. The temporary cluster was stopped and removed after the test. No external or Production database was contacted.

## 8. Founder decisions incorporated

1. Versioned GeoJSON `Polygon` in PostgreSQL JSONB with one bounded server geospatial library; server authority and deterministic tests; PostGIS deferred; custom/provider-authoritative classification rejected.
2. One active primary configurable radius or Owner polygon per Facility, with compatible but deferred multi-zone evolution.
3. Nine canonical states, including two explicit uncertainty-overlap states, exact-edge-inside semantics, nearest-polygon-edge and radius-edge distance, and a one-mile platform-governed exception zone that Owners cannot enlarge.
4. Proposed controlled GPS defaults of no more than 60 seconds old and 100 meters or better, with insufficient-confidence classification when uncertainty overlaps a threshold.
5. Proposed configurable polygon guardrails: WGS84, one closed exterior ring, at least three distinct non-collinear vertices, at most 200 distinct vertices, no self-intersection, valid ranges, two-square-mile maximum area, and five-mile maximum span.
6. Draft-preview-validate activation, immutable versions, effective timestamps/checksums, prospective corrections, retained history, and activation only by an authorized Owner or separately authorized Admin process.
7. Advisory Driver indicators with no passive side effects and authoritative reevaluation at check-in/submission.
8. Complete yellow submissions enter ordinary Owner review with governed evidence; incomplete attempts receive corrective guidance and create no activity.
9. Completed yellow notifications: neutral Driver confirmation, one boundary-review Owner notice, and one low-priority Admin/Super Admin assistance notice per approved recipient/event; no active Photo Review by default.
10. Completed Gray notifications: neutral, state-specific Driver communication, Owner uncertainty/configuration notice, and low-priority Admin/Super Admin assistance notice; no fraud/rejection language.
11. Red submissions, only under authorized enforcement, use PD-060 atomic retention/quarantine, neutral Driver and active Admin routing, no Owner notice, no fraud label, and no success/reward/financial result.
12. Passive Driver activity creates no notification side effect; green uses the ordinary Owner pending-review notice without a duplicate geofence notice.
13. Submission enforcement is a future-submission routing switch; notifications are a separate completed-submission workflow; legacy transition is unrelated and deferred; none controls Owner delivery visibility.
14. Minimum-necessary privacy, Facility-scoped RBAC, deterministic idempotency, safe payloads, append-only evidence, existing Photo Review controls, and delivery failure isolated from the canonical activity/evidence transaction.

The prior seven-state contract conflict is resolved by adding the two explicit uncertainty-overlap states and governing all six uncertainty/unavailable/configuration results as Gray. PD-060 and PD-061 are reconciled: yellow and Gray are not platform rejections; red uses PD-060 only under separately authorized enforcement. No unresolved policy conflict remains. Runtime implementation and activation of the expanded notification matrix remain pending.

## 9. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial audit, test matrix, and proposed sequencing; documentation only. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved architecture, policy, transition, migration, validation, and fourteen-step sequencing; documentation only. |
| 1.0 | 2026-08-04 | Founder approved the final documentation package; migration design and implementation remain separately authorized. |
| 1.1 | 2026-08-04 | Recorded the separately authorized, locally implemented Work Package 1 data foundation, disabled controls, canonical server service, ADR-033, isolated migration/recovery validation, and pending Founder acceptance. |
| 2.0 | 2026-08-05 | Recorded the integrated Level 4 engineering checkpoint, isolated migration lifecycle, complete automated matrix, query-bounding hardening, Production isolation, and the remaining controlled visual acceptance gate. |
| 2.1 | 2026-08-08 | Recorded accepted advisory/Owner-context scope, the completed-submission green/yellow/Gray/red notification matrix, control separation, PD-060/PD-061 reconciliation, and the remaining implementation/activation sequence. |
