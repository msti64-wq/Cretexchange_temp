# CTX-ARCH-016 — Canonical Facility Geofence Architecture

- **Document ID:** CTX-ARCH-016
- **Version:** 1.2
- **Status:** Approved — complete feature-branch vertical slice implemented; migration, activation, merge, and release pending Founder authorization
- **Owner:** CreteXchange Product and Engineering
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Effective Date:** 2026-08-04
- **Classification:** Internal
- **Review Frequency:** Event-driven before implementation and after a material geofence change
- **Last Reviewed:** 2026-08-04
- **Next Review:** Before migration/implementation design approval or after a material geofence change

## 1. Purpose and authority boundary

This architecture defines one server-authoritative Facility geofence capability for Driver guidance, check-in, evidence submission, operational exceptions, retained evidence, and governed boundary correction. It supports one active primary verification boundary per configured Facility: an explicitly configured radius or one Owner-defined polygon. The initial polygon represents the approved Driver delivery, disposal, recovery, or washout area, not automatically the full property. The versioned `zone_key` model preserves future compatibility with multiple approved polygons, separate entrances, multiple washout areas, operational material zones, and large industrial campuses, but those capabilities are deferred unless separately approved.

The separately authorized feature-branch implementation now includes the additive schema/migration, disabled controls, canonical server service, Owner boundary workflow, Driver advisory, submission enforcement, notification routing, safe Owner/Admin context, and focused tests described here. The work remains confined to `feature/canonical-facility-geofence`; migration `0040` is not executed outside isolated validation, every new feature control defaults disabled, and no merge, Production deployment, Production data mutation, Production activation, legacy retirement, or 2FA work is authorized. It remains subordinate to [CTX-STD-001](../standards/cretexchange-platform-standards.md), [CTX-ARCH-002](./owner-operations-architecture.md), [CTX-ARCH-003](./driver-operations-architecture.md), [CTX-ARCH-013](./CTX-ARCH-013-notification-and-communication-center.md), [CTX-ARCH-015](./CTX-ARCH-015-photo-review-retention-and-integrity-routing.md), [PD-060](../product/PD-060-photo-review-retention-and-platform-rejection.md), and the [Development Protocol](../development-protocol.md).

## 2. Pre-implementation audit (historical baseline)

The current repository has no canonical Facility boundary entity and no approved polygon capability.

| Concern | Current source | Finding |
| --- | --- | --- |
| Facility point | `washout_locations.latitude` and `washout_locations.longitude` in `shared/schema.ts` | Required geocoded WGS84-like decimal point; it is an address/marker point, not an approved delivery boundary. |
| Facility radius | None | No radius column, Facility setting, version, or governed default exists. |
| Facility polygon | None | No geometry, polygon, operational-zone, or revision entity exists. |
| Driver GPS | `client/src/lib/gps.ts` | Browser latitude/longitude is captured; browser-reported accuracy is discarded. |
| Selection distance | `client/src/pages/driver/locations.tsx` | Client Haversine center distance; GPS failure substitutes Denver coordinates. |
| Dashboard distance | `client/src/lib/gps.ts` consumed by `client/src/pages/driver/dashboard.tsx` | A second client Haversine implementation. |
| Photo validation | `shared/photoVerification.ts` called by `server/routes.ts` | Center distance: `verified` at no more than 1 mile, `warning` at no more than 3 miles, otherwise `failed`. No accuracy or boundary-edge calculation. |
| Legacy rubble arrival/completion | Inline logic in `server/routes.ts` | Two duplicated 500-foot center-distance checks; completion then also calls photo verification. |
| Rubble search | Inline logic in `server/routes.ts` | Another server Haversine implementation for nearest sorting. |
| Driver selection | `GET /api/drivers/locations`, `client/src/pages/driver/locations.tsx`, and `/check-in/:locationId` | Material eligibility is server-authoritative; geographic guidance is client-calculated. |
| Evidence submission | `POST /api/activities/create-with-photos` | Server evaluates photo GPS, freshness, duplicate evidence, and technical validity. |
| Platform integrity routing | `server/routes.ts`, `server/adminPhotoReviewRetention.ts`, and CTX-ARCH-015 | Non-verified evidence can be retained as a platform rejection, bypass Owner review, and create neutral Driver/Admin notifications. |
| Owner outcome | Owner activity verify/reject routes in `server/routes.ts` | Owner verification/rejection remains separate from platform detection. |
| Administrative Review | `washout_activity_admin_reviews` and related routes/services | Existing dispute/facilitation mechanism; it does not edit Facility geometry. |
| Notification delivery | `server/notificationService.ts` and CTX-ARCH-013 | Recipient-scoped, localized, idempotent service; no geofence-specific template currently exists. |
| Owner Facility configuration | Owner location routes, `client/src/pages/owner/locations.tsx`, Mapbox address autocomplete | Owners manage point/address and operational settings only; no boundary editor exists. |
| Maps/providers | Google Maps components plus Mapbox geocoding/autocomplete | Google Maps displays markers and supports a point picker; Mapbox resolves addresses. No polygon editor or geospatial calculation library is installed. |

Repository search found no four-mile threshold or constant. The phrase “four-mile behavior” therefore describes an observed submission/distance outcome, not an implemented rule. The current code thresholds are one mile, three miles, and 500 feet, all measured from a Facility point.

## 3. Canonical source-of-truth proposal

The canonical authority SHALL be a versioned, active Facility boundary record plus one server geofence service. The service owns geometry validation, point-in-boundary evaluation, nearest-edge distance, accuracy treatment, result classification, and the boundary version used.

Clients MAY acquire device position, draw a draft polygon, display a server result, and order already-authorized locations. Clients SHALL NOT decide whether a position is inside, yellow, red, valid, or reviewable. Check-in and submission SHALL call the same server service again and SHALL NOT trust an earlier advisory result.

The Facility point remains the address/map marker and may seed a radius draft. It does not become an approved polygon and does not by itself authorize an active boundary.

## 4. Approved storage and calculation direction

### 4.1 Approved direction

Use governed GeoJSON `Polygon` in PostgreSQL `jsonb` for versioned polygon storage and one bounded server geospatial library for validation and evaluation. Store radius boundaries in the same versioned domain using an explicit center and radius in meters. Do not enable PostGIS in the first implementation. PostGIS remains deferred until scale, spatial-query, or measured performance evidence justifies it.

Reasons:

- evaluation is normally for one selected Facility or a bounded eligible list, not an unbounded spatial search;
- JSONB is compatible with the existing Railway/PostgreSQL stack without an extension;
- a server library is easy to unit-test with fixtures and can provide point-in-polygon, point-on-edge, nearest-segment distance, area, and self-intersection validation;
- versioned rows preserve the exact geometry used for earlier submissions;
- operational risk and rollback are lower than introducing an extension during the first governed rollout; and
- the model can later migrate or mirror active geometry to PostGIS without changing the public result contract.

Work Package 1 selects the focused MIT-licensed Turf 7.3.5 server module set recorded in [ADR-033](./ADR-033-canonical-server-geofence-library.md): `area`, `bbox`, `boolean-point-in-polygon`, `distance`, `helpers`, `kinks`, and `point-to-line-distance`. The seven exact-version modules add 18 package-lock nodes and are imported only by the server service. No client Turf import or participant-facing bundling is introduced.

### 4.2 Alternatives considered

| Approach | Strengths | Risks / disposition |
| --- | --- | --- |
| PostgreSQL/PostGIS `geography`/`geometry` with GiST | Strong database correctness, spatial indexing, `ST_Covers`, `ST_DWithin`, and future network-scale queries | Highest deployment and migration risk; extension availability/backup/recovery must be proven on Railway. Defer until volume or spatial-query requirements justify it. |
| GeoJSON/JSONB plus server library | Lowest operational complexity, portable, deterministic tests, adequate for bounded per-Facility evaluation | Application must enforce geometry validity and cannot rely on database spatial constraints. **Recommended for first implementation.** |
| Ad hoc arrays and custom geometry math | No dependency | High correctness and maintenance risk; repeats the defect pattern of duplicated Haversine logic. Rejected. |
| Provider-only geometry calculation | Uses existing map provider UI | Couples operational authority to a browser/provider response and weakens reproducibility/version history. Rejected. |

## 5. Geometry methodology

1. Coordinates use WGS84 longitude/latitude order: `[longitude, latitude]`.
2. A polygon uses one primary `Polygon` exterior ring in the first release. Holes and multipolygons are deferred.
3. The exterior ring is closed: its first and last coordinate pairs are identical.
4. It has at least three distinct, non-collinear vertices and at least four coordinate pairs including closure.
5. Every coordinate is finite and within longitude `[-180, 180]` and latitude `[-90, 90]`.
6. Self-intersection, duplicate adjacent vertices, zero/near-zero area, and invalid ring topology fail validation.
7. Server validation SHALL enforce governed, configurable limits for vertices, area, and geographic span. The proposed initial controlled limits are no more than 200 distinct vertices, no self-intersection, no zero/near-zero operational area, a maximum approved operational area of two square miles, and a maximum geographic span of five miles. These limits are configuration, not scattered constants.
8. Exact contact with a radius circumference or polygon edge is `INSIDE_APPROVED_BOUNDARY`.
9. Radius outside distance is `max(0, centerDistance - radius)`.
10. Polygon outside distance is the minimum geodesic distance from the point to any exterior-ring segment, not distance to a centroid.
11. An outside point is yellow through the configured exception threshold and red beyond it. The proposed initial exception distance is one mile, governed by platform configuration. A Facility Owner cannot enlarge it.
12. Clients consume the canonical server classification and do not duplicate polygon, radius, or exception calculations.
13. Calculations return meters internally. Miles are presentation only.
14. Antimeridian-crossing polygons are outside the initial supported operating envelope and require an explicit future methodology.

Server validation is required before activation. Invalid geometry cannot be activated, and an activated boundary version is immutable.

## 6. GPS reliability and uncertainty

The observation contract includes latitude, longitude, browser/device accuracy in meters, and observation timestamp. Missing, non-finite, or out-of-range coordinates and unavailable or permission-denied location produce `LOCATION_UNAVAILABLE` and a neutral Driver result.

The service SHALL use the reported accuracy as an uncertainty radius. If the uncertainty interval materially overlaps the boundary or exception-zone threshold, the result is `LOCATION_ACCURACY_INSUFFICIENT`, not green, yellow, or red. The proposed initial controlled defaults require an observation no more than 60 seconds old and reported accuracy of 100 meters or better. A stale observation, missing accuracy, or accuracy worse than 100 meters returns `LOCATION_ACCURACY_INSUFFICIENT`. Age and accuracy thresholds are governed server configuration so controlled field observation can support later adjustment without duplicated logic.

The application SHALL not substitute a default city, Facility point, prior coordinate, or zero coordinate when GPS is unavailable.

## 7. Canonical result contract

```ts
type FacilityGeofenceState =
  | "INSIDE_APPROVED_BOUNDARY"
  | "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
  | "OUTSIDE_EXCEPTION_ZONE"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_ACCURACY_INSUFFICIENT"
  | "GEOMETRY_UNAVAILABLE"
  | "GEOMETRY_INVALID";

interface FacilityGeofenceResult {
  locationId: string;
  boundaryVersionId: string | null;
  state: FacilityGeofenceState;
  evaluatedAt: string;
  observationTimestamp: string | null;
  advisory: boolean;
  reasonCode: string;
  canSubmitException: boolean;
  // Internal evidence only; omitted from Driver list responses:
  signedDistanceMeters?: number | null;
  outsideDistanceMeters?: number | null;
  accuracyMeters?: number | null;
}
```

Color is a presentation mapping, never a stored or authoritative state. `GEOMETRY_INVALID` is fail-closed and neutral to Drivers; it creates an operational configuration issue only through a separately authorized workflow, not through passive display.

## 8. Implemented Work Package 1 data model

The repository now contains matching Drizzle definitions and the additive, not-yet-executed migration `migrations/0040_add_canonical_facility_geofence_foundation.sql`. The migration creates no boundary backfill and performs no automatic activation. It also seeds five disabled records into the existing `feature_flags` system. Production execution remains separately prohibited.

### `facility_geofence_boundaries`

Versioned, immutable-after-activation boundary rows:

- `id`
- `location_id`
- `zone_key` (`primary` initially)
- `version`
- `mode` (`radius` or `polygon`)
- `center_latitude`, `center_longitude`, `radius_meters` for radius mode
- `geometry_geojson` for polygon mode
- `exception_distance_meters` snapshotted from governed configuration
- `geometry_checksum`
- `status` (`draft`, `active`, `superseded`, `invalidated`)
- `effective_from`, `effective_to`
- `previous_version_id`
- `created_by`, `created_at`, `activated_by`, `activated_at`

Required constraints include unique `(location_id, zone_key, version)`, only one active row per `(location_id, zone_key)`, mode-specific required fields, positive radius/exception distance, and valid lifecycle timestamps. Index active lookup by location and effective time. JSONB geometry is not itself trusted without server validation.

### `facility_geofence_revision_events`

Append-only events for draft creation, validation, activation, supersession, invalidation, assistance request, and correction rationale. Store actor, role, Facility, boundary version, timestamp, safe reason code, and request/idempotency identity. Do not store cookies, tokens, or unnecessary location observations.

### `activity_geofence_evaluations`

Append-only submission/check-in evidence:

- activity or pending-workflow reference
- Facility and boundary version
- canonical result state and reason code
- private observation coordinates, accuracy, observed/evaluated timestamps
- signed/outside distance in meters
- exception acknowledgement code and optional bounded Driver note
- evidence-completeness flags
- evaluation purpose (`selection_advisory`, `check_in`, `submission`), with selection advisories not persisted by default
- idempotency key and created timestamp

The durable record is necessary for check-in/submission and dispute reproducibility. Passive list indicators SHALL not create rows, notifications, audits, or analytics events.

## 9. Existing-Facility transition

No polygon can be inferred from a postal address, marker point, satellite imagery, property parcel, historical Driver points, or clustered submissions. An inferred shape could include prohibited property or omit the approved operational area.

Existing Facilities remain on the isolated legacy center-distance submission behavior until an authorized Owner activates a valid governed boundary. New geofence enforcement applies only when the selected Facility has an active valid boundary. An advisory request for an unconfigured Facility may return `GEOMETRY_UNAVAILABLE`, but that neutral advisory must not make the Facility unusable or silently enable new enforcement.

The legacy compatibility path is feature-flagged, explicit, and transitional: through one mile from the Facility point is `verified`; more than one through three miles is `warning`; beyond three miles is `failed`. There is no four-mile rule—a four-mile observation fails because it exceeds three miles. The two duplicated 500-foot rubble arrival/completion checks remain separate legacy behavior requiring later convergence through the canonical geofence service.

No polygon or active radius may be inferred or backfilled. A radius draft may be seeded from the existing Facility point, but it remains a draft until an authorized Owner previews, validates, and activates it. Legacy behavior may be retired only after affected pilot Facilities are configured, tested, approved, and pass the separately governed release gates. No Production backfill or automatic activation is authorized.

## 10. Implemented feature-branch API boundaries

| Method and route | Purpose | Authorization |
| --- | --- | --- |
| `POST /api/drivers/locations/geofence-status` | Batch-evaluate a fresh position against the authenticated Driver's bounded eligible Facilities and return safe states | Driver only; server re-resolves eligibility |
| `POST /api/drivers/locations/:locationId/geofence-check` | Fresh check-in preflight using the canonical evaluator; side-effect free | Driver only; server re-resolves current material eligibility |
| `POST /api/activities/create-with-photos` | Reevaluate at submission and atomically persist activity, private photos, and durable evaluation; route yellow/red per policy | Ready Driver; selected Facility must remain eligible |
| `GET /api/owners/locations/:id/geofence` | Read active/draft boundary and safe revision metadata | Owning authorized Owner; Admin only under separate authority |
| `POST /api/owners/locations/:id/geofence/validate` | Validate and preview a draft without activation | Owning authorized Owner |
| `POST /api/owners/locations/:id/geofence/drafts` | Create a validated new draft version | Owning authorized Owner |
| `POST /api/owners/locations/:id/geofence/versions/:versionId/activate` | Revalidate then atomically activate/supersede | Owning authorized Owner; explicit confirmation required |
| `POST /api/owners/locations/:id/geofence/assistance` | Request Admin assistance without changing geometry | Owning authorized Owner; idempotent Notification Service intent |
| `POST /api/owners/activities/:activityId/geofence/temporary-context` | Append temporary operational context without changing geometry or activity outcome | Owner of the activity's Facility only |
| `GET /api/admin/geofence/activities/:activityId/context` | Read minimum-necessary result, boundary version, and acknowledgement context | Admin/Super Admin only; no precise position or geometry |

Coordinates SHALL be sent in request bodies, never query strings. Driver responses omit geometry, exact distance-to-edge, coordinates, and internal validation details. Every route reauthorizes role, ownership, Facility eligibility, and active version.

## 11. Workflow and routing

- Selection guidance is advisory and side-effect free.
- Check-in and submission evaluate again with fresh position and accuracy.
- Green follows the ordinary workflow.
- Yellow requires explicit acknowledgement, a governed reason, required photo evidence, GPS timestamp/accuracy, evaluated boundary version, and an optional bounded note before the activity may enter ordinary Owner review. An incomplete yellow attempt returns corrective guidance and creates no incomplete activity.
- During the controlled pilot, one complete yellow submission creates one idempotent combined pending-review/boundary-review Owner notification, one idempotent low-priority operational-exception Admin/Super Admin notification, and a neutral Driver confirmation. It does not enter active Admin Photo Review unless separately escalated, disputed, or independently failed by a governed evidence rule.
- Red is a platform-detected integrity exception: atomically retain the supplied evidence, quarantine before Owner review, reuse the existing PD-060 active Admin Photo Review/integrity routing without a new classification, create idempotent Admin/Super Admin notifications, notify the Driver neutrally, and do not notify the Owner or label the Driver fraudulent.
- Unavailable, insufficient-accuracy, unavailable-geometry, and invalid-geometry results fail safely with corrective or support guidance; no state may be silently converted to green.
- Earlier activity remains attached to the version used at evaluation even if a new boundary activates later.

## 12. Performance, privacy, and security

- Batch-load active boundary rows for eligible Facilities; no N+1 boundary queries.
- Bound Facility count, vertices, request size, observation age, and evaluation time.
- Cache validated immutable geometry by boundary version/checksum on the server; activation invalidates the active lookup.
- Use bounding-box rejection before polygon segment distance, while preserving exact server evaluation.
- Run query-plan validation for active-boundary lookup and evaluation-history queries.
- Drivers receive only status and accessible label keys; Driver advisory responses do not require raw polygon geometry. Owners never receive another Owner's geometry or precise Driver coordinates, including in list payloads.
- Admin evidence access remains minimum-necessary and separately authorized.
- Logs and notifications contain safe IDs/result codes, not precise coordinates, storage paths, credentials, contact data, financial data, internal analytics payloads, or geometry.
- Boundary revisions, authoritative evaluations, notification intents, and review evidence are append-only and retain the existing Photo Review privacy and evidence-access controls.
- Geometry changes are operational only and cannot alter financial, reward, achievement, competition, wallet, Stripe, billing, payout, or settlement behavior.

## 13. Migration and rollback

The feature branch provides the additive migration file and matching repository schema definitions. It includes versioned boundary storage, append-only revision-event storage, durable activity geofence evaluations, active-version and history indexes, uniqueness/lifecycle/mode constraints, idempotency constraints, activated-version immutability, and same-Facility boundary/evaluation references. No Production migration, inferred polygon backfill, or activation has occurred or is authorized by this implementation result.

Recommended rollout: deploy additive tables and disabled code only after separate Founder authorization; validate catalog, constraints, indexes, backup, and recovery evidence; enable Owner draft/preview; activate selected pilot boundaries; enable advisory Driver reads; and enable check-in/submission enforcement only after acceptance. Application rollback disables reads/enforcement while retaining all additive boundary, revision, evaluation, notification, and review evidence. No destructive rollback is required or authorized.

## 14. Test strategy

The implementation checkpoint SHALL cover radius/polygon interior, exact edge, immediately outside, exactly at the configured exception threshold, beyond threshold, unavailable and inaccurate GPS, stale observations, invalid/self-intersecting geometry, boundary revision during a workflow, complete and incomplete yellow submissions, combined Owner and low-priority Admin yellow notifications, red quarantine, notification routing, no passive side effects, RBAC, privacy, localization, accessibility, bounded performance, and Driver/Owner/Admin Photo Review/Administrative Review/Notification regressions. Financial execution must remain disabled.

## 15. Founder decisions incorporated and remaining authority

The Founder has approved the architecture direction recorded here: JSONB GeoJSON with one bounded server library, one active primary radius or polygon, the seven canonical states, one-mile platform-governed exception distance, proposed GPS and polygon limits as governed configuration, immutable versioning, yellow and red workflow routing, privacy/RBAC controls, feature-flagged legacy transition, additive migration direction, and the sequencing in the [discovery and validation plan](../project/geofence-architecture-discovery-and-validation-plan.md).

Founder approval made this architecture effective as governance. Later Founder direction authorized the complete feature-branch vertical slice and focused commits without authorizing `main`, Production migration, Production feature activation, deployment, legacy retirement, or 2FA. Founder acceptance of the final branch checkpoint and every release action remain pending.

## 16. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial documentation-first architecture proposal after repository audit; no implementation or Production authority. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved direction for methodology, limits, workflow routing, transition, privacy, migration, and sequencing; still no implementation authority. |
| 1.0 | 2026-08-04 | Founder-approved canonical Facility geofence architecture made effective as governance; implementation remains separately authorized. |
| 1.1 | 2026-08-04 | Recorded the separately authorized local Work Package 1 implementation, ADR-033 dependency selection, additive migration/schema, disabled controls, canonical service, and pending Founder acceptance; no Production change. |
| 1.2 | 2026-08-04 | Recorded the authorized feature-branch Owner, Driver advisory, submission, notification, Admin context, and legacy-isolation vertical slice; release controls remain disabled and Production unchanged. |
