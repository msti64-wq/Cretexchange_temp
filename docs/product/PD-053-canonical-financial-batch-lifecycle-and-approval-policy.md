# PD-053 — Canonical Financial Batch Lifecycle and Approval Policy

**Status:** Active
**Owner:** V8 Laboratories
**Product:** CreteXchange
**Decision type:** Assisted-pilot product and operational policy

## 1. Decision

For the assisted pilot, CreteXchange will use a weekly, Facility-scoped canonical financial batch policy. A batch groups canonical verified-activity obligations for human review and approval only. It does not collect funds, schedule a payment, create a Driver entitlement, fund a wallet, or settle money.

This proposed decision requires explicit owner approval and later indexing before implementation begins.

## 2. Status

**Active.** Owner approval authorizes this policy as governing documentation. It does not itself authorize implementation, migration, execution, deployment, or production-data action.

## 3. Context

Facility verification and auto-approval are operational only. Phase 2 canonical obligations record one unpaid, frozen obligation per verified activity. Phase 3A makes execution fail closed and retires unsafe legacy rails. Phase 3B needs an auditable way to discover ungrouped obligations and construct non-executing review batches without weakening those controls.

This policy governs the operational decisions for that workflow. [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md) governs its technical architecture.

## 4. Authority

This policy follows [Project Context](../project/project-context.md), [CTX-STD-001](../standards/cretexchange-platform-standards.md), [CTX-ARCH-001](../architecture/financial-architecture-and-kpi-specification.md), [CTX-ARCH-006](../architecture/driver-incentive-and-financial-settlement-architecture.md), [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md), [PD-045](./product-decisions.md#pd-045---canonical-driver-settlement-rail), [PD-050](./PD-050-facility-operational-access-and-billing-readiness.md), [PD-051](./PD-051-driver-activity-and-payment-lifecycle.md), [PD-052](./PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md), [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md), [CTX-UX-005](../ux/CTX-UX-005-driver-dashboard-experience.md), [CTX-UX-006](../ux/CTX-UX-006-facility-workspace-experience.md), [CTX-UX-007](../ux/CTX-UX-007-platform-operations-center-experience.md), [CTX-UX-008](../ux/CTX-UX-008-administrative-activity-review-experience.md), the [Product Decision index](./product-decisions.md), and the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md).

## 5. Policy principles

- Operational truth before financial convenience.
- One canonical obligation per verified activity.
- One active canonical membership per obligation.
- Frozen reviewed values and membership.
- No silent exclusion and no destructive history.
- Evidence, auditability, least privilege, and legacy isolation.
- No Driver harm for administrative convenience.
- Platform fee remains separate from Driver compensation.
- Approval is not collection; collection is not settlement; settlement is not withdrawal.
- Phase 3B is strictly non-executing.

## 6. Weekly period

For the assisted pilot, a weekly period begins Sunday at 00:00 in the Facility billing timezone and ends the following Sunday at 00:00, exclusive. This is a pilot default, not a permanent immutable policy. A later change requires an approved Product Decision update.

Daylight-saving transitions use timezone-aware local boundaries, never a fixed-hour interval or server-local week.

## 7. Facility timezone

The Facility owner’s valid IANA `billingTimezone` is the period source. Implicit server-local time is prohibited. If the timezone is missing or invalid, a canonical batch must not be constructed; the Facility requires operational remediation and the condition appears in the Platform Operations exception queue.

## 8. Zero platform fee

An explicit zero platform fee is permitted only for an intentional owner-specific waiver or approved system policy. Zero must be distinguishable from missing, malformed, negative, or ambiguous data. An authorized actor and a reason are required, and the waiver remains auditable.

Missing, malformed, negative, or ambiguous values must never become zero by fallback. The platform fee remains separate from Driver compensation.

## 9. Canonical batch identity

Every canonical batch must have a unique internal identifier, permanent human-readable reference, immutable Facility, immutable weekly period, revision, and canonical model version.

A reference such as `CTX-FB-2026-W30-000017` is recommended. It must not expose unnecessary PII, is never reused, survives cancellation, and may later be used by operations, audit, support, invoices, reconciliation, and safe provider metadata. The exact generation format is an architectural detail governed by CTX-ARCH-007.

## 10. Eligibility

An obligation may enter a canonical batch only when it:

- has the approved canonical obligation-kind/version;
- relates to an activity with status exactly `verified`;
- is pending and unpaid;
- has valid Driver, Facility, location, and activity relationships;
- has valid frozen Driver incentive and platform-fee values;
- has no active canonical membership;
- has no execution, settlement, cancellation, or reconciliation conflict;
- belongs to the approved weekly period; and
- has no unresolved material exception.

## 11. Lifecycle

| State | Policy meaning | Membership and totals | Execution |
| --- | --- | --- | --- |
| Draft | Candidate grouping for review | May change only by an explicit audited action | Prohibited |
| Ready for review | Complete grouping waiting for approval | Frozen | Prohibited |
| Approved | Authoritative grouping accepted for a later, separately authorized workflow | Immutable | Prohibited |
| Cancelled | Permanent historical cancellation | Audited release only when safe | Prohibited |

`processing`, `completed`, `paid`, `settled`, and `succeeded` are not Phase 3B lifecycle meanings.

## 12. Creation

An admin or super-admin may create a draft for one Facility and one weekly period. Construction selects only eligible canonical obligations, records frozen membership snapshots and totals, requires an audit event, and supports deterministic retry.

No external provider call, wallet mutation, payment completion, collection, or approval occurs during creation. A draft may be rebuilt only by a separate explicit audited action before ready-for-review.

## 13. Review

Reviewers must see the Facility, period/timezone, canonical reference, revision, obligation count, safe obligation references, Driver, location, verification date, frozen Driver incentive, frozen platform fee, Facility total, creation actor/reason, current state, and exceptions.

Review must not expose Stripe identifiers, bank information, payment methods, GPS, photos, private notes, or unrelated PII.

## 14. Approval

Approval requires an authenticated admin or super-admin, current state `ready_for_review`, explicit action, separate nonempty reason, actor/timestamp, valid expected-state check, frozen membership/totals, no unresolved material exception, and an append-only audit event.

Approval means only that Platform Operations accepts the batch as an authoritative grouping for a future separately authorized collection workflow. It must not call Stripe or Treasury, create wallet entitlement, mark paid/scheduled/settled, or invoke a legacy financial route.

## 15. Same-administrator pilot policy

During the assisted pilot, one authorized admin or super-admin may create a draft, move it to review, and approve it. Each is a separate explicit action with its own reason, actor, timestamp, and audit record. Future scale may require different actors through a separate Product Decision.

## 16. Cancellation

An admin or super-admin may cancel draft and ready-for-review batches. An approved but non-executed batch requires an elevated reason and complete audit trail. Cancellation never deletes the batch or reuses its reference.

Active memberships are released only through an audited workflow. Eligible obligations return to the pending/unbatched queue; conflicting or malformed obligations remain quarantined. Cancelled history is permanent.

## 17. Late obligations

An obligation created after the weekly period closes enters the next eligible weekly batch. It never reopens or mutates a ready-for-review or approved batch.

An emergency single-obligation batch may be used only for a documented assisted-pilot exception and follows the same creation, review, approval, audit, and non-execution rules.

## 18. Exclusion

An otherwise eligible obligation may not be silently excluded. Exclusion requires an approved exception category and reason, remains visible in the exception queue, does not cancel the obligation, does not alter frozen values, and cannot be used to avoid honoring a valid Driver obligation.

## 19. Emergency batches

An emergency single-obligation batch is permitted only when an assisted-pilot operational exception is documented and an admin or super-admin provides a reason. It must be explicitly identified as emergency/manual, contain one canonical obligation, follow the complete review/approval workflow, remain non-executing, and never bypass later Phase 3C controls.

## 20. Exceptions

At minimum, exceptions include missing frozen Driver incentive; invalid platform fee; missing Driver or Facility/location relationship; activity no longer verified; legacy/conflicting payment; duplicate activity-linked payment; active membership conflict; totals mismatch; period mismatch; cancellation conflict; reconciliation conflict; and unknown obligation/batch model.

Exceptions remain visible, block approval when material, are never auto-repaired, cannot be hidden through exclusion, and require actor/reason when resolved or quarantined.

## 21. Platform Operations authority

During Phase 3B, Platform Operations may view discovery queues; create obligations where PD-051 permits; create/rebuild drafts through audit; move to review; approve; cancel; quarantine exceptions; and request remediation.

Platform Operations may not call Stripe or Treasury, enable financial execution, create Driver wallet entitlement, mark paid or settled, alter frozen amounts, use legacy execution routes, repair production financial data without separate approval, or reconcile the observed `to1` event.

## 22. Discovery queues

The required queues are:

- Verified Activities Without Canonical Obligations;
- Pending Canonical Obligations Without Active Batch;
- Batches Requiring Review; and
- Quarantined Exceptions.

Each supports age visibility, Facility filtering, pagination, clear state, safe next action, least-privilege fields, and empty/unavailable states. Provider identifiers, payment methods, bank information, and unnecessary participant data are excluded.

## 23. Legacy isolation

`pending_washout_payments`, `washout_payment_batches`, legacy owner billing rows, and legacy reports are not canonical inputs. Unknown versions are quarantined. Canonical batches are ignored by legacy processors and webhooks. No automatic migration, reclassification, repair, or canonical batch is permitted for the unresolved `to1` event.

## 24. Audit requirements

Every mutation records actor, actor role, timestamp, reason, prior/new state, canonical batch reference, revision, obligation count, frozen totals, and exception category where applicable. Audit history is append-only.

## 25. Participant communication

Drivers and Facilities must never be told that Phase 3B approval means paid, scheduled, funds available, settlement complete, or withdrawal available.

Approved participant-facing meaning is: **the obligation is recorded and under Platform Operations processing; financial execution has not completed.**

## 26. Non-execution boundary

During Phase 3B, discovery, creation, review, approval, and cancellation move no money. No Stripe or Treasury call is permitted, no wallet entitlement is created, no payment becomes scheduled/paid/settled, and Phase 3A execution controls remain disabled.

## 27. Assisted-pilot procedure

1. Review Verified Activities Without Canonical Obligations.
2. Create canonical obligations only where authorized.
3. Review unbatched canonical obligations.
4. Create a Facility weekly draft.
5. Validate membership, totals, timezone, and exceptions.
6. Move the draft to ready-for-review.
7. Review separately.
8. Approve with a separate reason.
9. Stop.

No collection, wallet entitlement, payment, or settlement occurs.

## 28. Deferred decisions

Deferred decisions include permanent post-pilot cutoff policy, stricter separation of duties, canonical Facility collection mechanics, execution-attempt model, reconciliation, wallet entitlement, Driver withdrawal, public invoicing, production repair, and `to1` corrective action.

## 29. Success criteria

PD-053 is ready for owner approval when the weekly period, timezone behavior, zero-fee policy, same-admin policy, cancellation, late-obligation handling, exclusion, emergency batches, legacy handling, and non-execution boundary are explicit and an implementation can be audited against them.

## 30. Decision filter

A proposed behavior is allowed only when it preserves one canonical obligation, one active canonical membership, frozen values, append-only audit, least privilege, legacy isolation, non-execution during Phase 3B, clear operational versus financial meaning, and no reduction in Driver entitlement for administrative convenience.

## 31. Out of scope

This policy excludes Stripe collection, Treasury implementation, payment execution, reconciliation, Driver wallet entitlement, withdrawal, production-data repair, `to1` correction, legal or accounting advice, public invoicing, and Phase 3C/3D implementation details.
