# PD-054 — Canonical Financial Visibility and Obligation Workflow

**Status:** Approved for non-executing assisted-pilot implementation
**Authority:** Product Decision
**Related:** [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md), [PD-045](product-decisions.md), [PD-050](PD-050-facility-operational-access-and-billing-readiness.md), [PD-051](PD-051-driver-activity-and-payment-lifecycle.md), [PD-053](PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md), [CTX-ARCH-007](../architecture/CTX-ARCH-007-canonical-financial-batch-architecture.md)

## Decision

`/financial-workspace` is the sole Platform Operations destination for Missing Obligations, canonical obligations, unbatched obligations, canonical batches, review, approval, cancellation, exceptions, and non-executing financial visibility. `/payments`, `/fees`, and `/billing-settings` remain read-only legacy diagnostics; they cannot establish what is owed, billable, paid, or settled.

The sole approved obligation type is `canonical_verified_activity_v1` (English: **Verified activity obligation**; Spanish: **Obligación por actividad verificada**). One verified activity creates at most one canonical obligation. Its Driver incentive, platform fee, and expected Facility charge are inseparable, server-derived components of that one obligation—not operator-selectable types.

## Creation workflow

Creation begins with a selected Missing Obligations queue record. The application shows only safe, server-derived context: activity reference, Facility, Driver, verification time, frozen Driver incentive, platform fee, expected Facility charge, and fixed type. Operators cannot type an activity reference, choose a type, or edit an amount.

The current approved category is `missing_canonical_obligation`. The operator supplies meaningful, bounded supporting detail confirming review of the queue record, absence of a conflicting obligation, and relevant operational context. The server prefixes the stored bounded reason; the client cannot construct an arbitrary audit prefix. Details must not contain provider identifiers or amounts.

`legacy_record_reviewed` and `approved_operational_exception` are deferred. They require a separately approved correction/exception model and must not bypass eligibility, duplicate prevention, or server-derived values.

## Canonical visibility

Financial Workspace may summarize only verified activities missing obligations, `payments` rows with `obligation_kind = canonical_verified_activity_v1`, active canonical batch memberships, canonical-version billing batches, and canonical exception records. It excludes `ownerBillingReceivables`, `fees_ledger`, `pending_washout_payments`, legacy payment rows, legacy batch state, mutable rate reconstruction, and mock records.

Approved read-only metrics are Missing Obligations; unbatched canonical obligations with expected Driver incentive, platform fee, and Facility charge totals; Draft; Ready for Review; Approved — not executed; and unresolved exceptions. A failed or malformed canonical source is **Unavailable from canonical records**, never zero.

Approved batches must remain explicitly labeled **not executed, not charged, not paid, and not settled**.

## Boundaries and safeguards

All eligibility, activity identity, amounts, duplicate prevention, actor, and timestamp are server-authoritative. Admin and Super Admin roles only may query or create canonical obligations. Driver, Facility, and Owner roles are denied and must not receive cached workspace data.

This decision authorizes only read-only visibility and non-executing obligation preparation. It prohibits provider calls, charge or invoice creation, payment scheduling or execution, settlement, reconciliation, payout, withdrawal, wallet funding, retries, and Phase 3C behavior.

Legacy records may be incomplete or inconsistent and are not evidence of a canonical obligation, approval, receivable, charge, payment, collection, settlement, or Driver entitlement.

## Operational procedure

1. Open Financial Workspace and review Missing Obligations.
2. Select a verified activity and inspect the server-derived components.
3. Select Missing canonical obligation and enter meaningful supporting detail.
4. Confirm creation, then verify the item appears in the canonical queue.
5. Escalate exceptions instead of changing amounts manually.
6. Remember that creating, reviewing, or approving a record does not charge, pay, or settle anything.

## Follow-up

If future audit requirements require querying reason categories independently, add a separately approved durable schema field and migration. Do not reinterpret historical reason text or backfill records under this decision.
