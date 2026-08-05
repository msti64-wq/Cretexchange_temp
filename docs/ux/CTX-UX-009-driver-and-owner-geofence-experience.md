# CTX-UX-009 — Driver and Owner Geofence Experience

- **Document ID:** CTX-UX-009
- **Version:** 1.1
- **Status:** Approved — controlled feature-branch experience implemented; not activated or released
- **Owner:** CreteXchange Product and Experience
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Effective Date:** 2026-08-04
- **Classification:** Internal
- **Review Frequency:** Event-driven after a material Driver-location or Owner-boundary change
- **Last Reviewed:** 2026-08-04
- **Next Review:** Before implementation approval or after a material experience change

## 1. Purpose and scope

This document defines the approved minimal Driver Facility-status indicator and governed Owner boundary-management experience. The separately authorized controlled feature branch implements this experience behind disabled controls; migration, activation, merge, deployment, and Founder Production acceptance remain separate gates. [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md) owns evaluation and data contracts; [PD-061](../product/PD-061-facility-geofence-and-operational-exception-policy.md) owns product policy.

## 2. Driver Facility-selection experience

The existing material-filtered Facility list, nearest-location ordering, search, map, and selection path remain intact. After reliable device position is available, the client requests a server evaluation and renders one compact status near the Facility name or existing distance.

| State | Visible label | Non-color signal | Suggested visual treatment |
| --- | --- | --- | --- |
| Inside | `Inside facility boundary` | Check-circle icon | Green text/icon on high-contrast subtle background |
| Yellow exception zone | `Outside boundary — confirm location` | Alert-triangle icon | Amber text/icon; never presented as approved |
| Red outside exception zone | `Too far from facility — review selection` | X-circle or map-pin-alert icon | Red text/icon |
| Unavailable/uncertain | `Location could not be confirmed` | Help-circle or location-off icon | Neutral gray text/icon |

Requirements:

- color is never the only signal;
- the full localized label is visible on mobile, not tooltip-only;
- the status group has an equivalent `aria-label` and meaningful icon treatment;
- any supplementary tooltip is keyboard/focus/touch accessible;
- no animation is required; reduced-motion preference is respected;
- status does not reorder Facilities or replace the existing center-distance display;
- yellow and red remain selectable;
- selecting yellow/red may show one short inline reminder but no modal or multi-step interruption;
- loading uses a small neutral skeleton or “Confirming location” label and does not show zeros or green; and
- failure, permission denial, insufficient accuracy, invalid geometry, and unavailable geometry all render neutral guidance.

Passive display and selection create no Admin or Owner notification, activity, rejection, Administrative Review, Photo Review item, audit exception, analytics exception, financial event, or reward event. The server evaluates again during check-in and submission; the client never promotes an advisory result into an authoritative outcome.

Implemented English labels are specified above. Implemented Spanish labels:

- `Dentro del límite de la instalación`
- `Fuera del límite — confirma la ubicación`
- `Demasiado lejos de la instalación — revisa tu selección`
- `No se pudo confirmar la ubicación`

Translations require bilingual review during the final controlled validation and again before release.

## 3. Driver check-in and submission

The check-in page repeats the server evaluation with a fresh observation. An earlier green indicator is not authorization to submit.

- Green continues the ordinary evidence flow.
- Yellow presents an inline, accessible acknowledgement area before final submission. It explains that the Driver is outside the approved boundary and asks for a governed reason, optional note, and required photo evidence.
- Red explains neutrally that the activity cannot enter ordinary Facility review and that submitted evidence will require Platform review. It does not use “fraud,” “fraudulent,” or accusatory language.
- Neutral explains the specific safe recovery action—retry location, improve signal/accuracy, or contact support for Facility geometry—without fabricating coordinates or bypassing evidence.

Reason choices for yellow:

1. `Facility personnel directed me here`
2. `Approved area was inaccessible`
3. `Facility boundary appears incorrect`
4. `GPS location appears inaccurate`
5. `Other`

The optional note is bounded, labeled, and not required to disclose personal information. The interface records acknowledgement only when the Driver submits; merely opening or selecting a reason does not notify anyone. A complete yellow submission also includes the GPS timestamp/accuracy and evaluated boundary version. If any required yellow element is missing, show corrective guidance inline and create no incomplete activity.

After a complete yellow submission, show a neutral Driver confirmation. During the controlled pilot, the backend creates one combined pending-review/boundary-review Owner notification and one low-priority operational-exception Admin/Super Admin notification. The UX must not imply that yellow is an integrity rejection or active Photo Review item unless a separate escalation, dispute, or independent evidence failure occurs.

## 4. Owner boundary-management experience

An authorized Owner opens a Facility-specific **Location verification boundary** section.

### 4.1 Mode selection

- **Radius:** center the draft on the verified Facility point, enter/select an approved radius, and preview the circle.
- **Polygon:** draw one primary approved delivery, disposal, recovery, or washout area using map controls. Do not default to the full property.

Changing modes creates or edits a draft; it does not alter the active boundary until explicit activation.

### 4.2 Draw, edit, preview, and validate

The map provides keyboard-accessible alternatives or a structured vertex list where the mapping SDK cannot make drawing fully keyboard accessible. Controls include add/move/remove point, undo, clear draft, reset to active version, zoom, and map instructions.

Before saving, show:

- mode and Facility;
- clear outline/fill preview;
- area or radius in understandable units;
- validation errors such as self-intersection or excessive size;
- a statement that the boundary must cover only the approved Driver delivery/washout area; and
- the current active version and whether the draft will supersede it.

Polygon validation communicates the configured initial guardrails without asking the Owner to perform geometry calculations: WGS84 longitude/latitude, one closed exterior ring, at least three distinct non-collinear vertices, no more than 200 distinct vertices, no self-intersection, valid coordinate ranges, no more than two square miles of operational area, and no more than five miles of geographic span. The server remains authoritative.

Server validation is authoritative. Client validation may provide early feedback but cannot activate geometry.

### 4.3 Activate and review history

Activation requires an explicit confirmation and factual correction reason. On success, show version and effective time. History lists version, mode, effective period, actor-safe identity, status, and reason without exposing Driver coordinates.

The Owner may:

- mark a recorded exception as temporary context without changing geometry;
- create a new draft to correct/redraw the boundary;
- request Admin assistance; and
- view earlier versions read-only.

The Owner cannot edit another Owner's Facility, rewrite a historical version, change the version attached to a submitted activity, enlarge the platform-governed exception distance, or expand a boundary by accepting an exception. A separately authorized Admin correction process may activate a new immutable version but cannot rewrite history.

## 5. Boundary exception review

A complete yellow submission appears in the ordinary Owner queue with a clear **Outside-boundary exception** label, selected reason, optional Driver note, GPS timestamp/accuracy, boundary version reference, and authorized evidence. It remains pending until the Owner applies the ordinary verify/reject decision. The combined notification may recommend boundary review but never changes, expands, or activates the boundary.

The Owner interface separates:

- activity outcome;
- temporary exception context;
- boundary correction; and
- request for Admin assistance.

None of these controls changes a payment, wallet, reward, settlement, or financial status.

## 6. Admin guidance

Red platform exceptions reuse PD-060 routing, active Admin Photo Review, and the existing private evidence viewer. They are quarantined before Owner review, send no Owner notification, and use neutral Driver language. Boundary assistance/correction is a separate operational request and does not automatically label the Driver, invalidate a Facility, or alter geometry. Repeated-location clustering is future decision support only and requires separate methodology, privacy review, and approval.

## 7. Loading, error, and recovery states

- Device location checking: maintain page shell and Facility list; show neutral status placeholders.
- Permission denied: explain device/browser recovery and allow retry.
- Accuracy insufficient: ask the Driver to move to an open area or retry; do not show red.
- Boundary unavailable: allow Facility selection and explain that location status is unavailable. An existing unconfigured Facility continues through the isolated feature-flagged legacy center-distance path until a valid boundary is activated; it must not suddenly become unusable.
- Invalid geometry: do not expose technical geometry details to the Driver; show neutral status and route Owner/Admin correction through authorized surfaces.
- API timeout/error: use bounded retry and retain the list; never assume green.

## 8. Acceptance criteria

1. Inside radius and polygon show green from server results.
2. Exact boundary contact follows the documented inside rule.
3. Outside within the configured exception distance shows yellow.
4. Beyond the exception distance shows red.
5. Unavailable, inaccurate, stale, or invalid states show neutral.
6. Yellow/red Facilities remain selectable.
7. Passive display/selection creates no notifications or workflow records.
8. Check-in/submission reevaluates with fresh evidence.
9. Owner editing is Facility-scoped and versioned.
10. English/Spanish, screen reader, keyboard, touch, contrast, loading, error, and reduced-motion behavior pass.
11. No precise Driver coordinates or private geometry are disclosed outside authorized purpose.
12. Driver, Owner, Admin Photo Review, Administrative Review, and Notification regressions pass.
13. Complete yellow submissions show neutral confirmation and route the controlled-pilot notifications; incomplete yellow attempts create no activity.
14. Unconfigured existing Facilities remain usable under the explicit transitional legacy path, with no inferred or automatically activated geometry.

## 9. Related documents

- [CTX-UX-003](./CTX-UX-003-first-time-user-journey-and-pilot-readiness.md)
- [CTX-UX-004](./CTX-UX-004-first-time-user-onboarding-experience.md)
- [CTX-UX-005](./CTX-UX-005-driver-dashboard-experience.md)
- [CTX-UX-006](./CTX-UX-006-facility-workspace-experience.md)
- [CTX-UX-008](./CTX-UX-008-administrative-activity-review-experience.md)
- [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [PD-061](../product/PD-061-facility-geofence-and-operational-exception-policy.md)

## 10. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial Driver and Owner geofence experience draft; no implementation authority. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved indicator, yellow/red, guardrail, correction, notification, and transition direction; still no implementation authority. |
| 1.0 | 2026-08-04 | Founder-approved Driver and Owner geofence experience made effective as governance; implementation remains separately authorized. |
| 1.1 | 2026-08-04 | Recorded the controlled feature-branch Driver advisory, submission guidance, Owner boundary management, bilingual copy, and pending release gates. |
