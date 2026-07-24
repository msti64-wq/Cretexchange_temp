# CTX-RB-006 — Driver Verification Runbook

- **Document ID:** CTX-RB-006
- **Version:** 0.1
- **Status:** Draft
- **Owner:** Platform Operations
- **Classification:** Internal
- **Review Frequency:** Quarterly and after a material change to driver verification, access controls, or supported evidence collection.

## 1. Purpose

This runbook defines the evidence-based, least-privilege procedure for reviewing a driver-verification case through supported CreteXchange administrative capabilities. It preserves a clear distinction between operational verification, account access, activity review, and financial execution.

This runbook does not authorize a payment, payout, wallet action, provider action, production change, or direct database update.

## 2. Scope

Use this runbook for a driver-verification request, discrepancy, or escalation involving an existing account. It covers intake, authorized evidence review, supported operational outcomes, and escalation.

Its intended audience is authorized Administrators and Platform Operations personnel. Use it when an existing driver-verification case requires review through supported administrative capabilities.

It does not establish a new identity-proofing provider, a background-check process, an account-suspension process, or a manual override outside supported application workflows.

## 3. Responsibilities

| Role | Responsibility |
| --- | --- |
| Authorized Administrator | Review the available record, preserve a concise audit trail, and take only supported administrative actions. |
| Platform Operations | Confirm that the correct procedure, policy, and escalation route are used. |
| Security / Incident Owner | Own a suspected security incident under [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md). |
| Business Approver | Provide separately documented approval where a capability, restriction, or exception is not supported by this runbook. |

## 4. Prerequisites

Before beginning, confirm all of the following:

1. The operator is authenticated and authorized for the relevant administrative view.
2. The case identifies the affected driver account without placing unnecessary personal data in a ticket or note.
3. The evidence source is available through an approved system or was supplied through an approved support channel.
4. The proposed outcome is available in the application; otherwise the case will be escalated rather than worked around.
5. No financial, provider, or production-change action is implied by the verification request.

## 5. Operational Workflow

1. Open or reference the authorized case record and record the case reference, operator, and review time.
2. Confirm the driver account identity in the supported administrative view. Do not disclose account details to an unauthorized party.
3. Review only the evidence necessary to decide whether the supported verification requirement is met. Record evidence source and limitation, not unnecessary raw personal data.
4. Compare the evidence with the stated requirement. Treat missing, inconsistent, or unreadable evidence as unresolved; do not infer a favorable or adverse result.
5. Apply the supported verification outcome when the application provides an authorized control. If no supported control exists, record the recommendation and escalate without direct database modification.
6. Notify the appropriate operational owner through an approved channel when follow-up is required.
7. Close the case only after the outcome, limitation, and escalation reference (if any) are recorded.

## 6. Decision Matrix

| Condition | Required outcome | Authority boundary |
| --- | --- | --- |
| Required evidence is complete and consistent | Apply the supported verification outcome or record the recommendation. | No payment or account-restriction action is implied. |
| Evidence is incomplete, unreadable, or inconsistent | Mark the case unresolved and request approved follow-up. | Do not guess, override, or alter records directly. |
| A security, impersonation, or account-compromise indicator is present | Preserve minimal evidence and escalate under CTX-RB-003. | Incident handling authority is separate. |
| The request requires suspension, restriction, or an unsupported exception | Escalate to the designated approver. | **Procedure not yet formally defined** unless an approved procedure is available. |
| The request implies an activity, payment, or payout decision | Route to the applicable activity or financial procedure. | Driver verification alone does not authorize it. |

## 7. Exception Handling

- Treat suspected fraud, impersonation, compromise, or evidence tampering as a potential incident; use [CTX-RB-003](./CTX-RB-003-incident-response-runbook.md).
- Treat a disputed activity photograph or washout outcome as an activity-review matter; use [CTX-RB-007](./CTX-RB-007-administrative-photo-review-runbook.md).
- Treat broad marketplace-trust concerns as an escalation under [CTX-RB-008](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md).
- Do not bypass the application by changing database records, configuration, roles, financial state, or provider state.

## 8. Audit Requirements

The case record SHALL retain:

- driver and case references sufficient to identify the review without duplicating sensitive evidence;
- review timestamp and authorized actor;
- evidence sources reviewed and material limitations;
- supported outcome or escalation reference;
- any notification or follow-up required.

Audit records must remain factual, neutral, and limited to information necessary for the operational purpose.

## 9. Related Policies

- [CTX-POL-003 — Data Retention Policy](../standards/CTX-POL-003-data-retention-policy.md)
- [CTX-POL-004 — Incident Response Policy](../standards/CTX-POL-004-incident-response-policy.md)
- [CTX-POL-008 — Access Control Policy](../standards/CTX-POL-008-access-control-policy.md)

## 10. Related Runbooks

- [CTX-RB-003 — Incident Response Runbook](./CTX-RB-003-incident-response-runbook.md)
- [CTX-RB-007 — Administrative Photo Review Runbook](./CTX-RB-007-administrative-photo-review-runbook.md)
- [CTX-RB-008 — Marketplace Trust & Fraud Escalation Runbook](./CTX-RB-008-marketplace-trust-and-fraud-escalation-runbook.md)
- [CTX-RB-009 — Daily Operations Checklist](./CTX-RB-009-daily-operations-checklist.md)

## 11. Related Architecture and Product Decisions

- [Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [Admin Operations Architecture](../architecture/admin-operations-architecture.md)
- [PD-052 — Marketplace Trust, Administrative Activity Review, and Dispute Resolution](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md)

## 12. Revision History

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-07-23 | Initial Draft. |
