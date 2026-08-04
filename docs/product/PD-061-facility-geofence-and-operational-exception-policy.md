# PD-061 — Facility Geofence and Operational Exception Policy

- **Document ID:** PD-061
- **Version:** 1.0
- **Status:** Active — Founder-approved product policy; no implementation authority
- **Owner:** CreteXchange Product
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Effective Date:** 2026-08-04
- **Classification:** Internal
- **Review Frequency:** Event-driven after a material geofence, exception, evidence, or notification change
- **Last Reviewed:** 2026-08-04
- **Next Review:** Before migration/implementation design approval or after a material policy change

## 1. Approved policy direction

CreteXchange should use one server-authoritative, versioned Facility geofence to distinguish an approved Driver delivery, disposal, recovery, or washout area from the Facility address or entire property. A configured Facility initially has one active primary boundary: an explicitly configured radius or one Owner-defined polygon. The versioned model remains compatible with future multiple approved polygons, separate entrances, multiple washout areas, material zones, and large campuses without changing the canonical result contract; those capabilities remain deferred.

The Founder has approved this product policy. It is effective as governance but does not represent current runtime behavior or grant implementation authority.

## 2. Product rules

1. A Facility point is not an approved operational boundary.
2. An Owner-defined polygon represents the approved Driver delivery or washout area, not automatically the entire property or parcel.
3. Exact contact with a configured boundary counts as inside.
4. The exception distance is platform-governed configuration that a Facility Owner cannot enlarge. The proposed initial controlled value is one mile from the radius or nearest polygon edge.
5. Color is presentation only. The canonical result is a server state defined by [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md).
6. A passive Driver indicator or yellow/red Facility selection creates no Admin or Owner notification, activity, rejection, Administrative Review, Photo Review item, audit exception, financial event, reward event, or analytics event.
7. The platform evaluates again at check-in and submission using fresh position, accuracy, timestamp, and the active boundary version.
8. Location uncertainty is neutral. Missing or unreliable evidence is never displayed as green.
9. Geometry correction applies prospectively. Historical activity remains evaluated under its recorded boundary version.
10. No polygon is inferred from an address point, parcel, map image, historical Driver path, or clustered activity.

## 3. Driver guidance states

| Canonical result | Driver presentation | Meaning |
| --- | --- | --- |
| `INSIDE_APPROVED_BOUNDARY` | Green — “Inside facility boundary” | Reliable position is inside or exactly on the active approved radius/polygon. |
| `OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE` | Yellow — “Outside boundary — confirm location” | Position is outside but no more than the configured exception distance from the nearest edge. It is not approved Facility area. |
| `OUTSIDE_EXCEPTION_ZONE` | Red — “Too far from facility — review selection” | Position is beyond the configured exception zone. |
| `LOCATION_UNAVAILABLE` | Neutral — “Location could not be confirmed” | GPS is unavailable or permission is denied. |
| `LOCATION_ACCURACY_INSUFFICIENT` | Neutral — “Location could not be confirmed” | GPS is stale, less accurate than the configured maximum, or its uncertainty materially overlaps a threshold. |
| `GEOMETRY_UNAVAILABLE` | Neutral — “Location could not be confirmed” | No active governed geometry is available for canonical evaluation. |
| `GEOMETRY_INVALID` | Neutral — “Location could not be confirmed” | Geometry cannot be evaluated safely and cannot be activated. |

Yellow and red Facilities remain selectable during advisory discovery. Selection does not authorize submission.

## 4. Proposed yellow operational-exception workflow

A complete yellow submission may proceed to ordinary Owner review only after the Driver:

- acknowledges being outside the approved boundary;
- selects one governed reason: `FACILITY_PERSONNEL_DIRECTED`, `APPROVED_AREA_INACCESSIBLE`, `BOUNDARY_APPEARS_INCORRECT`, `GPS_APPEARS_INACCURATE`, or `OTHER`;
- may add a bounded optional factual note;
- supplies the otherwise required private photo evidence; and
- supplies a position with governed accuracy and timestamp requirements; and
- records the evaluated boundary version.

The system records the boundary version and canonical evaluation. The exception does not verify the activity and does not establish misconduct.

During the controlled pilot, the complete yellow submission creates one idempotent combined pending-review/boundary-review notification for the Facility Owner, one idempotent low-priority operational-exception notification for Admin/Super Admin, and an appropriate neutral Driver confirmation. The Owner notice may recommend boundary review, but it never expands or activates a boundary. Repeated-location clustering and automated correction recommendations remain deferred.

Yellow is an operational exception, not a platform-integrity rejection. It does not enter active Admin Photo Review unless separately escalated, disputed, or governed evidence independently fails. If acknowledgement, governed reason, required photo, GPS timestamp/accuracy, or boundary version is absent, the platform returns corrective guidance and creates no incomplete activity.

## 5. Proposed red workflow

A red submission should be retained atomically with its supplied evidence and quarantined before Owner review under PD-060:

- preserve exactly one canonical copy of submitted private evidence and append-only audit history;
- create active Admin Photo Review or integrity-review attention;
- send idempotent Admin and Super Admin notifications through the Notification Service;
- send the Driver accurate, neutral language;
- do not notify the Owner;
- exclude the activity from verification, operational-success metrics, rewards, achievements, competition credit, settlement, wallet value, payment, and financial execution; and
- never label the Driver fraudulent without an authorized Admin determination under a separately governed policy.

This reuses the existing Admin Photo Review/integrity classification and requires no new Admin Photo Review classification.

## 6. PD-060 and CTX-ARCH-015 reconciliation

PD-060 remains unchanged for routine Owner rejection and platform-detected integrity rejection. This proposal distinguishes a complete, acknowledged yellow operational exception from a red integrity rejection:

| Event | Owner queue | Admin active queue | Driver notice | Owner notice |
| --- | --- | --- | --- | --- |
| Passive indicator or yellow/red selection | No workflow created | None | None | None |
| Complete acknowledged yellow submission | Yes, pending ordinary review | Low-priority operational-exception notice; no active Photo Review unless escalated, disputed, or evidence independently fails | Neutral submission confirmation | One combined pending-review/boundary-review notice |
| Red submission | No | Yes | Neutral integrity-review notice | None |
| Routine Owner rejection | Already reviewed | No unless disputed/escalated | Existing rejection notice | No new notice |
| Driver Administrative Review request | Governed existing dispute path | Yes | Existing review notice | Existing governed review behavior |
| Owner requests boundary assistance | No activity reclassification | Admin assistance item, separate from Photo Review unless an activity is involved | None | Request confirmation |

All new notifications must use `server/notificationService.ts`, governed templates, safe metadata, role-scoped deep links, and deterministic idempotency keys. Notification delivery does not replace operational audit evidence.

## 7. Owner policy

An authorized Owner may draft, preview, validate, activate, supersede, and review history only for a Facility they own and may request Admin assistance. A separately authorized Admin process may activate a corrected version. Activation creates a new immutable version; it does not rewrite previous versions or earlier activity evaluations.

Marking an exception temporary records operational context only. It does not expand a polygon, change a radius, verify an activity, create a financial result, or establish a permanent rule.

## 8. Privacy, neutrality, and financial isolation

- Drivers do not receive boundary geometry, private Facility information, or internal validation detail.
- Owners do not receive another Owner's geometry or precise Driver coordinates, including in list payloads.
- Admin access remains minimum-necessary and purpose-limited.
- Notifications and general logs do not contain raw polygon geometry, precise coordinates, storage paths, credentials, contact data, financial data, or internal analytics payloads.
- Boundary, evaluation, notification, and review evidence is append-only, and existing Photo Review privacy/evidence controls remain in force.
- Automated location results are evidence signals, not fraud findings.
- No geofence result changes wallet, Stripe, billing, rewards, settlement, payout, or financial execution.
- Repeated failures require a separately governed account-integrity policy before automated warnings, suspension, or disabling.

## 9. Existing-Facility transition

Existing Facilities remain on the isolated legacy center-distance behavior until an authorized Owner activates a valid governed boundary. New geofence enforcement applies only to a Facility with an active valid boundary, and `GEOMETRY_UNAVAILABLE` must not make an unconfigured Facility unusable. No polygon is inferred or backfilled, no Production boundary is automatically activated, and retirement of the feature-flagged legacy path requires configured, tested, and approved affected pilot Facilities.

The current legacy photo-validation behavior is: through one mile from the Facility point is verified; more than one through three miles is warning; beyond three miles is failed. There is no four-mile rule. Separate duplicated 500-foot rubble arrival/completion checks are also legacy and require later convergence through the canonical server service.

## 10. Remaining authority and implementation decisions

The Founder-approved policy includes the exception distance, yellow/red handling, controlled-pilot notification matrix, transition, correction authority, privacy, and sequencing. No product-policy conflict remains. Implementation still requires the separately authorized sequence.

Exact dependency selection, migration DDL, feature-flag mechanics, recovery evidence, implementation, pilot activation, and Production release remain deferred to separately authorized checkpoints. No dependency, migration, backfill, schema, code, or deployment change is authorized here.

## 11. Related documents

- [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [CTX-ARCH-015](../architecture/CTX-ARCH-015-photo-review-retention-and-integrity-routing.md)
- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)
- [PD-060](./PD-060-photo-review-retention-and-platform-rejection.md)
- [PD-058](./PD-058-notification-and-communication-boundary.md)
- [PD-052](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)

## 12. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial draft decision for Founder review; no implementation or Production authority. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved policy direction for classifications, exceptions, notifications, legacy transition, privacy, and authority; still not effective. |
| 1.0 | 2026-08-04 | Founder-approved product policy made effective as governance; implementation remains separately authorized. |
