-- Canonical-obligation uniqueness replacement.
--
-- This migration is intentionally for an isolated/staging PostgreSQL rehearsal
-- before any production proposal. It neither classifies nor rewrites legacy
-- payment rows, and it performs no execution, collection, settlement, wallet,
-- or provider work. Run it as an autocommit migration: CREATE/DROP INDEX
-- CONCURRENTLY cannot run inside a transaction block.

-- Stop rather than silently changing an environment that has conflicting
-- canonical rows. Null-kind and other noncanonical legacy rows remain outside
-- the new canonical-only uniqueness boundary.
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

  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "activity_id" IS NOT NULL
      AND "obligation_kind" = 'canonical_verified_activity_v1'
    GROUP BY "activity_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create canonical partial uniqueness: duplicate canonical obligations exist. Reconciliation review is required.';
  END IF;
END
$$;

-- Do not use IF NOT EXISTS here: an invalid or semantically different index
-- with the canonical name must stop the migration for review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class index_rel
    JOIN pg_namespace index_ns ON index_ns.oid = index_rel.relnamespace
    WHERE index_ns.nspname = 'public'
      AND index_rel.relname = 'uniq_payments_canonical_verified_activity_obligation'
  ) THEN
    RAISE EXCEPTION
      'Canonical partial index name already exists. Inspect its validity and predicate before retrying.';
  END IF;
END
$$;

CREATE UNIQUE INDEX CONCURRENTLY "uniq_payments_canonical_verified_activity_obligation"
  ON "public"."payments" USING btree ("activity_id")
  WHERE "activity_id" IS NOT NULL
    AND "obligation_kind" = 'canonical_verified_activity_v1';

-- Require the exact ready, valid partial index before releasing the historical
-- global index. The global index remains in place if this validation fails.
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

-- This migration deliberately stops in the safe transitional state: both the
-- historical global index and the proven canonical partial index exist.
-- Application capability detection must therefore keep canonical creation
-- disabled. After a fresh catalog check and an explicit second approval,
-- migration 0025 retires the known historical global index concurrently.
