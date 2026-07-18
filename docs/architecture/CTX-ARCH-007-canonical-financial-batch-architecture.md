# CTX-ARCH-007 — Canonical Financial Batch Architecture

**Document ID:** CTX-ARCH-007
**Status:** Approved architecture direction; non-executing
**Owner:** V8 Laboratories
**Product:** CreteXchange
**Effective date:** July 2026

## 1. Purpose

This document defines the canonical architecture for grouping verified-activity financial obligations into reviewable weekly Facility batches. A canonical batch is a frozen, auditable grouping of obligations; it is not a payment execution, collection, payout, settlement, wallet credit, or reconciliation result.

It governs canonical-obligation identification, periods, membership, frozen totals, review, approval, auditability, Platform Operations discovery, and safe coexistence with legacy records. It does not implement financial execution.

## 2. Authority and precedence

This document is governed by the documentation hierarchy in [Project Context](../project/project-context.md), [CTX-STD-001](../standards/cretexchange-platform-standards.md), [CTX-ARCH-001](./financial-architecture-and-kpi-specification.md), [CTX-ARCH-006](./driver-incentive-and-financial-settlement-architecture.md), [PD-045](../product/product-decisions.md#pd-045---canonical-driver-settlement-rail), [PD-050](../product/PD-050-facility-operational-access-and-billing-readiness.md), [PD-051](../product/PD-051-driver-activity-and-payment-lifecycle.md), [PD-052](../product/PD-052-marketplace-trust-administrative-activity-review-and-dispute-resolution.md), [PD-053](../product/PD-053-canonical-financial-batch-lifecycle-and-approval-policy.md), [PD-054](../product/PD-054-canonical-financial-visibility-and-obligation-workflow.md), [PB-001](../project/pilot/PB-001-cretexchange-pilot-baseline-v1.0.md), [CTX-UX-005](../ux/CTX-UX-005-driver-dashboard-experience.md), [CTX-UX-006](../ux/CTX-UX-006-facility-workspace-experience.md), [CTX-UX-007](../ux/CTX-UX-007-platform-operations-center-experience.md), [CTX-UX-008](../ux/CTX-UX-008-administrative-activity-review-experience.md), the [Product Decision index](../product/product-decisions.md), and the [Assisted-Pilot Operations Runbook](../project/pilot/assisted-pilot-operations-runbook.md).

Nothing in this document overrides higher-order policy or authorizes a migration, deployment, or financial execution.

## 3. Scope

Phase 3B is limited to non-executing discovery, draft construction, review, approval, cancellation, exception visibility, and append-only audit history.

It does not authorize Stripe collection, Treasury settlement, PaymentIntents, payouts, withdrawals, wallet credits, payment completion, Facility-charge collection, or reconciliation mutation. Phase 3A fail-closed execution fencing remains mandatory.

## 4. Architectural principles

- **Wallet-authoritative Driver settlement:** a Driver wallet may be credited only by a later authoritative entitlement process, never by activity verification, obligation creation, batch construction, or batch approval.
- **Separated rails:** Facility collection and Driver settlement are separate future rails. A Facility charge is not Driver compensation.
- **One obligation per verified activity:** the canonical boundary is `payments.activity_id` together with `obligation_kind = canonical_verified_activity_v1`; legacy/null-kind rows do not satisfy it.
- **One active membership per obligation:** an eligible obligation may have one active canonical batch membership only.
- **Frozen values and membership:** batch totals use obligation snapshots, never mutable rates, settings, or UI calculations.
- **Append-only history:** important actions and releases are recorded, never overwritten or deleted.
- **Fail closed:** missing, malformed, or unknown financial-model data denies construction or moves the item to an exception queue.
- **No legacy-rail reuse:** legacy payment queues, batch runners, and execution statuses are not canonical inputs.
- **Least privilege and transparency:** authorized operators see only the data needed to resolve a queue item.
- **Idempotency and reconciliation before entitlement:** retries return a deterministic outcome; any future external result requires reconciliation before wallet entitlement.
- **Versioned models:** canonical rows must be explicitly versioned so legacy rows never become canonical by inference.

## 5. Canonical obligation discriminator

`payments.status = 'pending'` is insufficient: legacy payment rows, historical records, and unrelated payment types can also be pending. Canonical selection therefore requires a durable field such as `obligation_kind`.

| Value | Meaning | Batch eligibility |
| --- | --- | --- |
| `canonical_verified_activity_v1` | Phase 2 obligation created from one verified activity with frozen values | Eligible only if all other checks pass |
| `legacy` or `null` | Historical or unclassified row | Never eligible |
| future version | A separately defined obligation model | Ineligible until explicitly supported |

The discriminator must be indexed with status and active-membership lookup fields. The Phase 2 obligation service must write `canonical_verified_activity_v1` transactionally. Existing rows remain `legacy`/null unless a separately approved, read-only classification process determines otherwise; no migration may silently reclassify them. Discovery, reports, and construction queries must filter by the discriminator.

The target uniqueness boundary is a valid, ready partial unique index over `payments(activity_id)` where `activity_id IS NOT NULL` and `obligation_kind = 'canonical_verified_activity_v1'`. A pre-existing global activity index is a transitional compatibility state: creation must remain fail-closed until the partial index is verified and the global index is removed under separately approved migration controls. Generic legacy payment writers remain permanently execution-fenced and cannot create canonical obligations.

## 6. Canonical obligation model

### Financial-history boundary

[PD-055](../product/PD-055-financial-history-clean-slate-cutoff.md) establishes the clean-slate boundary for internal financial testing: records before July 17, 2026 at 00:00 America/Chicago are retained as explicit historical test data. A classified activity and any related retained legacy financial artifact are not candidates for canonical obligation discovery, creation, batching, totals, exceptions, wallet operations, provider workflows, or execution. The history mapping is not a payment, payout, or batch status. A historical activity returns the `historical_test_activity` business result instead of a legacy-liability exception.

The canonical obligation source is `payments`, with exactly one row per `activity_id`. For a Phase 2 canonical row:

- `amount` is the frozen Driver incentive;
- `processing_fee` is the frozen Facility-to-platform fee;
- `owner_id`, `driver_id`, and `activity_id` are the Facility, Driver, and operational relationships;
- initial status is `pending`;
- actor, reason, creation timestamp, and `obligation_kind` are recorded;
- `batch_id`, paid timestamp, provider IDs, wallet entitlement, and execution state are empty at creation.

Definitions:

```text
Driver obligation = frozen Driver incentive
Platform fee      = frozen Facility-to-platform fee
Facility charge   = Driver obligation + Platform fee
```

The platform fee must never be treated as Driver compensation.

## 7. Canonical batch model

`billing_batches` is the existing batch table to evolve, rather than creating a fourth batch representation. Canonical rows require a durable `batch_model_version`, for example `canonical_financial_batch_v1`; legacy rows remain `legacy`/null.

A canonical batch represents one Facility, one weekly period, one timezone, one revision, frozen membership, frozen integer-cent totals, a canonical lifecycle state, actors/reasons/timestamps, exception count, and an immutable human-readable reference.

It does not represent Stripe readiness, a scheduled payment, a payment execution, settlement, wallet availability, or a Driver payout. Legacy execution-oriented fields and legacy `batch_status` meanings must not define the canonical lifecycle.

## 8. Human-readable batch reference

Every canonical batch receives a permanent server-generated reference such as `CTX-FB-2026-W30-000017`.

- `CTX-FB` identifies a CreteXchange financial batch.
- The year/week component aids operations but includes no participant or location PII.
- A monotonic sequence or collision-resistant server-generated suffix guarantees uniqueness.
- The reference is immutable, never reused, and unique by database constraint.
- Retries return the existing reference for the same idempotency context.
- Operators, audit events, future invoices, and future safe provider metadata use this reference; the numeric database ID is not the primary human-facing identifier.
- Logs may include the reference and safe actor IDs, never payment methods, bank data, secrets, or raw provider objects.

## 9. Weekly period architecture

The recommended initial rule is Facility owner `billingTimezone` as the validated IANA timezone, with a weekly period from Sunday 00:00 local time inclusive to the next Sunday 00:00 local time exclusive.

Canonical membership uses the canonical obligation creation timestamp in that timezone. The activity verification timestamp is shown as operational context. An obligation created after a period closes enters a later eligible period and never changes a review-ready or approved batch.

Each batch records local period start, local period end, timezone, cadence, creation timestamp, and revision. Implementations must use timezone-aware boundaries and half-open intervals; server-local time and fixed 24-hour assumptions are prohibited so daylight-saving transitions remain correct.

The exact cutoff day/time and whether an owner-level timezone is the final Facility policy require explicit confirmation in PD-053 before implementation.

## 10. Financial batch membership architecture

Create an append-only `financial_batch_memberships` table. `payments.batch_id` may be maintained for legacy compatibility only; it is not sufficient as the sole membership record because it cannot retain release history or independently enforce active membership safely.

| Field | Purpose |
| --- | --- |
| membership ID | Immutable identity |
| batch ID / payment ID | Canonical relationships |
| joined timestamp, actor, reason | Claim auditability |
| released timestamp, actor, reason | Explicit release history |
| membership state | Active or released, never deleted |
| frozen incentive / fee / Facility-charge snapshots | Immutable membership arithmetic |
| batch revision | Identifies the reviewed version |

PostgreSQL must enforce one active membership per payment with a partial unique index. Membership claim occurs inside the same transaction that creates or refreshes a draft. A guarded claim prevents two administrators or a scheduler and administrator from claiming the same obligation. No silent reassignment is permitted. An approved membership is immutable; release requires cancellation or an explicitly governed revision path.

## 11. Batch lifecycle

| State | Prior state | Authorized actor | Membership/totals | Audit and execution boundary |
| --- | --- | --- | --- | --- |
| `draft` | creation or explicit draft rebuild | admin, super-admin, or later approved safe scheduler | Mutable only through an explicit audited rebuild | Create/rebuild event; execution prohibited |
| `ready_for_review` | `draft` | admin or super-admin | Frozen | Actor, reason, time, and lock event required; execution prohibited |
| `approved` | `ready_for_review` | admin or super-admin | Immutable | Separate actor/reason/time required; execution prohibited |
| `cancelled` | `draft`, `ready_for_review`, or explicitly governed approved cancellation | admin or super-admin | Released only through audited workflow | Cancellation event; execution prohibited |

`processing`, `completed`, `paid`, `settled`, and `succeeded` are legacy or future execution meanings and must not describe a Phase 3B canonical lifecycle.

## 12. Draft construction

An authorized admin/super-admin may construct a draft for one Facility and one deterministic weekly period. A future scheduler may create drafts only after separate approval and may never review, approve, or execute.

Construction transactionally selects only eligible canonical obligations, claims memberships, stores frozen snapshots, validates totals, writes a batch/audit event, and returns the same canonical batch on a safe idempotent retry. It makes no provider call, wallet mutation, payment completion, or approval.

A draft may be rebuilt only through an explicit audited action before ready-for-review. Rebuild replaces active draft membership through releases and new joins in one transaction; it must not mutate a reviewed or approved batch.

## 13. Review and approval

Moving to ready-for-review requires resolved or quarantined material exceptions, a required reason, actor, timestamp, frozen membership, and frozen totals.

Approval requires the expected `ready_for_review` state, a separate explicit action, actor, timestamp, and reason. It leaves the batch non-executing. Approval does not mean a Facility was charged, a Driver has a payable date, a payment is scheduled, a wallet is funded, or settlement is complete.

For the assisted pilot, one administrator may create, review, and approve only if PD-053 authorizes it; every action must remain separately recorded with a reason.

## 14. Cancellation and revision

Cancellation requires an authorized actor, expected state, nonempty reason, audit event, and safe membership release. No batch is deleted. A cancelled batch remains visible and auditable.

Obligations return to eligible pending state only after conflict checks confirm they remain canonical, pending, unexecuted, and uncompromised. An approved batch is never edited in place. A corrected grouping uses a new revision and new immutable batch reference according to approved policy; prior references and snapshots remain intact.

## 15. Batch totals

Canonical totals are frozen integer cents:

- Driver incentive total;
- platform-fee total;
- Facility-charge total.

The invariant is:

```text
Facility-charge total = Driver-incentive total + platform-fee total
```

The batch totals must equal the sum of active membership snapshots. A database/application validation failure is a quarantined exception. Totals must never be derived from mutable location rates, current owner settings, UI values, or legacy queue data.

## 16. Exception architecture

Use a dedicated `financial_batch_exceptions` table plus append-only audit events. Exceptions are non-repairing records with category, source, safe reference, timestamp, status, and limited safe metadata.

Examples include invalid frozen incentive or fee; missing Driver, Facility, or location relationship; activity no longer verified; legacy/conflicting payment; duplicate activity-linked payment; conflicting membership; totals mismatch; out-of-period obligation; cancellation/reconciliation conflict; and unknown model version.

Material exceptions block review and approval. They are visible to authorized Platform Operations staff but never automatically repaired or populated with unnecessary PII, notes, photos, GPS evidence, provider IDs, payment methods, or bank details.

## 17. Append-only audit events

Create `financial_batch_audit_events` for batch created, draft rebuilt, obligation joined/released, ready-for-review, approval, cancellation, exception created/resolved, and attempted invalid transition.

Each event records event ID, batch ID/reference, actor ID/role, timestamp, reason, prior/new state, revision, obligation count, frozen totals, safe metadata, and error/exception category. Events never log secrets, provider payloads, bank information, or payment-method details.

## 18. Discovery services

Read-only Platform Operations services provide four queues:

1. **Verified activities without canonical obligations:** safe activity reference, safe Driver identity, Facility/location, verification time, frozen incentive, age, exception category, authorized next action.
2. **Canonical pending obligations without active membership:** safe obligation/activity reference, Facility/Driver, frozen incentive/fee/Facility total, creation actor/reason/time, age, status, period eligibility.
3. **Batches requiring review:** batch reference, Facility, period, state, count, frozen totals, creator, age, exception count, required next action.
4. **Quarantined exceptions:** only least-privilege operational context needed to escalate safely.

All queues support Facility filtering, age sorting, pagination, empty/unavailable/error states, and authorization. They exclude Stripe identifiers, payment methods, bank details, unrelated notes, photos, GPS evidence, and unnecessary PII.

## 19. API boundaries

Recommended versioned canonical routes are:

- `GET /api/admin/financial-obligations/missing`
- `GET /api/admin/financial-obligations/unbatched`
- `GET /api/admin/financial-batches`
- `GET /api/admin/financial-batches/:id`
- `POST /api/admin/financial-batches`
- `POST /api/admin/financial-batches/:id/ready-for-review`
- `POST /api/admin/financial-batches/:id/approve`
- `POST /api/admin/financial-batches/:id/cancel`

Every mutation requires authentication, admin/super-admin authorization, server-derived actor, nonempty bounded reason, expected state, idempotency behavior, stable error code, and an audit event. No route executes or retries money movement.

## 20. Authorization

Admins and super-admins may view queues, create drafts, move a batch to review, approve, cancel, and resolve separately authorized operational exceptions. Drivers and Facilities may not view Platform Operations financial queues, create/change batches, change membership, approve batches, or access other participants’ financial information.

## 21. Legacy isolation

Canonical services must ignore legacy/null/unknown model versions. Legacy consumers must reject or ignore canonical model versions. Explicit isolation is required from `pending_washout_payments`, `washout_payment_batches`, owner billing runs, daily batch jobs, legacy Stripe routes, legacy reports, mutable-rate logic, and webhook completion logic.

Canonical batches must never be selected by legacy processors. Existing legacy reporting must not be reused for canonical queues because it can expose provider identifiers, notes, and old paid/completed semantics.

## 22. Webhook boundary

Stripe webhooks must reject or ignore canonical Phase 3B batch references. They must never mark a canonical batch paid, completed, or settled and must never create wallet entitlement.

Only a later Phase 3C/3D execution-attempt contract may define canonical batch metadata accepted by webhooks. Until then, canonical batches have no provider linkage.

## 23. Non-execution guarantee

Phase 3B does not call Stripe or Treasury; create PaymentIntents; transfer money; create wallet entitlement; mark payment scheduled or paid; mark a Facility charge collected; reconcile provider results; or enable Phase 3A execution policy. Construction, review, approval, and cancellation are data-governance operations only.

## 24. Concurrency and idempotency

The design must handle two administrators creating the same Facility/period, scheduler/admin races, duplicate obligation claims, timeout retries, late creation, cancellation/recreation, and transition retries.

Required controls are database uniqueness, transactional guarded claims, request idempotency keys, deterministic existing-batch responses, immutable reviewed membership, and append-only audit history. Application prechecks alone are insufficient.

## 25. Schema and migration direction

Likely migration families are:

- `payments.obligation_kind` and supporting index;
- versioned canonical fields on `billing_batches`: reference, period, timezone, cadence, revision, canonical state, integer-cent totals, actors/reasons/times, lock time, and exception count;
- `financial_batch_memberships` with active-membership partial uniqueness;
- `financial_batch_audit_events`;
- `financial_batch_exceptions`;
- canonical Facility/period/revision uniqueness and total-consistency checks.

Migration planning must cover legacy nullability/defaults, read-only duplicate preflights, existing-batch classification, rollback, table-lock risk, PostgreSQL staging validation, and ordered deployment. Migration 0020 remains undeployed and this document does not authorize any migration deployment.

For the canonical-obligation uniqueness replacement, deployment is an explicitly approved operator procedure. The exact partial unique index is created and validated concurrently while the historical global activity index remains, which intentionally keeps canonical creation fail-closed in the transitional state. Only after a fresh catalog preflight, valid/ready predicate verification, and a separate approval checkpoint may the proven global index be retired concurrently. The retirement migration must also assert the final catalog after the concurrent drop: the global index is absent and the canonical index remains attached to `payments`, unique, valid, ready, single-key, non-expression, without included columns, and predicate-correct. A push or application restart must not be treated as migration execution: application deployment and PostgreSQL migration execution are separate controls. Concurrent retirement is non-atomic across its autocommit statements: a failed post-drop assertion can leave the global index absent. In that case, immediately enter separately authorized fail-closed recovery, do not retry blindly, inspect aggregate duplicate activity groups, and recreate the global index only if no legacy/canonical coexistence conflict would make it fail. Capability detection is live and canonical creation can become available as soon as the global index disappears. Recovery must preserve the partial duplicate boundary and must not reclassify, delete, or rewrite legacy rows.

## 26. Test architecture

Isolated native Node suites must cover discovery queues, canonical construction, lifecycle transitions, membership concurrency, privacy projections, non-execution, legacy isolation, webhook rejection, and Phase 1/2/3A regressions.

PostgreSQL-only tests are mandatory for partial unique active membership, concurrent claims, Facility/period/revision uniqueness, transactional totals, migration application, and rollback validation.

## 27. Platform Operations integration

The minimal Phase 3B Platform Operations views are **Missing Obligations**, **Unbatched Obligations**, **Batches Requiring Review**, and **Exceptions**. They are operational review queues with status, age, safe references, empty/error states, and authorized next actions—not payment execution screens.

## 28. Future-phase integration

- **Phase 3C:** canonical Facility collection may consume approved canonical batches only.
- **Phase 3D:** reconciliation and exactly-once Driver wallet entitlement may consume authoritative execution attempts only.
- **Phase 3E:** expanded Platform Operations workflow and any manual execution controls require separate approval.

These boundaries define safe integration points; they do not pre-authorize implementation.

## 29. Risks and failure modes

| Risk | Required response |
| --- | --- |
| Legacy pending row mistaken for canonical | Require discriminator; quarantine unknowns |
| Duplicate obligation or membership | Database uniqueness plus transaction; stop and escalate |
| Mutable rate changes after verification | Use frozen obligation/member values only |
| Late obligation changes approved batch | Defer it to a later eligible period |
| Totals mismatch | Quarantine; block review/approval |
| Legacy processor/webhook sees canonical row | Version guard and ignore/reject behavior |
| Retry duplicates batch | Idempotency key and deterministic existing response |
| Provider or wallet side effect | Treat as architecture violation; Phase 3A fence remains controlling |

## 30. Decision filter

Before any change, ask:

> Does this change identify, group, review, or audit an existing canonical obligation without moving money or implying entitlement?

If not, it belongs to a separately governed future financial phase.

## 31. Success criteria

Phase 3B is architecturally successful when implementation can prove that:

- only versioned canonical verified-activity obligations enter canonical batches;
- every obligation has at most one active canonical membership;
- frozen totals reconcile to membership snapshots;
- reviewed and approved membership is immutable;
- each action is authorized, idempotent, and append-only auditable;
- discovery queues are privacy-minimized and non-executing;
- legacy records and consumers are isolated;
- no Phase 3B path calls a money-moving provider or mutates economic financial state; and
- PostgreSQL preflight and staging gates pass before any deployment proposal.
