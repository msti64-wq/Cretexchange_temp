# CTX-RB-007 — Administrative Photo Review Runbook

- **Document ID:** CTX-RB-007
- **Version:** 0.1
- **Status:** Draft
- **Owner:** Platform Operations
- **Classification:** Internal
- **Review Frequency:** Quarterly and after a material change to activity review, photo handling, or authorization controls.

## 1. Purpose

This runbook provides a neutral, evidence-based procedure for authorized administrative review of activity photographs and related submitted activity evidence. It implements the review boundaries in [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md) without converting a review decision into a payment, settlement, or fraud determination.

## 2. Scope

Use this runbook for an existing submitted washout activity when an authorized reviewer must inspect available photographs and related supported metadata. It covers evidence review, supported activity outcomes, documentation, and escalation.

Its intended audience is an authorized Facility Owner, Administrator, or Platform Operations reviewer acting within supported role scope. Use it when a submitted activity requires photo-based operational review.

It does not authorize image alteration, forensic analysis, direct storage access, payment execution, provider action, or a conclusion that a participant committed fraud.

## 3. Responsibilities

| Role | Responsibility |
| --- | --- |
| Authorized Owner or Administrator | Review only activities within the role's supported scope and apply only supported activity outcomes. |
| Platform Operations | Ensure a cross-facility, policy, or operational exception is escalated correctly. |
| Security / Incident Owner | Receive suspected security or integrity incidents through CTX-RB-003. |
| Financial Operations | Retain independent responsibility for any later canonical financial process. |

## 4. Prerequisites

1. The reviewer is authenticated and authorized for the activity's facility or the applicable administrative scope.
2. The activity is opened through the supported application view.
3. Required photo references and the activity's available location, driver, and timing details can be reviewed without downloading or redistributing unnecessary copies.
4. The reviewer understands that an activity outcome is not a payment, collection, payout, wallet, settlement, or provider outcome.

## 5. Operational Workflow

1. Open the submitted activity in the authorized review view and confirm the activity, driver, facility/location, and current lifecycle state.
2. Review each available photo for relevance, readability, and consistency with the submitted activity. Record observable facts and limitations, not speculation.
3. Review supported associated information, including the activity time and location reference, only to the extent the application makes it available and the reviewer is authorized to use it.
4. Select the supported outcome: retain pending status when unresolved, approve/verify when requirements are met, or reject when the supported rejection criteria are met.
5. When rejection is supported, supply the required factual reason. Do not use stigmatizing language or make an unsupported fraud conclusion.
6. Confirm the persisted activity outcome in the application and record the actor, timestamp, basis, and any escalation reference.
7. Escalate the case when evidence is insufficient, a relationship is inconsistent, or the issue exceeds the reviewer's authority.

## 6. Decision Matrix

| Observation | Required outcome | Boundary |
| --- | --- | --- |
| Photos and supported activity details meet the applicable requirement | Apply the supported approval or verification outcome. | This does not mark a financial record paid or execute a provider action. |
| Photo is missing, unreadable, or does not support a decision | Keep pending or use the supported rejection path with a factual reason. | Do not manufacture evidence or silently alter media. |
| Submitted activity belongs to another facility outside the owner's scope | Do not review it; deny or escalate according to the authorization boundary. | Do not use an owner account to review another owner's activity. |
| Evidence suggests a duplicate, integrity issue, or potential misconduct | Preserve the minimum factual evidence and escalate. | Do not label the participant fraudulent without an authorized investigation. |
| A payment, receivable, batch, or payout question arises | Refer it to the applicable financial procedure. | Activity review does not execute financial processing. |

## 7. Exception Handling

- For authentication, authorization, account compromise, or evidence-tampering indicators, follow [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md).
- For a repeated pattern or marketplace-trust concern, follow [CTX-RB-008](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md).
- If the needed review control is not implemented, preserve the case reference and escalate; do not use direct database, object-storage, or provider access as a workaround.
- If a rejection reason or lifecycle action is unavailable, do not substitute an unrelated status; record the limitation and escalate.

## 8. Audit Requirements

The review record SHALL include:

- activity reference, role scope, reviewer, and review timestamp;
- photos or evidence sources considered, without copying sensitive content unnecessarily;
- factual decision basis and limitations;
- final supported lifecycle outcome or escalation reference;
- any required rejection reason and notification reference.

Keep activity-review records separate from financial settlement records and retain them according to [CTX-POL-003](../standards/CTX-POL-003-data-retention-policy.md).

## 9. Related Policies

- [CTX-POL-003 — Data Retention Policy](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-004 — Incident Response Policy](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-POL-008 — Access Control Policy](../standards/CTX-POL-008-access-control-policy.md)

## 10. Related Runbooks

- [CTX-RB-003 — Incident Response Runbook](./CTX-RB-003-incident-response-runbook.md)
- [CTX-RB-006 — Driver Verification Runbook](./CTX-RB-006-driver-verification-runbook.md)
- [CTX-RB-008 — Marketplace Trust & Fraud Escalation Runbook](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md)
- [CTX-RB-009 — Daily Operations Checklist](./CTX-RB-009-daily-operations-checklist.md)

## 11. Related Architecture and Product Decisions

- [Owner Operations Architecture](../architecture/owner-operations-architecture.md)
- [Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [Financial Architecture and KPI Specification](../architecture/financial-architecture-and-kpi-specification.md)
- [CTX-UX-008 — Administrative Activity Review Experience](../ux/CTX-UX-008-administrative-activity-review-experience.md)
- [PD-051 — Driver Activity and Payment Lifecycle](../product/PD-051-driver-activity-and-payment-lifecycle.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)

## 12. Revision History

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-07-23 | Initial Draft. |
