# CTX-RB-010 — Geofence Exception and Boundary Correction Runbook

- **Document ID:** CTX-RB-010
- **Version:** 1.0
- **Status:** Approved — effective governance; procedure not operational until implementation
- **Owner:** Platform Operations
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Product:** CreteXchange
- **Classification:** Internal
- **Effective Date:** 2026-08-04
- **Review Frequency:** Quarterly and after a material geofence, exception, or authorization change
- **Last Reviewed:** 2026-08-04
- **Next Review:** Before operational activation or after a material authorization change

## 1. Purpose and scope

This approved runbook defines safe future handling of geofence exceptions, Owner boundary-correction requests, and Admin assistance. It is effective as governance but is not operational because the geofence capability is not implemented or released.

It does not authorize direct database edits, geometry modification, account restriction, evidence deletion, Facility disabling, payment action, or a fraud finding.

## 2. Roles and authority

| Role | Proposed responsibility | Boundary |
| --- | --- | --- |
| Driver | Provide accurate acknowledgement and required evidence for a yellow exception | Cannot activate or modify Facility geometry |
| Facility Owner | Review own pending activity and own Facility boundary drafts/history | Cannot view another Owner's geometry or rewrite historical versions |
| Admin/Super Admin | Review red retained evidence and respond to authorized assistance requests; activate a corrected version only through a separately authorized process | Does not infer misconduct or alter geometry without recorded authority |
| Platform Operations | Observe patterns and recommend review | A recommendation does not change a boundary or activity outcome |

## 3. Proposed yellow-exception procedure

1. Before activity creation, require explicit acknowledgement, a governed reason, required photo evidence, GPS timestamp/accuracy, evaluated boundary version, and any optional bounded note. If any required element is missing, return corrective guidance and create no incomplete activity.
2. For a complete yellow submission, create atomically one activity in the ordinary Owner queue, one idempotent combined pending-review/boundary-review Owner notification, one idempotent low-priority operational-exception Admin/Super Admin notification, and a neutral Driver confirmation.
3. Confirm the activity is tied to the Owner's Facility and recorded boundary version.
4. Review the Driver's governed reason, optional note, timestamp/accuracy classification, and authorized photo evidence.
5. Apply the ordinary Owner verify/reject decision using factual evidence. Do not place yellow in active Admin Photo Review unless it is separately escalated, disputed, or governed evidence independently fails.
6. If the reason indicates an inaccessible area or incorrect boundary, mark the exception context temporary or request boundary review; do not edit geometry from the activity screen.
7. If correction is warranted, open a new boundary draft, preview, validate, and activate it through the governed Owner workflow or separately authorized Admin correction process.
8. Preserve the original evaluation and version regardless of the later correction.

## 4. Proposed red-exception procedure

1. Open the retained item through the existing PD-060 Admin Photo Review/integrity path; confirm it did not enter the Owner queue and no Owner notification was sent.
2. Review minimum-necessary evidence and the canonical result without calling the Driver fraudulent.
3. Retain the activity/evidence and append the supported review result.
4. If geometry appears unavailable/invalid rather than Driver evidence being outside a valid boundary, route a separate Facility boundary-assistance request.
5. Use Administrative Review only under its existing dispute/facilitation rules.
6. Repeated failures may be recorded for later pattern analysis but do not authorize account warning, suspension, or disabling without a separately governed policy.
7. Confirm the item created no verification success, operational-success metric, reward, achievement, competition credit, settlement, wallet value, payment, or financial execution.

## 5. Owner boundary-correction procedure

1. Authenticate and confirm ownership of the selected Facility.
2. Review the active boundary and immutable revision history.
3. Create a new draft; never edit the active/historical row in place.
4. Draw only the approved Driver delivery/washout area or configure the approved radius.
5. Review area/radius, validation results, and map preview.
6. Record a factual correction reason.
7. Activate atomically so the previous version receives an effective end and the new version receives an effective start.
8. Confirm new evaluations use the new version while earlier submissions retain the old version.

## 6. Assistance and escalation

- Authentication, authorization, account compromise, or evidence tampering follows [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md).
- Photo/evidence review follows [CTX-RB-007](./CTX-RB-007-administrative-photo-review-runbook.md).
- Marketplace-trust concerns follow [CTX-RB-008](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md).
- If a required control is unavailable, preserve safe references and escalate. Do not use SQL, object storage, provider consoles, or client-side geometry as a workaround.

## 7. Notification behavior

| Trigger | Proposed recipients | Rule |
| --- | --- | --- |
| Passive indicator/selection | None | No side effect |
| Complete yellow submission | Owner, Admin/Super Admin, and Driver | One idempotent combined pending-review/boundary-review Owner notice; one idempotent low-priority operational-exception Admin/Super Admin notice; neutral Driver confirmation; no active Photo Review by default |
| Red platform exception | Driver and Admin/Super Admin | Neutral Driver language; no Owner notification |
| Owner assistance request | Requesting Owner and authorized Admin recipients | Notification Service, idempotent, safe metadata |
| Boundary activation | Owner confirmation | No Driver broadcast unless separately approved |

## 8. Evidence, privacy, and audit

Record safe Facility/activity/boundary-version identifiers, result/reason code, actor, timestamp, action, and idempotency identity. Boundary, evaluation, notification, and review evidence is append-only. Precise Driver coordinates, raw polygon geometry, credentials, contact data, storage paths, financial data, and internal analytics payloads must not appear in notification metadata, list payloads, or general logs. Preserve existing Photo Review privacy and evidence-access controls.

Operational records are retained according to [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md). This draft sets no retention period or deletion authority.

## 9. Existing-Facility transition

For a Facility without an active valid governed boundary, keep the isolated feature-flagged legacy center-distance behavior operational: through one mile is verified; more than one through three miles is warning; beyond three miles is failed. There is no four-mile rule. The separate duplicated 500-foot rubble arrival/completion checks remain legacy behavior pending canonical convergence.

Do not infer, backfill, or automatically activate a polygon or radius. New enforcement applies only after an authorized Owner activates a valid boundary. Retire legacy behavior only after affected pilot Facilities are configured, tested, approved, and pass release gates.

## 10. Recovery and limitations

An incorrect activation is corrected by activating a new version or, under separately authorized recovery, restoring an earlier valid geometry as a new version. Do not rewrite history. Application rollback disables new reads/enforcement while retaining additive boundary, revision, evaluation, notification, and review evidence. No destructive rollback or Production recovery is authorized without an explicit Founder recovery checkpoint.

This procedure cannot be used until CTX-ARCH-016 and PD-061 are approved, implementation is validated, migration authorization is complete, and Production acceptance succeeds.

## 11. Related documents

- [CTX-ARCH-016](../architecture/CTX-ARCH-016-canonical-facility-geofence-architecture.md)
- [PD-061](../product/PD-061-facility-geofence-and-operational-exception-policy.md)
- [CTX-UX-009](../ux/CTX-UX-009-driver-and-owner-geofence-experience.md)
- [CTX-ARCH-015](../architecture/CTX-ARCH-015-photo-review-retention-and-integrity-routing.md)
- [PD-060](../product/PD-060-photo-review-retention-and-platform-rejection.md)
- [CTX-ARCH-013](../architecture/CTX-ARCH-013-notification-and-communication-center.md)

## 12. Change history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-08-04 | Initial non-operational draft for Founder review. |
| 0.2 | 2026-08-04 | Incorporated Founder-approved exception routing, notifications, correction authority, legacy transition, privacy, and recovery direction; still non-operational. |
| 1.0 | 2026-08-04 | Founder-approved runbook made effective as governance; procedure remains non-operational until separately authorized implementation. |
