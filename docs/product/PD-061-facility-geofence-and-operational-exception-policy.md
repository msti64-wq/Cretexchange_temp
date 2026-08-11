# PD-061 — Facility Geofence and Operational Exception Policy

- **Document ID:** PD-061
- **Version:** 1.4
- **Status:** Active — current authorized geofence scope operationally accepted and closed; enforcement and legacy transition deferred
- **Owner:** CreteXchange Product
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Effective Date:** 2026-08-04
- **Classification:** Internal
- **Review Frequency:** Event-driven after a material geofence, exception, evidence, or notification change
- **Last Reviewed:** 2026-08-11
- **Next Review:** Before any separately authorized enforcement, legacy-transition, or geofence scope expansion

## 1. Approved policy direction

CreteXchange should use one server-authoritative, versioned Facility geofence to distinguish an approved Driver delivery, disposal, recovery, or washout area from the Facility address or entire property. A configured Facility initially has one active primary boundary: an explicitly configured radius or one Owner-defined polygon. The versioned model remains compatible with future multiple approved polygons, separate entrances, multiple washout areas, material zones, and large campuses without changing the canonical result contract; those capabilities remain deferred.

The Founder has approved this product policy as effective governance. Green, Yellow, Gray, and Red Driver advisory presentation; Owner boundary management and submission-time Owner context; and the controlled Revel Yellow/Gray notification and protected evidence experience are accepted. Revel geofence notifications remain enabled. Submission enforcement remains disabled and explicitly deferred. Red quarantine, Owner-queue exclusion, and enforcement-specific Admin routing are not represented as Founder-tested. Legacy transition remains disabled and deferred. The current authorized geofence scope is operationally accepted and closed; Phase 5 Sprint 3 Two-Factor Authentication is in discovery and documentation planning only.

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
11. Owner access to deliveries and Washout Reviews is always independent of geofence feature controls.
12. Submission enforcement governs routing for future completed submissions; it neither reveals deliveries nor participates in the normal Admin notification experience.
13. Geofence notifications are driven only by completed-submission events. Passive Driver activity creates no persisted notification side effect.

## 3. Driver guidance states

| Canonical result | Driver presentation | Meaning |
| --- | --- | --- |
| `INSIDE_APPROVED_BOUNDARY` | Green — “Inside facility boundary” | Reliable position is inside or exactly on the active approved radius/polygon. |
| `OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE` | Yellow — “Outside boundary — confirm location” | Position is outside but no more than the configured exception distance from the nearest edge. It is not approved Facility area. |
| `OUTSIDE_EXCEPTION_ZONE` | Red — “Too far from facility — review selection” | Position is beyond the configured exception zone. |
| `LOCATION_UNAVAILABLE` | Neutral — “Location could not be confirmed” | GPS is unavailable or permission is denied. |
| `LOCATION_ACCURACY_INSUFFICIENT` | Neutral/Gray — “Location needs review” or “Location could not be confirmed” | GPS is stale, less accurate than the configured maximum, or its uncertainty materially overlaps a threshold. The reason code distinguishes the condition. |
| `GEOMETRY_UNAVAILABLE` | Neutral — “Location could not be confirmed” | No active governed geometry is available for canonical evaluation. |
| `GEOMETRY_INVALID` | Neutral — “Location could not be confirmed” | Geometry cannot be evaluated safely and cannot be activated. |

Yellow and red Facilities remain selectable during advisory discovery. Selection does not authorize submission.

## 4. Governed yellow operational-exception workflow

A complete yellow submission may proceed to ordinary Owner review only after the Driver:

- acknowledges being outside the approved boundary;
- selects one governed reason: `FACILITY_PERSONNEL_DIRECTED`, `APPROVED_AREA_INACCESSIBLE`, `BOUNDARY_APPEARS_INCORRECT`, `GPS_APPEARS_INACCURATE`, or `OTHER`;
- may add a bounded optional factual note;
- supplies the otherwise required private photo evidence; and
- supplies a position with governed accuracy and timestamp requirements; and
- records the evaluated boundary version.

The system records the boundary version and canonical evaluation. The exception does not verify the activity and does not establish misconduct.

When the separately authorized notification workflow is active, the complete yellow submission creates one idempotent boundary-review notification for the Facility Owner, one idempotent low-priority assistance notification for each approved Admin/Super Admin recipient, and an appropriate neutral Driver confirmation. The governed Driver acknowledgement reason and bounded note are included when available. `BOUNDARY_APPEARS_INCORRECT` is visibly identified as a boundary-correction request. The Owner notice may recommend boundary review, but it never expands or activates a boundary. Repeated-location clustering and automated correction recommendations remain deferred.

Yellow is an operational exception, not a platform-integrity rejection. It does not enter active Admin Photo Review unless separately escalated, disputed, or governed evidence independently fails. If acknowledgement, governed reason, required photo, GPS timestamp/accuracy, or boundary version is absent, the platform returns corrective guidance and creates no incomplete activity.

## 5. Governed Gray workflow

Gray is a required neutral presentation/routing classification derived from canonical state plus reason code. It is not an additional canonical state. Its six completed-submission conditions are:

- state `LOCATION_ACCURACY_INSUFFICIENT` with reason code `LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY` — near-boundary uncertainty;
- state `LOCATION_ACCURACY_INSUFFICIENT` with reason code `LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD` — near-advisory-limit uncertainty;
- `LOCATION_UNAVAILABLE` — GPS unavailable;
- `LOCATION_ACCURACY_INSUFFICIENT` with another governed reason code — GPS stale or insufficiently accurate;
- `GEOMETRY_UNAVAILABLE` — missing Facility boundary; or
- `GEOMETRY_INVALID` — invalid or unavailable Facility boundary.

When the notification workflow is active, a completed Gray submission creates neutral Driver communication, one Owner uncertainty/configuration notice, and one low-priority assistance notice for each approved Admin/Super Admin recipient. It never uses fraud, rejection, or accusation language. The notice distinguishes the cause and directs the recipient to review submission evidence, retry or verify the operational location, correct the Facility boundary, or contact the Owner for assistance as appropriate. Passive evaluation of the same states creates no notification.

## 6. Governed red workflow

Under separately authorized submission enforcement, a red submission is retained atomically with its supplied evidence and quarantined before Owner review under PD-060:

- preserve exactly one canonical copy of submitted private evidence and append-only audit history;
- create active Admin Photo Review or integrity-review attention;
- send idempotent Admin and Super Admin notifications through the Notification Service;
- send the Driver accurate, neutral language;
- do not notify the Owner;
- exclude the activity from verification, operational-success metrics, rewards, achievements, competition credit, settlement, wallet value, payment, and financial execution; and
- never label the Driver fraudulent without an authorized Admin determination under a separately governed policy.

This reuses the existing Admin Photo Review/integrity classification and requires no new Admin Photo Review classification.

## 7. Notification matrix and PD-060 / CTX-ARCH-015 reconciliation

PD-060 remains authoritative for routine Owner rejection and platform-detected integrity rejection. Yellow and Gray are operational or uncertainty workflows, not PD-060 platform rejections. Red uses PD-060 retention/quarantine only when separately authorized submission enforcement routes a completed `OUTSIDE_EXCEPTION_ZONE` submission before Owner review.

| Event | Driver | Owner | Admin/Super Admin |
| --- | --- | --- | --- |
| Passive `/locations`, Facility selection, GPS acquisition/retry, or advisory change | Advisory UI only; no notification | No notification | No notification |
| Green completed submission | Ordinary confirmation | Ordinary queue and existing pending-review notice; no duplicate geofence notice | No geofence workload |
| Yellow completed submission | Neutral confirmation; acknowledgement reason/note when available | Ordinary queue and boundary-review notice; boundary-correction requests identified | Low-priority assistance; no active Photo Review by default |
| Gray: GPS unavailable/insufficient | Neutral retry/verify guidance; no rejection or accusation | Uncertainty notice | Low-priority assistance |
| Gray: uncertainty overlaps boundary | Neutral evidence-review guidance; no rejection or accusation | Near-boundary uncertainty notice | Low-priority assistance |
| Gray: uncertainty overlaps exception threshold | Neutral evidence-review guidance; no rejection or accusation | Near-advisory-limit notice | Low-priority assistance |
| Gray: missing Facility boundary | Neutral contact-Owner guidance | Configuration notice to correct/configure the boundary | Low-priority assistance |
| Gray: invalid/unavailable Facility boundary | Neutral contact-Owner guidance | Configuration notice to correct the boundary | Low-priority assistance |
| Red completed submission under authorized enforcement | Neutral retained/quarantine communication; no fraud or financial/success result | No notification or ordinary review item | Active attention under PD-060 retention |
| Routine Owner rejection | Existing rejection notice | Already reviewed; no new notice | None unless disputed/escalated |
| Driver Administrative Review request | Existing review notice | Existing governed behavior | Existing governed dispute attention |
| Owner requests boundary assistance | None | Request confirmation; no activity reclassification | Assistance item, separate from Photo Review unless an activity is involved |

All new notifications must use `server/notificationService.ts`, governed English/Spanish templates, safe metadata, role-scoped deep links, and deterministic idempotency keys. Exactly one notification is permitted per approved recipient/event. Retry, refresh, or idempotent resubmission must not duplicate it. Notification delivery does not replace operational audit evidence, and a delivery failure must not roll back the canonical activity/evidence transaction.

Notification metadata and general logs exclude precise GPS, exact distance, polygon geometry, storage paths, contact details, credentials, financial data, and private analytics. Deep-linked destinations independently enforce RBAC and Facility ownership.

## 8. Notification controls

`geofence_notifications` may remain a governed kill switch for the completed-submission notification workflow. Yellow and Gray notices must be capable of operating independently of submission enforcement; only red quarantine inherently depends on enforcement. The control is never required for an Owner to see deliveries or Washout Reviews.

The ordinary Facility pilot-control workflow presents submission enforcement only as an internal controlled-pilot routing switch. Geofence notifications and legacy transition are omitted from that workflow or displayed as internal read-only/deferred states. Legacy transition is unrelated to boundary notifications.

## 9. Owner policy

An authorized Owner may draft, preview, validate, activate, supersede, and review history only for a Facility they own and may request Admin assistance. A separately authorized Admin process may activate a corrected version. Activation creates a new immutable version; it does not rewrite previous versions or earlier activity evaluations.

Marking an exception temporary records operational context only. It does not expand a polygon, change a radius, verify an activity, create a financial result, or establish a permanent rule.

## 10. Privacy, neutrality, and financial isolation

- Drivers do not receive boundary geometry, private Facility information, or internal validation detail.
- Owners do not receive another Owner's geometry or precise Driver coordinates, including in list payloads.
- Admin access remains minimum-necessary and purpose-limited.
- Notifications and general logs do not contain raw polygon geometry, precise coordinates, storage paths, credentials, contact data, financial data, or internal analytics payloads.
- Boundary, evaluation, notification, and review evidence is append-only, and existing Photo Review privacy/evidence controls remain in force.
- Automated location results are evidence signals, not fraud findings.
- No geofence result changes wallet, Stripe, billing, rewards, settlement, payout, or financial execution.
- Repeated failures require a separately governed account-integrity policy before automated warnings, suspension, or disabling.

## 11. Existing-Facility transition

Existing Facilities remain on the isolated legacy center-distance behavior until an authorized Owner activates a valid governed boundary. New geofence enforcement applies only to a Facility with an active valid boundary, and `GEOMETRY_UNAVAILABLE` must not make an unconfigured Facility unusable. No polygon is inferred or backfilled, no Production boundary is automatically activated, and retirement of the feature-flagged legacy path requires configured, tested, and approved affected pilot Facilities.

The current legacy photo-validation behavior is: through one mile from the Facility point is verified; more than one through three miles is warning; beyond three miles is failed. There is no four-mile rule. Separate duplicated 500-foot rubble arrival/completion checks are also legacy and require later convergence through the canonical server service.

## 12. Remaining release authority

Green, Yellow, Gray, and Red Driver advisory presentation, Owner boundary management and evidence context, and the controlled Revel Yellow/Gray notification experience are Founder-accepted. Revel notifications remain enabled. Submission enforcement and legacy transition remain disabled and explicitly deferred. The cancelled Red pilot is not represented as tested: quarantine, Owner-queue exclusion, and enforcement-specific Admin routing remain outside Founder acceptance. No inferred backfill, automatic boundary activation, further geofence implementation, or Production mutation is authorized. Phase 5 Sprint 3 is limited to discovery and documentation planning until separately approved.

## 13. Related documents

- [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [CTX-ARCH-015](../architecture/CTX-ARCH-015-photo-review-retention-and-integrity-routing.md)
- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)
- [PD-060](./PD-060-photo-review-retention-and-platform-rejection.md)
- [PD-058](./PD-058-notification-and-communication-boundary.md)
- [PD-052](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)
- [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-008](../standards/CTX-POL-008-access-control-policy.md)

## 14. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial draft decision for Founder review; no implementation or Production authority. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved policy direction for classifications, exceptions, notifications, legacy transition, privacy, and authority; still not effective. |
| 1.0 | 2026-08-04 | Founder-approved product policy made effective as governance; implementation remains separately authorized. |
| 1.1 | 2026-08-04 | Recorded the separately authorized controlled feature-branch implementation; migration, activation, merge, deployment, and Production acceptance remain pending. |
| 1.2 | 2026-08-08 | Established the completed-submission notification matrix, required Gray class, control independence, non-duplication/privacy safeguards, and current accepted/inactive/deferred scope. |
| 1.3 | 2026-08-08 | Restored the exact seven-state contract and defined the two uncertainty-overlap conditions as reason codes under `LOCATION_ACCURACY_INSUFFICIENT`; Gray remains a six-condition presentation/routing classification. |
| 1.4 | 2026-08-11 | Recorded Founder closeout of the current authorized geofence scope, enabled Revel notifications, accepted advisory/Owner/Yellow/Gray evidence scope, and explicit deferral of untested enforcement and legacy transition. |
