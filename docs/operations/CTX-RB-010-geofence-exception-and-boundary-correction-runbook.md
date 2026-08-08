# CTX-RB-010 — Geofence Exception and Boundary Correction Runbook

- **Document ID:** CTX-RB-010
- **Version:** 1.2
- **Status:** Approved — advisory and submission-time Owner context operational; notification workflow and red enforcement pilot not activated
- **Owner:** Platform Operations
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Classification:** Internal
- **Effective Date:** 2026-08-04
- **Review Frequency:** Quarterly and after a material geofence, exception, or authorization change
- **Last Reviewed:** 2026-08-08
- **Next Review:** Before notification implementation or red enforcement-pilot authorization

## 1. Purpose and scope

This approved runbook defines safe handling of geofence exceptions, Gray uncertainty/configuration states, Owner boundary-correction requests, and Admin assistance. Owner/Driver advisory scope and submission-time Owner context are accepted. The completed-submission notification workflow and red enforcement pilot are not activated; legacy transition is deferred; and 2FA has not begun.

It does not authorize direct database edits, geometry modification, account restriction, evidence deletion, Facility disabling, payment action, or a fraud finding.

## 2. Roles and authority

| Role | Governed responsibility | Boundary |
| --- | --- | --- |
| Driver | Provide accurate acknowledgement and required evidence for a yellow exception | Cannot activate or modify Facility geometry |
| Facility Owner | Review own pending activity and own Facility boundary drafts/history | Cannot view another Owner's geometry or rewrite historical versions |
| Admin/Super Admin | Review red retained evidence and respond to authorized assistance requests; activate a corrected version only through a separately authorized process | Does not infer misconduct or alter geometry without recorded authority |
| Platform Operations | Observe patterns and recommend review | A recommendation does not change a boundary or activity outcome |

## 3. Yellow-exception procedure

1. Before activity creation, require explicit acknowledgement, a governed reason, required photo evidence, GPS timestamp/accuracy, evaluated boundary version, and any optional bounded note. If any required element is missing, return corrective guidance and create no incomplete activity.
2. For a complete yellow submission, create atomically one activity in the ordinary Owner queue, one idempotent combined pending-review/boundary-review Owner notification, one idempotent low-priority operational-exception Admin/Super Admin notification, and a neutral Driver confirmation.
3. Confirm the activity is tied to the Owner's Facility and recorded boundary version.
4. Review the Driver's governed reason, optional note, timestamp/accuracy classification, and authorized photo evidence.
5. Apply the ordinary Owner verify/reject decision using factual evidence. Do not place yellow in active Admin Photo Review unless it is separately escalated, disputed, or governed evidence independently fails.
6. If the reason indicates an inaccessible area or incorrect boundary, mark the exception context temporary or request boundary review; do not edit geometry from the activity screen.
7. If correction is warranted, open a new boundary draft, preview, validate, and activate it through the governed Owner workflow or separately authorized Admin correction process.
8. Preserve the original evaluation and version regardless of the later correction.

## 4. Red-exception procedure

1. Open the retained item through the existing PD-060 Admin Photo Review/integrity path; confirm it did not enter the Owner queue and no Owner notification was sent.
2. Review minimum-necessary evidence and the canonical result without calling the Driver fraudulent.
3. Retain the activity/evidence and append the supported review result.
4. If geometry appears unavailable/invalid rather than Driver evidence being outside a valid boundary, route a separate Facility boundary-assistance request.
5. Use Administrative Review only under its existing dispute/facilitation rules.
6. Repeated failures may be recorded for later pattern analysis but do not authorize account warning, suspension, or disabling without a separately governed policy.
7. Confirm the item created no verification success, operational-success metric, reward, achievement, competition credit, settlement, wallet value, payment, or financial execution.

This procedure applies only after separate Founder authorization activates submission enforcement for the controlled Facility.

## 5. Gray uncertainty/configuration procedure

1. Confirm a completed submission produced one of the six governed Gray states; passive advisory evaluation never enters this procedure.
2. Distinguish GPS unavailable/insufficient, near-boundary uncertainty, near-advisory-limit uncertainty, missing Facility boundary, and invalid/unavailable Facility boundary.
3. Send neutral Driver guidance appropriate to the state: review evidence, retry/verify operational location, correct the Facility boundary, or contact the Owner for assistance.
4. When the notification workflow is separately activated, create one idempotent Owner uncertainty/configuration notice and one low-priority assistance notice for each approved Admin/Super Admin recipient.
5. Do not create a rejection, fraud finding, or active Photo Review item solely because the state is Gray.
6. Preserve the completed submission and its governed evidence. Notification-delivery failure must not roll back the canonical activity/evidence transaction.

## 6. Owner boundary-correction procedure

1. Authenticate and confirm ownership of the selected Facility.
2. Review the active boundary and immutable revision history.
3. Create a new draft; never edit the active/historical row in place.
4. Draw only the approved Driver delivery/washout area or configure the approved radius.
5. Review area/radius, validation results, and map preview.
6. Record a factual correction reason.
7. Activate atomically so the previous version receives an effective end and the new version receives an effective start.
8. Confirm new evaluations use the new version while earlier submissions retain the old version.

## 7. Assistance and escalation

- Authentication, authorization, account compromise, or evidence tampering follows [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md).
- Photo/evidence review follows [CTX-RB-007](./CTX-RB-007-administrative-photo-review-runbook.md).
- Marketplace-trust concerns follow [CTX-RB-008](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md).
- If a required control is unavailable, preserve safe references and escalate. Do not use SQL, object storage, provider consoles, or client-side geometry as a workaround.

## 8. Notification behavior

| Trigger | Driver | Owner | Admin/Super Admin | Rule |
| --- | --- | --- | --- | --- |
| Passive viewing/selection/GPS/retry/advisory change | None | None | None | No notification or persisted notification side effect |
| Green completed submission | Ordinary confirmation | Existing ordinary pending-review notice | None | No separate geofence notice; do not duplicate the Owner notice |
| Yellow completed submission | Neutral confirmation | Boundary-review notice | Low-priority assistance notice | Include acknowledgement reason/note when available; identify boundary-correction requests |
| Gray — GPS unavailable/insufficient | Neutral retry/verify guidance | Uncertainty notice | Low-priority assistance | No rejection or accusation |
| Gray — near-boundary uncertainty | Neutral evidence-review guidance | Near-boundary notice | Low-priority assistance | No rejection or accusation |
| Gray — near-advisory-limit uncertainty | Neutral evidence-review guidance | Near-limit notice | Low-priority assistance | No rejection or accusation |
| Gray — missing Facility boundary | Neutral contact-Owner guidance | Configuration notice | Low-priority assistance | Correct/configure the boundary |
| Gray — invalid/unavailable boundary | Neutral contact-Owner guidance | Configuration notice | Low-priority assistance | Correct the boundary |
| Red completed submission under authorized enforcement | Neutral retained/quarantine communication | None | Active attention | No ordinary Owner review item, fraud label, or financial/success outcome |
| Owner assistance request | None | Request confirmation | Authorized assistance notice | Notification Service, idempotent, safe metadata |
| Boundary activation | None | Confirmation | None | No Driver broadcast unless separately approved |

Exactly one idempotent notification is allowed per approved recipient/event. Refresh, retry, or idempotent resubmission creates no duplicate. Delivery failures are recoverable notification failures and do not undo the canonical activity/evidence transaction. Facility/activity deep links remain RBAC-protected.

### 8.1 Feature-control boundary

- Owner access to deliveries and Washout Reviews is independent of every geofence control.
- Submission Enforcement is an internal controlled-pilot routing switch for future completed submissions.
- Geofence Notifications is an internal completed-submission kill switch. Yellow and Gray notification handling is independent of submission enforcement; red quarantine requires enforcement.
- Legacy Transition is unrelated to notifications and remains deferred.
- Notification and legacy controls are omitted from the ordinary Facility pilot workflow or shown only as internal read-only/deferred state.

## 9. Evidence, privacy, and audit

Record safe Facility/activity/boundary-version identifiers, result/reason code, actor, timestamp, action, and idempotency identity. Boundary, evaluation, notification, and review evidence is append-only. Precise Driver coordinates, raw polygon geometry, credentials, contact data, storage paths, financial data, and internal analytics payloads must not appear in notification metadata, list payloads, or general logs. Preserve existing Photo Review privacy and evidence-access controls.

Operational records are retained according to [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md). This runbook sets no retention period or deletion authority.

## 10. Existing-Facility transition

For a Facility without an active valid governed boundary, keep the isolated feature-flagged legacy center-distance behavior operational: through one mile is verified; more than one through three miles is warning; beyond three miles is failed. There is no four-mile rule. The separate duplicated 500-foot rubble arrival/completion checks remain legacy behavior pending canonical convergence.

Do not infer, backfill, or automatically activate a polygon or radius. New enforcement applies only after an authorized Owner activates a valid boundary. Retire legacy behavior only after affected pilot Facilities are configured, tested, approved, and pass release gates.

## 11. Recovery and limitations

An incorrect activation is corrected by activating a new version or, under separately authorized recovery, restoring an earlier valid geometry as a new version. Do not rewrite history. Application rollback disables new reads/enforcement while retaining additive boundary, revision, evaluation, notification, and review evidence. No destructive rollback or Production recovery is authorized without an explicit Founder recovery checkpoint.

The advisory and submission-time Owner-context portions are Founder-accepted. Notification procedures cannot be used until implementation, validation, release, and explicit activation are separately authorized. Red handling cannot be piloted until submission enforcement is separately authorized for the controlled Facility. Legacy transition remains deferred.

## 12. Related documents

- [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [PD-061](../product/PD-061-facility-geofence-and-operational-exception-policy.md)
- [CTX-UX-009](../ux/CTX-UX-009-driver-and-owner-geofence-experience.md)
- [CTX-ARCH-015](../architecture/CTX-ARCH-015-photo-review-retention-and-integrity-routing.md)
- [PD-060](../product/PD-060-photo-review-retention-and-platform-rejection.md)
- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)

## 13. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial non-operational draft for Founder review. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved exception routing, notifications, correction authority, legacy transition, privacy, and recovery direction; still non-operational. |
| 1.0 | 2026-08-04 | Founder-approved runbook made effective as governance; procedure remains non-operational until separately authorized implementation. |
| 1.1 | 2026-08-04 | Recorded the controlled feature-branch yellow/red routing, Owner correction and assistance workflow, and remaining operational release gates. |
| 1.2 | 2026-08-08 | Added the completed-submission notification matrix, Gray handling, control separation, idempotency/privacy safeguards, and current accepted/inactive/deferred scope. |
