# PD-051 — Driver Activity and Payment Lifecycle

**Status:** Active product-lifecycle decision; implementation and financial-remediation work remain separately authorized

**Date:** 2026-07-14

**Scope:** Canonical cross-experience vocabulary and lifecycle for Driver activity, payment obligation, settlement, and presentation

## 1. Purpose

This decision defines the canonical operational and financial lifecycle of Driver activities from submission through final payment. It establishes the shared lifecycle vocabulary for the Driver Dashboard, Driver Wallet, Platform Operations Center, reports, notifications, future financial processing, and future Construction Circular Economy Intelligence Platform operational intelligence.

This document does not implement payment, scheduling, wallet posting, settlement, or any UI. It does not represent current runtime behavior as compliant with every state described here.

## 2. Authority and Relationship

This decision extends and must be read with:

- [PD-050 — Facility Operational Access and Billing Readiness](./PD-050-facility-operational-access-and-billing-readiness.md)
- [CTX-UX-004 — First-Time User Onboarding Experience](../ux/CTX-UX-004-first-time-user-onboarding-experience.md)
- CTX-UX-005 — Platform Operations Center Experience, a planned UX document that is not yet published
- [Project Context](../project/project-context.md)
- [CTX-ARCH-001 — Financial Architecture and KPI Specification](../architecture/financial-architecture-and-kpi-specification.md)
- [CTX-ARCH-003 — Driver Operations Architecture](../architecture/driver-operations-architecture.md)
- [CTX-ARCH-006 — Driver Incentive and Financial Settlement Architecture](../architecture/driver-incentive-and-financial-settlement-architecture.md)
- [Canonical Driver Settlement Rail](./product-decisions.md#pd-045---canonical-driver-settlement-rail) (PD-045)
- [Driver Earnings and KPI Definitions](./product-decisions.md#pd-047---driver-earnings-and-kpi-definitions) (PD-047)
- [Financial Idempotency and Recovery Requirements](./product-decisions.md#pd-049---financial-idempotency-and-recovery-requirements) (PD-049)

This document is the authoritative cross-experience lifecycle and presentation vocabulary. It does not supersede the more specific financial source-of-truth, money, settlement, and idempotency rules in CTX-ARCH-001, CTX-ARCH-006, and PD-045.

### Current implementation boundary

Current persisted activity status values are `pending`, `verified`, and `rejected`; legacy and presentation terms must normalize at an API or presentation boundary. `Submitted`, `Pending Review`, `Admin Review`, `Admin Verified`, and `Admin Rejected` are lifecycle or presentation labels, not authorization to add stored values without separately approved architecture, schema, and implementation work.

Financial state is not inferred from activity status. `payments`, the canonical Driver Wallet ledger, and the selected settlement rail provide the financial evidence defined by CTX-ARCH-001, CTX-ARCH-006, and PD-045. A future implementation must map the presentation vocabulary in this decision to those authoritative sources without creating duplicate calculations or state machines.

## 3. Guiding Principle

> Operational verification always precedes financial processing.

Verification determines operational validity. Payment determines financial completion. The two must remain independent.

An activity awaiting review is not eligible for a payment obligation. A verified activity is not automatically paid. A payment, wallet, payout, or settlement status must never rewrite the activity’s operational outcome.

## 4. Canonical Lifecycle Model

The primary participant-facing lifecycle is:

```text
Submitted
↓
Pending Review
↓
Verified
↓
Pending Payment
↓
Payment Scheduled
↓
Paid
```

This is a conceptual sequence across two independent domains, not one stored status field. `Verified` remains an operational outcome. `Pending Payment`, `Payment Scheduled`, and `Paid` are financial presentation states supported only by their canonical financial evidence.

Alternate operational paths are:

```text
Submitted
↓
Pending Review
↓
Rejected
```

```text
Submitted
↓
Pending Review
↓
Admin Review
↓
Verified
or Rejected
```

## 5. State Domains and Source-of-Truth Rule

| Domain | Canonical source | Meaning | Must not be inferred from |
| --- | --- | --- | --- |
| Operational activity | `washout_activities` and its canonical status contract | Whether submitted activity is pending, verified, or rejected | Payment rows, wallet balance, Stripe state, or a UI label alone |
| Payment obligation | Canonical `payments` record and CTX-ARCH-006 approval contract | The approved incentive/owner-charge obligation | Current location rate, rewards, or wallet balance |
| Wallet settlement | Canonical Driver Wallet ledger | Pending/available economic entitlement and balance | Activity rows or a Stripe account’s readiness |
| External payout | Canonical wallet withdrawal and reconciled selected external rail | Whether a withdrawal/disbursement was scheduled, attempted, completed, or exceptional | Activity verification or a Stripe Connect account alone |

The same activity may therefore appear as **Verified** operationally while its payment is **Pending Payment** financially. This is correct and must not be collapsed into a single status.

## 6. Operational States

### Submitted

| Attribute | Definition |
| --- | --- |
| Purpose | A Driver has completed the applicable submission attempt and the platform has accepted the activity for the review workflow. |
| Entry criteria | Server-accepted activity submission with the required operational data and evidence for the current workflow. |
| Exit criteria | The activity enters Pending Review, or an authorized validation/recovery outcome establishes that acceptance did not complete. |
| Displayed participant message | “Your activity was submitted. We will let you know when review is complete.” |
| Consumed by | Driver activity history, Facility review queue, Platform Operations support, notifications, and operational reports. |
| Next possible states | Pending Review; an explicitly unavailable or recovery presentation if submission was not actually accepted. |

`Submitted` is a participant-facing transition label. Where the persisted row is initialized as `pending`, consumers must present the status consistently rather than inventing a separate stored state.

### Pending Review

| Attribute | Definition |
| --- | --- |
| Purpose | The activity is awaiting authorized operational review. |
| Entry criteria | A submitted activity exists with canonical pending operational status, including recognized pending-review aliases normalized at the boundary. |
| Exit criteria | Authorized verification, rejection, or escalation to Admin Review. |
| Displayed participant message | “Your activity is awaiting review. Verification is not payment confirmation.” |
| Consumed by | Driver Dashboard, Driver Wallet awaiting-review view, Facility review queue, Platform Operations Center, notifications, and operational reports. |
| Next possible states | Verified; Rejected; Admin Review. |

Pending Review creates no payment, charge, wallet credit, payout, or paid total.

### Verified

| Attribute | Definition |
| --- | --- |
| Purpose | The activity was confirmed as operationally valid through the authorized review process. |
| Entry criteria | A pending activity transitions to canonical `verified` under the applicable authorization and evidence rules. |
| Exit criteria | Operationally terminal, except an audited correction path. Its associated financial lifecycle may begin or continue independently. |
| Displayed participant message | “Your activity was verified. Payment status, if applicable, is shown separately.” |
| Consumed by | Driver history, Facility records, Platform Operations Center, activity reports, approved-incentive processing, and future operational intelligence. |
| Next possible states | Financially: Not Eligible, Pending Payment, Payment Scheduled, Paid, or Payment Exception. Operationally: no ordinary next state. |

Verified does not mean paid, settled, funded, wallet-available, or withdrawable.

### Rejected

| Attribute | Definition |
| --- | --- |
| Purpose | The activity did not satisfy the authorized operational verification requirements. |
| Entry criteria | A pending or administrative-review activity receives an authorized rejected outcome. |
| Exit criteria | Operationally terminal except for an audited administrative correction or separately authorized dispute process. |
| Displayed participant message | “This activity was not verified. Review the available operational guidance or contact support if a correction path is available.” |
| Consumed by | Driver history, Facility review records, Platform Operations Center, notifications, and rejection reporting. |
| Next possible states | No ordinary financial state; an audited administrative correction only. |

Rejected activity creates no payment obligation, owner charge, wallet credit, payout, or paid total.

### Admin Review

| Attribute | Definition |
| --- | --- |
| Purpose | An authorized exception or escalation requires Platform Operations review before the operational outcome is decided. |
| Entry criteria | A pending activity meets an approved escalation condition, such as a review exception, conflict, or authorized support case. |
| Exit criteria | An authorized Admin Verified or Admin Rejected decision is recorded through the approved operational workflow. |
| Displayed participant message | “Your activity requires additional review. We will provide an update when the operational review is complete.” |
| Consumed by | Platform Operations Center, authorized support, notifications, and administrative-review reporting. |
| Next possible states | Admin Verified; Admin Rejected. |

Admin Review is an operational exception state. It is not a payment hold, a settlement state, or an invitation to bypass evidence or authorization requirements.

### Admin Verified

| Attribute | Definition |
| --- | --- |
| Purpose | An authorized administrative review confirmed the activity as operationally valid. |
| Entry criteria | An authorized administrator completes an auditable Admin Review and records a verified outcome. |
| Exit criteria | The activity is represented as canonical `verified`; financial processing follows the same rules as any other verified activity. |
| Displayed participant message | “Your activity was verified after additional review. Payment status, if applicable, is shown separately.” |
| Consumed by | The same consumers as Verified, plus administrative-review reporting. |
| Next possible states | Pending Payment; Payment Scheduled; Paid; Payment Exception; or Not Eligible where no driver payment is due. |

`Admin Verified` is a presentation and audit distinction, not a second financial rule or a replacement stored activity status.

### Admin Rejected

| Attribute | Definition |
| --- | --- |
| Purpose | An authorized administrative review confirmed that the activity cannot be verified. |
| Entry criteria | An authorized administrator completes an auditable Admin Review and records a rejected outcome. |
| Exit criteria | The activity is represented as canonical `rejected`; no financial processing begins. |
| Displayed participant message | “This activity was not verified after additional review. Review the available operational guidance or contact support if permitted.” |
| Consumed by | The same consumers as Rejected, plus administrative-review reporting. |
| Next possible states | No ordinary financial state; an audited administrative correction only. |

## 7. Financial States

Financial states begin only after operational verification. They are presentation categories over canonical payment, wallet, and payout evidence—not new activity-status values.

### Not Eligible

| Attribute | Definition |
| --- | --- |
| Purpose | Explain that a verified activity does not create a Driver payment entitlement under the applicable approved financial policy. |
| Entry criteria | Canonical financial evidence shows no Driver incentive is due, such as an approved zero-incentive representation, a non-compensable workflow, or another expressly governed condition. |
| Exit criteria | Ordinarily terminal; changes require an audited correction under governing financial architecture. |
| Displayed participant message | “This verified activity does not have a Driver payment associated with it.” |
| Consumed by | Driver Dashboard, Driver Wallet, financial reports, Platform Operations Center, and support. |
| Next possible states | No ordinary payment state; audited financial correction only. |

Not Eligible must not be inferred merely because a payment row is delayed, missing, or unavailable. Unknown financial evidence is unavailable/exceptional, not zero.

### Pending Payment

| Attribute | Definition |
| --- | --- |
| Purpose | Show that a verified activity has a recognized payment obligation or pending wallet entitlement that is not yet paid or externally settled. |
| Entry criteria | Operational status is verified and canonical financial evidence establishes an unpaid payment obligation or pending wallet entitlement. |
| Exit criteria | A canonical schedule/withdrawal state is created, the entitlement is paid, or a governed exception occurs. |
| Displayed participant message | “Your verified activity is awaiting payment processing. Verification does not mean payment is complete.” |
| Consumed by | Driver Dashboard, Driver Wallet, Platform Operations Center, financial reports, notifications, and future financial processing. |
| Next possible states | Payment Scheduled; Paid; Payment Exception. |

Pending Payment excludes every activity still awaiting verification. It also does not promise a payment date until a separately approved schedule exists.

### Payment Scheduled

| Attribute | Definition |
| --- | --- |
| Purpose | Communicate that a canonical payment/withdrawal schedule has been recorded for an eligible unpaid entitlement. |
| Entry criteria | A separately approved scheduling policy and canonical schedule or withdrawal record identify a future processing attempt. |
| Exit criteria | The payment completes with reconciled evidence or moves to Payment Exception. |
| Displayed participant message | “Your payment is scheduled. We will update you when processing is complete.” |
| Consumed by | Driver Dashboard, Driver Wallet, notifications, Platform Operations Center, and financial reports. |
| Next possible states | Paid; Payment Exception. |

No UI, notification, or report may display Payment Scheduled until scheduling policy, source records, and reconciliation behavior are separately approved and implemented under CTX-ARCH-006.

### Paid

| Attribute | Definition |
| --- | --- |
| Purpose | Confirm final financial completion for the Driver incentive. |
| Entry criteria | Canonical settlement evidence confirms the selected settlement rail completed exactly one payment for the applicable entitlement. |
| Exit criteria | Terminal for ordinary presentation; audited reversal, correction, or dispute treatment follows governing financial architecture. |
| Displayed participant message | “Your payment is complete.” |
| Consumed by | Driver paid history, wallet history, financial reports, Platform Operations Center, notifications, and reconciliations. |
| Next possible states | Audited reversal, correction, or dispute state only. |

Paid requires canonical settlement evidence. A verified activity, payment row, Stripe account readiness, payout request, or wallet balance alone does not prove Paid.

### Payment Exception

| Attribute | Definition |
| --- | --- |
| Purpose | Present an unresolved payment-processing problem without changing the activity’s operational validity. |
| Entry criteria | Canonical financial processing identifies a failed, unavailable, disputed, conflicting, or unreconciled state requiring authorized recovery. |
| Exit criteria | Reconciled return to Pending Payment, Payment Scheduled, Paid, or an authorized financial correction. |
| Displayed participant message | “There is a payment-processing issue. Your verified activity remains recorded while the issue is reviewed.” |
| Consumed by | Driver Wallet, Platform Operations Center, authorized support, financial reports, notifications, and reconciliation. |
| Next possible states | Pending Payment; Payment Scheduled; Paid; audited correction. |

Payment Exception must never silently become Not Eligible, Paid, or a changed activity status. Retrying or recovery must follow PD-049 idempotency and reconciliation requirements.

## 8. Driver Dashboard Presentation

The Driver Dashboard should present separate operational and financial sections using only authoritative data appropriate to each label.

| Recommended section | Meaning | Inclusion rule | Exclusion rule |
| --- | --- | --- | --- |
| Awaiting Review | Operational activities not yet verified or rejected | Pending Review / authorized Admin Review | Verified, rejected, payment states |
| Verified Awaiting Payment | Verified activities with an unpaid recognized payment obligation or pending wallet entitlement | Verified + Pending Payment evidence | Activities awaiting verification; paid records; unknown evidence |
| Next Scheduled Payment | The next canonical future payment/withdrawal schedule, if a policy and record exist | Payment Scheduled evidence | Estimated, inferred, or unsupported dates |
| Lifetime Verified Activities | Count of verified operational activity | Canonical verified activity records | Rejected, pending, payment amounts |
| Wallet Balance | Current canonical wallet-ledger balance | Driver Wallet ledger only | Activity amounts, configured rates, or unpaid payment rows |

The dashboard must not label activities still awaiting verification as Pending Payment, must not calculate wallet balance from activities, and must not portray Verified as Paid.

## 9. Driver Wallet Presentation

The Driver Wallet should distinguish operational context from financial state.

| Recommended section | Purpose | Source boundary |
| --- | --- | --- |
| Awaiting Review | Explain that qualifying activity is still under operational review | Activity status only; no financial value implied |
| Verified Awaiting Payment | Show recognized unpaid financial obligations or pending entitlement | Payment/wallet evidence only after verified activity |
| Scheduled Payments | Show only separately approved, canonical payment schedules | Canonical schedule or withdrawal record |
| Payment History | Show settled payment history | Canonical settlement evidence |
| Pending Exceptions | Surface recoverable payment-processing issues | Canonical exception/reconciliation evidence |

Wallet balance, pending wallet value, available wallet value, payment obligation, and paid history are distinct concepts. The Wallet must not derive a balance from activity rows or represent an activity-reward indicator as financial payment.

## 10. Platform Operations Center

The Platform Operations Center should expose aggregate, role-appropriate lifecycle metrics without disclosing unnecessary participant or financial details.

| Metric | Domain | Definition |
| --- | --- | --- |
| Activities Awaiting Review | Operational | Count of Pending Review and authorized Admin Review activities. |
| Verified Activities | Operational | Count of canonical verified activities. |
| Rejected Activities | Operational | Count of canonical rejected activities. |
| Pending Payments | Financial | Verified activities with recognized unpaid payment/wallet evidence. |
| Scheduled Payments | Financial | Eligible payments with canonical schedule evidence. |
| Payment Exceptions | Financial | Unresolved canonical payment-processing exceptions. |
| Administrative Reviews | Operational | Activities currently in or completed through an auditable Admin Review path. |

Operational metrics must not be used to infer paid totals. Financial metrics must not be used to redefine operational verification outcomes.

## 11. Notifications

Notifications should announce a current state and one next action. They must not overstate financial completion.

| Audience | Event | Required meaning |
| --- | --- | --- |
| Driver | Activity Submitted | Submission was accepted and is entering review. |
| Driver | Pending Review | An authorized review remains outstanding. |
| Driver | Verified | Operational review completed; payment status is separate. |
| Driver | Scheduled | A canonical payment schedule exists; do not send until implemented. |
| Driver | Paid | Canonical settlement evidence confirms payment completion. |
| Driver | Rejected | Operational verification did not complete; state the authorized next step. |
| Driver | Admin Review | Additional operational review is required; no financial outcome is implied. |

Current notification behavior must not be represented as implementing every event above until separately approved and validated.

## 12. Reporting

Reports must derive counts from the domain matching the question.

| Report type | Uses | Must not use as a substitute |
| --- | --- | --- |
| Operational reports | Canonical activity states and activity history | Payment, wallet, or settlement state |
| Financial reports | Canonical `payments`, billing, wallet ledger, and selected settlement evidence | Configured incentive, raw activity amount alone, or activity status alone |
| Wallet reports | Canonical wallet transactions and balances | Payment obligations or activity rows alone |
| Combined lifecycle report | Clearly segmented operational and financial columns with source labels | A blended status or total that obscures the underlying domain |

Operational and financial reports must never mix their counts, amounts, dates, or status labels into a single unlabeled metric. Unknown or unavailable financial evidence must remain unknown or unavailable rather than becoming a zero or a paid state.

## 13. Success Metrics

Future approved measurement may consider:

- average review time;
- average verification time;
- average payment delay;
- rejected percentage;
- administrative-review percentage;
- payment-exception percentage; and
- time to payment.

Metrics require explicit definitions, authorized data sources, privacy review, and approved implementation before collection or use. They must distinguish operational timestamps from financial timestamps and never imply causation or participant fault without evidence.

## 14. Out of Scope

This decision does not authorize:

- billing implementation;
- Stripe implementation;
- wallet implementation;
- Treasury;
- settlement mechanics;
- accounting;
- tax; or
- 1099 generation.

It also does not authorize schema changes, APIs, routes, financial calculations, data migration, historical backfill, payment scheduling, notification changes, UI changes, or production financial repair.

## 15. Decision Filter

> **Does this change affect operational state, financial state, or merely the presentation of an existing state?**

If the answer is unclear, stop and identify the authoritative source before design or implementation proceeds. A presentation change must not create a new state calculation. An operational-state change must not alter financial completion. A financial-state change must follow CTX-ARCH-001, CTX-ARCH-006, PD-045, and PD-049.

## 16. Implementation Boundary

Any implementation following this decision requires separately approved scope, source-of-truth verification, appropriate financial/security validation, and the idempotency, auditability, and recovery controls required by the governing financial architecture. This document itself changes no current runtime behavior.
