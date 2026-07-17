-- Canonical-obligation uniqueness finalization.
--
-- Run only after 0024 has completed and an approved operator has verified the
-- safe transitional state. This is an autocommit migration: DROP INDEX
-- CONCURRENTLY cannot run inside a transaction block. It does not alter,
-- classify, or backfill payment rows and does not perform execution work.

-- Do not infer the historical global index from a name alone. Production
-- inspection identified this exact name, and this check also proves its table,
-- uniqueness, validity, readiness, non-partial form, and sole activity key.
-- A renamed or semantically different index is a stop-for-review condition.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class table_rel
    JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
    JOIN pg_index i ON i.indrelid = table_rel.oid
    JOIN pg_class index_rel ON index_rel.oid = i.indexrelid
    WHERE table_ns.nspname = 'public'
      AND table_rel.relname = 'payments'
      AND index_rel.relname = 'uniq_payments_activity_obligation'
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indnkeyatts = 1
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'activity_id'
  ) THEN
    RAISE EXCEPTION
      'Expected valid global payments(activity_id) uniqueness index is absent or semantically different. Stop for review.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class table_rel
    JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
    JOIN pg_index i ON i.indrelid = table_rel.oid
    JOIN pg_class index_rel ON index_rel.oid = i.indexrelid
    WHERE table_ns.nspname = 'public'
      AND table_rel.relname = 'payments'
      AND index_rel.relname = 'uniq_payments_canonical_verified_activity_obligation'
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnkeyatts = 1
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'activity_id'
      AND regexp_replace(
        regexp_replace(lower(pg_get_expr(i.indpred, i.indrelid)), '::(character varying|text)', '', 'g'),
        '[[:space:]()]',
        '',
        'g'
      )
        = 'activity_idisnotnullandobligation_kind=''canonical_verified_activity_v1'''
  ) THEN
    RAISE EXCEPTION
      'Canonical partial index is not valid, ready, or semantically exact. Historical global uniqueness remains required.';
  END IF;
END
$$;

DROP INDEX CONCURRENTLY "public"."uniq_payments_activity_obligation";
