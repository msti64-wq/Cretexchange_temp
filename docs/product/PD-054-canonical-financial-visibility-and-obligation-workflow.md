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

## Canonical identity and compatibility

Canonical identity is explicit: only a `payments` row whose `obligation_kind` is `canonical_verified_activity_v1` is a canonical verified-activity obligation. A legacy or null-kind row linked to the same activity is not canonical evidence and remains a governed, review-blocked exception; it is neither converted nor deleted by this workflow.

The future database invariant is one canonical obligation per activity, enforced by a canonical-only partial unique index. The current global `payments(activity_id)` uniqueness state is a compatibility state, not proof that the future invariant is deployed. Creation must remain fail-closed until required audit columns, the valid/ready canonical partial index, and removal of the overbroad global index are positively verified. Generic legacy payment writers are not canonical-obligation writers and remain execution-fenced.

## Operational procedure

1. Open Financial Workspace and review Missing Obligations.
2. Select a verified activity and inspect the server-derived components.
3. Select Missing canonical obligation and enter meaningful supporting detail.
4. Confirm creation, then verify the item appears in the canonical queue.
5. Escalate exceptions instead of changing amounts manually.
6. Remember that creating, reviewing, or approving a record does not charge, pay, or settle anything.

## Follow-up

If future audit requirements require querying reason categories independently, add a separately approved durable schema field and migration. Do not reinterpret historical reason text or backfill records under this decision.

## Runtime source classification

The following sources remain deliberately separate in Platform Operations visibility:

| Source | Classification | Approved use |
| --- | --- | --- |
| `washout_activities` with persisted `verified` status and frozen `amount` | Operational source / derived eligibility input | Missing-obligation discovery and server-derived canonical preview only |
| `payments` with `obligation_kind = canonical_verified_activity_v1` | Canonical | Driver incentive, platform fee, expected Facility charge, and obligation state |
| `financial_batch_memberships`, canonical-version `billing_batches`, and `financial_batch_exceptions` | Canonical | Batch readiness, frozen totals, and exception visibility |
| `fees_ledger` | Historical noncanonical | Separate recurring/location-fee history; never included in canonical verified-activity totals |
| `pending_washout_payments`, legacy `payments` rows, and legacy `billing_batches` fields | Historical noncanonical / execution evidence where applicable | Diagnostics only; never eligibility or canonical totals |
| Provider identifiers and paid timestamps | Execution evidence | Never rendered in these Platform Operations pages and never treated as readiness |
| Owner and system fee configuration | Configuration | Server-side preview input only; never a replacement for the frozen canonical record |

### Runtime compatibility boundary

The obligation actor/reason audit columns are owned by the separately approved migration `0020_unique_payment_obligation_per_activity.sql`. Until that migration passes its target-database duplicate preflight and is explicitly deployed, the preview repository must not select or return those columns. Creation remains fail-closed because it must persist the server-derived actor and supporting detail; it must not silently discard that audit data. This compatibility boundary allows non-executing preview visibility, but it does **not** authorize migration deployment, obligation creation without durable audit data, financial execution, or a claim that durable per-obligation supporting detail is available in that target database.

## Target-schema verification package

The following read-only queries require separate target-database approval. They intentionally return schema metadata or aggregates only; none returns record identifiers, participant data, notes, or provider identifiers. The repository migration journal is not evidence of target deployment.

```sql
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;

SELECT required.column_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns actual
         WHERE actual.table_schema = 'public'
           AND actual.table_name = 'payments'
           AND actual.column_name = required.column_name
       ) AS exists
FROM (VALUES
  ('obligation_created_by'), ('obligation_creation_reason'), ('obligation_kind'),
  ('stripe_transfer_id'), ('stripe_payment_intent_id'), ('stripe_charge_id')
) AS required(column_name)
ORDER BY required.column_name;

SELECT tc.constraint_name, tc.constraint_type,
       kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name,
       cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
WHERE tc.table_schema = 'public' AND tc.table_name = 'payments'
ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

SELECT indexrel.relname AS index_name, indexrel.relname IS NOT NULL AS exists,
       i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
       pg_get_indexdef(i.indexrelid) AS definition
FROM pg_class table_rel
JOIN pg_namespace ns ON ns.oid = table_rel.relnamespace
JOIN pg_index i ON i.indrelid = table_rel.oid
JOIN pg_class indexrel ON indexrel.oid = i.indexrelid
WHERE ns.nspname = 'public' AND table_rel.relname = 'payments'
ORDER BY indexrel.relname;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND (table_name ILIKE '%migration%' OR table_name ILIKE '%drizzle%')
ORDER BY table_schema, table_name;

SELECT COUNT(*) AS payment_rows,
       COUNT(*) FILTER (WHERE activity_id IS NULL) AS null_activity_id_rows,
       COUNT(*) FILTER (WHERE paid_at IS NOT NULL) AS paid_timestamp_rows,
       COUNT(*) FILTER (WHERE stripe_transfer_id IS NOT NULL) AS transfer_evidence_rows,
       COUNT(*) FILTER (WHERE amount IS NULL OR processing_fee IS NULL OR amount < 0 OR processing_fee < 0) AS malformed_or_negative_component_rows
FROM payments;

SELECT COUNT(*) AS duplicate_activity_groups,
       COALESCE(SUM(row_count), 0) AS rows_in_duplicate_activity_groups
FROM (
  SELECT activity_id, COUNT(*) AS row_count
  FROM payments
  WHERE activity_id IS NOT NULL
  GROUP BY activity_id
  HAVING COUNT(*) > 1
) duplicates;
```

Only after the existence query confirms the relevant columns may an approved operator run aggregate-only follow-ups:

```sql
SELECT COUNT(*) FILTER (WHERE obligation_created_by IS NOT NULL) AS actor_populated_rows,
       COUNT(*) FILTER (WHERE obligation_creation_reason IS NOT NULL) AS reason_populated_rows
FROM payments;

SELECT COALESCE(obligation_kind, '<null>') AS obligation_kind,
       COUNT(*) AS row_count
FROM payments
GROUP BY obligation_kind
ORDER BY obligation_kind;
```

Migration `0020` can be reconsidered only after this preflight, duplicate classification, disposable/staging PostgreSQL validation, and separate deployment approval. Any duplicate non-null `activity_id` stops the migration process.

## Canonical uniqueness replacement deployment boundary

The replacement of historical global `payments(activity_id)` uniqueness with the canonical-only partial unique boundary is an operator-run PostgreSQL change, not an application-startup action. Migration `0024_replace_global_payment_activity_uniqueness_with_canonical_partial.sql` must be run only after a fresh, approved target-database preflight proves the expected valid global index, no duplicate canonical obligations, and the required audit/discriminator columns. It creates the partial index and deliberately stops in the safe transitional state. Migration `0025_retire_global_payment_activity_uniqueness.sql` is a separately approved finalization command.

The operator sequence is deliberately nontransactional: create the exact canonical partial unique index concurrently; verify it is unique, valid, ready, has one non-expression `activity_id` key, no included columns, and the approved predicate; confirm application creation remains fail-closed while the historical global index remains; then, under a separate explicit command and approval checkpoint, retire the proven global index concurrently. Migration `0025` must assert the post-drop catalog state: the historical index is absent and the canonical partial index remains attached to `payments`, unique, valid, ready, single-key, non-expression, without included columns, and predicate-correct. `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` must never be wrapped in a transaction block.

Pushing a repository commit may auto-deploy the application, but it does not itself authorize or execute this migration. The repository start command has no migration hook; the migration must remain a separate, explicitly approved operator action. The synthetic rehearsal bootstrap is guarded for dedicated `financial_validation_*` databases and must never be invoked by deployment or against a shared database.

If partial-index creation or verification fails, the global index remains and creation stays disabled. A failure after `DROP INDEX CONCURRENTLY` is not atomic: the command can fail because a post-drop assertion detects a bad final catalog state even though the historical index is already gone. The operator must immediately enter separately authorized fail-closed recovery, must not retry blindly, and must first inspect the catalog and aggregate duplicate activity groups. Recreating the historical global index is separately authorized recovery only after confirming that no legacy and canonical rows coexist for an activity; otherwise the recreated global index would fail. Capability detection is live, so canonical creation can become available immediately when the global index disappears; post-drop verification must therefore happen before any creation acceptance test. After the final state is verified, one selected-record, non-executing acceptance test may create exactly one canonical obligation and one idempotent retry; it must confirm queue deltas and the absence of provider, wallet, charge, payout, settlement, batch-execution, or paid evidence. No legacy row may be converted, deleted, or used for that test.
