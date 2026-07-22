# Schema Verification Query Appendix — 0027 and 0029

> **PREFLIGHT ONLY — NOT AUTHORIZATION TO EXECUTE**

Run these aggregate/catalog-only queries through the approved production client. Never include result rows, identifiers, credentials, or provider values in the release record.

## Before execution

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SHOW transaction_read_only;

-- No migration ledger is assumed. Discover it rather than inventing one.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
  AND (table_name ILIKE '%migration%' OR table_name ILIKE '%drizzle%')
ORDER BY table_schema, table_name;

-- Exact missing-object gate for 0027 and 0029.
SELECT
  to_regclass('public.rewards_periods') IS NULL AS rewards_periods_absent,
  to_regclass('public.canonical_financial_payment_attempts') IS NULL AS attempts_absent,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_lottery_entries' AND column_name='rewards_period_id') AS rewards_period_id_absent,
  NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='i' AND relname='idx_driver_lottery_entries_period_eligibility') AS lottery_index_absent,
  (SELECT count(*) FROM pg_class WHERE relkind='i' AND relname IN (
    'uniq_canonical_financial_attempt_batch_number',
    'uniq_canonical_financial_attempt_idempotency',
    'uniq_canonical_financial_attempt_provider_object',
    'uniq_canonical_financial_attempt_live_or_successful',
    'idx_canonical_financial_attempt_batch_state'
  )) = 0 AS attempt_indexes_absent,
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_canonical_financial_attempt_valid') AS attempt_check_absent;

-- Aggregate sizing and dependency support.
SELECT 'driver_lottery_entries' AS relation, count(*) AS row_count,
       pg_total_relation_size('public.driver_lottery_entries') AS total_bytes
FROM public.driver_lottery_entries
UNION ALL SELECT 'billing_batches', count(*), pg_total_relation_size('public.billing_batches') FROM public.billing_batches
UNION ALL SELECT 'users', count(*), pg_total_relation_size('public.users') FROM public.users;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='billing_batches' AND column_name='id') OR (table_name='users' AND column_name='id'));

SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='gen_random_uuid') AS gen_random_uuid_available;

-- Existing catalog state that must remain unchanged.
SELECT
  EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
          WHERE c.relname='uniq_payments_canonical_verified_activity_obligation'
            AND i.indisunique AND i.indisvalid AND i.indisready) AS canonical_partial_index_valid,
  NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='i' AND relname='uniq_payments_activity_obligation') AS legacy_global_index_absent,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_billing_batches_canonical_frozen_totals') AS frozen_totals_check_present;
ROLLBACK;
```

## After 0027 commit

```sql
SELECT c.column_name, c.data_type, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.table_schema='public'
  AND c.table_name='driver_lottery_entries'
  AND c.column_name IN ('rewards_period_id','eligibility_status','ineligibility_reason','eligibility_changed_at','eligibility_changed_by')
ORDER BY c.column_name;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.rewards_periods'::regclass
ORDER BY conname;

SELECT i.relname, x.indisvalid, x.indisready, pg_get_indexdef(i.oid)
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
WHERE i.relname='idx_driver_lottery_entries_period_eligibility';

SELECT count(*) FILTER (WHERE eligibility_status <> 'eligible') AS unexpected_non_default_rows,
       count(*) AS entry_rows
FROM public.driver_lottery_entries;
```

## After 0029 commit

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.canonical_financial_payment_attempts'::regclass
ORDER BY conname;

SELECT i.relname, x.indisunique, x.indisvalid, x.indisready, pg_get_indexdef(i.oid)
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
WHERE x.indrelid='public.canonical_financial_payment_attempts'::regclass
ORDER BY i.relname;

SELECT count(*) AS payment_attempt_rows
FROM public.canonical_financial_payment_attempts;

-- Reconfirm no accidental provider or financial records were created by schema DDL.
SELECT count(*) AS canonical_payment_attempts_created_during_schema_release
FROM public.canonical_financial_payment_attempts;
```

The expected final two counts are zero. A nonzero value is an incident investigation condition, not a basis to continue.
