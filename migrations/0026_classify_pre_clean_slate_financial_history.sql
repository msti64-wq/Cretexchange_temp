-- One-time, guarded classification of internal financial-test history.
-- Do not run this against production without a separately approved aggregate
-- preflight. It performs no provider, payment, wallet, settlement, or payout
-- action and never changes money, status, or an obligation kind.
BEGIN;

-- A pre-existing empty table is not a first application: it means an earlier
-- attempt or manual action left an unverifiable state. Stop before DDL or
-- classification writes so a rerun cannot silently treat it as clean.
DO $$
BEGIN
  IF to_regclass('public.financial_history_records') IS NOT NULL THEN
    IF (SELECT count(*) FROM financial_history_records) = 0 THEN
      RAISE EXCEPTION 'Financial history cutoff integrity failure: classification table already exists but contains no complete mapping.';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "financial_history_records" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "record_type" varchar NOT NULL,
  "record_id" varchar NOT NULL,
  "classification" varchar NOT NULL,
  "cutoff_key" varchar NOT NULL,
  "classification_reason" text NOT NULL,
  "classified_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "chk_financial_history_records_classification" CHECK ("classification" = 'historical_test_data'),
  CONSTRAINT "chk_financial_history_records_type" CHECK ("record_type" IN ('washout_activity', 'payment', 'billing_batch', 'owner_wallet_transaction', 'fee_ledger', 'pending_washout_payment', 'washout_payment_batch', 'wallet_transaction', 'withdrawal', 'driver_lottery_entry', 'lottery_drawing_winner', 'lottery_drawing_fulfillment', 'lottery_notification', 'notification')),
  CONSTRAINT "uniq_financial_history_records_type_id" UNIQUE ("record_type", "record_id")
);
CREATE INDEX IF NOT EXISTS "idx_financial_history_records_classification" ON "financial_history_records" ("classification", "record_type");

-- The baseline is deliberately exact. Any material divergence is a stop, not
-- an invitation to classify more data by inference.
DO $$
DECLARE
  cutoff timestamptz := timestamptz '2026-07-17 00:00:00 America/Chicago';
BEGIN
  -- A second execution is explicit only after proving every mapped record is
  -- the exact expected historical chain. Partial, substituted, contradictory,
  -- or relationship-incorrect mappings are an integrity failure, never an
  -- "already applied" result.
  IF (SELECT count(*) FROM financial_history_records) <> 0 THEN
    -- Recheck the complete approved baseline before allowing the special
    -- rerun result. A correct-looking mapping cannot mask subsequently
    -- changed business relationships or execution contamination.
    IF (SELECT count(*) FROM washout_activities) <> 36
      OR (SELECT count(*) FROM washout_activities WHERE status = 'verified') <> 29
      OR (SELECT count(*) FROM washout_activities WHERE (COALESCE(verified_at, created_at) AT TIME ZONE 'America/Chicago') < cutoff) <> 36
      OR (SELECT count(*) FROM washout_activities WHERE COALESCE(verified_at, created_at) IS NULL OR (COALESCE(verified_at, created_at) AT TIME ZONE 'America/Chicago') >= cutoff) <> 0
      OR (SELECT count(*) FROM payments) <> 1
      OR (SELECT count(*) FROM payments WHERE obligation_kind IS NULL) <> 1
      OR (SELECT count(*) FROM payments WHERE obligation_kind = 'canonical_verified_activity_v1') <> 0
      OR (SELECT count(*) FROM billing_batches WHERE status = 'completed') <> 3
      OR (SELECT count(*) FROM owner_wallet_transactions w JOIN payments p ON p.id = w.payment_id) <> 1
      OR (SELECT count(*) FROM fees_ledger) <> 0
      OR (SELECT count(*) FROM financial_batch_memberships) <> 0
      OR (SELECT count(*) FROM billing_batches WHERE batch_model_version = 'canonical_financial_batch_v1') <> 0
      OR (SELECT count(*) FROM driver_lottery_entries) <> 29
      OR (SELECT count(*) FROM lottery_drawings) <> 1
      OR (SELECT count(*) FROM lottery_drawing_winners) <> 1
      OR (SELECT count(*) FROM lottery_drawing_fulfillments) <> 1
      OR (SELECT count(*) FROM lottery_notifications) <> 2
      OR (SELECT count(*) FROM lottery_notifications WHERE notification_id IS NOT NULL) <> 2
      OR (SELECT count(*) FROM driver_lottery_entries) <> (SELECT count(*) FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
      OR (SELECT count(*) FROM lottery_drawings d WHERE EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND NOT EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff)) <> 1
      OR (SELECT count(*) FROM lottery_drawings d WHERE EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff)) <> 0
      OR (SELECT count(*) FROM lottery_drawing_winners) <> (SELECT count(*) FROM lottery_drawing_winners w JOIN driver_lottery_entries e ON e.id = w.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
      OR (SELECT count(*) FROM lottery_drawing_fulfillments) <> (SELECT count(*) FROM lottery_drawing_fulfillments f JOIN driver_lottery_entries e ON e.id = f.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
      OR (SELECT count(*) FROM lottery_notifications n WHERE NOT (
        EXISTS (SELECT 1 FROM lottery_drawing_winners w JOIN driver_lottery_entries e ON e.id = w.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
        OR (n.notification_kind = 'participant' AND EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND NOT EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff))
      )) <> 0
    THEN
      RAISE EXCEPTION 'Financial history cutoff integrity failure: approved baseline no longer matches the existing classification.';
    END IF;

    CREATE TEMP TABLE expected_financial_history_records ON COMMIT DROP AS
    WITH
      historic_activities AS (
        SELECT a.id
        FROM washout_activities a
        WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff
      ),
      historic_entries AS (
        SELECT e.id, e.activity_id, e.lottery_month, e.lottery_year
        FROM driver_lottery_entries e
        JOIN historic_activities a ON a.id = e.activity_id
      ),
      historic_winners AS (
        SELECT w.id, w.entry_id, w.lottery_drawing_id, w.driver_id
        FROM lottery_drawing_winners w
        JOIN historic_entries e ON e.id = w.entry_id
      ),
      historic_lottery_notifications AS (
        SELECT n.id, n.notification_id, n.lottery_drawing_id, n.driver_id,
          n.notification_kind, n.lottery_month, n.lottery_year
        FROM lottery_notifications n
        WHERE EXISTS (
          SELECT 1 FROM historic_winners w
          WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id
        ) OR (
          n.notification_kind = 'participant'
          AND EXISTS (SELECT 1 FROM historic_entries e WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year)
          AND NOT EXISTS (
            SELECT 1
            FROM driver_lottery_entries e
            LEFT JOIN historic_entries h ON h.id = e.id
            WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND h.id IS NULL
          )
        )
      ),
      expected AS (
        SELECT 'washout_activity'::varchar AS record_type, a.id::varchar AS record_id, 'Internal testing through 2026-07-16 America/Chicago'::text AS classification_reason
        FROM historic_activities a
        UNION ALL
        SELECT 'payment', p.id, 'Linked internal historical-test activity: ' || p.activity_id
        FROM payments p JOIN historic_activities a ON a.id = p.activity_id
        UNION ALL
        SELECT 'billing_batch', b.id, 'Internal completed legacy billing batch through cutoff'
        FROM billing_batches b WHERE b.batch_model_version IS NULL AND b.status = 'completed'
        UNION ALL
        SELECT 'owner_wallet_transaction', w.id,
          CASE WHEN p.id IS NOT NULL THEN 'Linked internal historical-test payment: ' || p.id ELSE 'Linked internal historical-test billing batch: ' || b.id END
        FROM owner_wallet_transactions w
        LEFT JOIN payments p ON p.id = w.payment_id AND EXISTS (SELECT 1 FROM historic_activities a WHERE a.id = p.activity_id)
        LEFT JOIN billing_batches b ON b.id = w.batch_id AND b.batch_model_version IS NULL AND b.status = 'completed'
        WHERE p.id IS NOT NULL OR b.id IS NOT NULL
        UNION ALL
        SELECT 'driver_lottery_entry', e.id, 'Reward entry linked to internal historical-test activity: ' || e.activity_id
        FROM historic_entries e
        UNION ALL
        SELECT 'lottery_drawing_winner', w.id, 'Winner linked to historical reward entry: ' || w.entry_id
        FROM historic_winners w
        UNION ALL
        SELECT 'lottery_drawing_fulfillment', f.id, 'Fulfillment linked to historical reward entry: ' || f.entry_id
        FROM lottery_drawing_fulfillments f JOIN historic_entries e ON e.id = f.entry_id
        UNION ALL
        SELECT 'lottery_notification', n.id,
          CASE WHEN EXISTS (SELECT 1 FROM historic_winners w WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id)
            THEN 'Notification supported by historical winner: ' || (SELECT w.id FROM historic_winners w WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id LIMIT 1)
            ELSE 'Notification supported by historical reward period: ' || n.lottery_year || '-' || n.lottery_month END
        FROM historic_lottery_notifications n
        UNION ALL
        SELECT 'notification', n.notification_id, 'Platform notification linked to historical reward notification: ' || n.id
        FROM historic_lottery_notifications n WHERE n.notification_id IS NOT NULL
      )
    SELECT record_type, record_id, 'historical_test_data'::varchar AS classification,
      'financial_history_cutoff_2026_07_17'::varchar AS cutoff_key, classification_reason
    FROM expected;

    IF (SELECT count(*) FROM financial_history_records) <> 76
      OR (SELECT count(*) FROM expected_financial_history_records) <> 76
      OR EXISTS (
        SELECT 1
        FROM financial_history_records actual
        FULL OUTER JOIN expected_financial_history_records expected
          ON expected.record_type = actual.record_type
          AND expected.record_id = actual.record_id
          AND expected.classification = actual.classification
          AND expected.cutoff_key = actual.cutoff_key
          AND expected.classification_reason = actual.classification_reason
        WHERE actual.id IS NULL OR expected.record_id IS NULL
      )
    THEN
      RAISE EXCEPTION 'Financial history cutoff integrity failure: existing classification does not match the complete expected historical mapping.';
    END IF;

    RAISE EXCEPTION 'Financial history cutoff already applied; no additional classification was attempted.';
  END IF;

  IF (SELECT count(*) FROM washout_activities) <> 36
    OR (SELECT count(*) FROM washout_activities WHERE status = 'verified') <> 29
    OR (SELECT count(*) FROM washout_activities WHERE (COALESCE(verified_at, created_at) AT TIME ZONE 'America/Chicago') < cutoff) <> 36
    OR (SELECT count(*) FROM washout_activities WHERE COALESCE(verified_at, created_at) IS NULL OR (COALESCE(verified_at, created_at) AT TIME ZONE 'America/Chicago') >= cutoff) <> 0
    OR (SELECT count(*) FROM payments) <> 1
    OR (SELECT count(*) FROM payments WHERE obligation_kind IS NULL) <> 1
    OR (SELECT count(*) FROM payments WHERE obligation_kind = 'canonical_verified_activity_v1') <> 0
    OR (SELECT count(*) FROM billing_batches WHERE status = 'completed') <> 3
    OR (SELECT count(*) FROM owner_wallet_transactions w JOIN payments p ON p.id = w.payment_id) <> 1
    OR (SELECT count(*) FROM fees_ledger) <> 0
    OR (SELECT count(*) FROM financial_batch_memberships) <> 0
    OR (SELECT count(*) FROM billing_batches WHERE batch_model_version = 'canonical_financial_batch_v1') <> 0
    -- Literal reward-program baseline established by the aggregate-only
    -- production preflight on 2026-07-18. Relationship assertions below
    -- prevent those counts from silently selecting an unsafe artifact.
    OR (SELECT count(*) FROM driver_lottery_entries) <> 29
    OR (SELECT count(*) FROM lottery_drawings) <> 1
    OR (SELECT count(*) FROM lottery_drawing_winners) <> 1
    OR (SELECT count(*) FROM lottery_drawing_fulfillments) <> 1
    OR (SELECT count(*) FROM lottery_notifications) <> 2
    OR (SELECT count(*) FROM lottery_notifications WHERE notification_id IS NOT NULL) <> 2
    -- The pre-cutoff activity set is exact. Every existing reward artifact
    -- must therefore be provably linked to that set or the migration stops.
    OR (SELECT count(*) FROM driver_lottery_entries) <> (SELECT count(*) FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
    OR (SELECT count(*) FROM lottery_drawings d WHERE EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND NOT EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff)) <> 1
    OR (SELECT count(*) FROM lottery_drawings d WHERE EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = d.lottery_month AND e.lottery_year = d.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff)) <> 0
    OR (SELECT count(*) FROM lottery_drawing_winners) <> (SELECT count(*) FROM lottery_drawing_winners w JOIN driver_lottery_entries e ON e.id = w.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
    OR (SELECT count(*) FROM lottery_drawing_fulfillments) <> (SELECT count(*) FROM lottery_drawing_fulfillments f JOIN driver_lottery_entries e ON e.id = f.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
    OR (SELECT count(*) FROM lottery_notifications n WHERE NOT (
      EXISTS (SELECT 1 FROM lottery_drawing_winners w JOIN driver_lottery_entries e ON e.id = w.entry_id JOIN washout_activities a ON a.id = e.activity_id WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff)
      OR (n.notification_kind = 'participant' AND EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') < cutoff) AND NOT EXISTS (SELECT 1 FROM driver_lottery_entries e JOIN washout_activities a ON a.id = e.activity_id WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND (COALESCE(a.verified_at, a.created_at) AT TIME ZONE 'America/Chicago') >= cutoff))
    )) <> 0
  THEN
    RAISE EXCEPTION 'Financial history cutoff baseline differs; no classification was applied.';
  END IF;
  RAISE NOTICE 'Financial history cutoff baseline accepted: 36 activities, 29 verified, 1 legacy payment, 3 legacy billing batches, 29 reward entries, 1 historical drawing, 1 winner, 1 fulfillment, 2 notifications, 0 canonical obligations, 0 canonical batches.';
END $$;

-- `verified_at` is the authoritative activity business timestamp. `created_at`
-- is used only when verification time is absent. AT TIME ZONE makes the
-- America/Chicago interpretation explicit and independent of server defaults.
INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'washout_activity', id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Internal testing through 2026-07-16 America/Chicago'
FROM washout_activities
WHERE (COALESCE(verified_at, created_at) AT TIME ZONE 'America/Chicago') < timestamptz '2026-07-17 00:00:00 America/Chicago';

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'payment', p.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Linked internal historical-test activity: ' || p.activity_id
FROM payments p JOIN financial_history_records h ON h.record_type = 'washout_activity' AND h.record_id = p.activity_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'pending_washout_payment', p.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Linked internal historical-test activity'
FROM pending_washout_payments p JOIN financial_history_records h ON h.record_type = 'washout_activity' AND h.record_id = p.activity_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'washout_payment_batch', b.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Batch containing internal historical-test pending payout'
FROM washout_payment_batches b JOIN pending_washout_payments p ON p.batch_id = b.id JOIN financial_history_records h ON h.record_type = 'pending_washout_payment' AND h.record_id = p.id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'owner_wallet_transaction', w.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Linked internal historical-test payment: ' || w.payment_id
FROM owner_wallet_transactions w JOIN financial_history_records h ON h.record_type = 'payment' AND h.record_id = w.payment_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'billing_batch', id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Internal completed legacy billing batch through cutoff'
FROM billing_batches WHERE batch_model_version IS NULL AND status = 'completed';

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'owner_wallet_transaction', w.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Linked internal historical-test billing batch: ' || w.batch_id
FROM owner_wallet_transactions w JOIN financial_history_records h ON h.record_type = 'billing_batch' AND h.record_id = w.batch_id
ON CONFLICT (record_type, record_id) DO NOTHING;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'fee_ledger', f.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Linked internal historical-test billing batch'
FROM fees_ledger f JOIN financial_history_records h ON h.record_type = 'billing_batch' AND h.record_id = f.batch_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'wallet_transaction', w.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Driver wallet entry sourced from internal historical-test activity'
FROM wallet_transactions w JOIN financial_history_records h ON h.record_type = 'washout_activity' AND h.record_id = w.source_id
WHERE w.source_type = 'washout';

-- Reward records inherit their source activity classification. Drawings are
-- deliberately not classified as a whole: a mixed period must retain its
-- current entries while historical entries are excluded from eligibility.
INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'driver_lottery_entry', e.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Reward entry linked to internal historical-test activity: ' || e.activity_id
FROM driver_lottery_entries e JOIN financial_history_records h ON h.record_type = 'washout_activity' AND h.record_id = e.activity_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'lottery_drawing_winner', w.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Winner linked to historical reward entry: ' || w.entry_id
FROM lottery_drawing_winners w JOIN financial_history_records h ON h.record_type = 'driver_lottery_entry' AND h.record_id = w.entry_id;

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'lottery_drawing_fulfillment', f.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Fulfillment linked to historical reward entry: ' || f.entry_id
FROM lottery_drawing_fulfillments f JOIN financial_history_records h ON h.record_type = 'driver_lottery_entry' AND h.record_id = f.entry_id;

-- Winner notifications are identifiable through their historical winner.
-- Participant notifications are classified only where the drawing contains no
-- current entry; mixed drawings remain available for current participants.
INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'lottery_notification', n.id, 'historical_test_data', 'financial_history_cutoff_2026_07_17',
  CASE WHEN EXISTS (
    SELECT 1 FROM lottery_drawing_winners w
    JOIN financial_history_records h ON h.record_type = 'lottery_drawing_winner' AND h.record_id = w.id
    WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id
  ) THEN 'Notification supported by historical winner: ' || (
    SELECT w.id FROM lottery_drawing_winners w
    JOIN financial_history_records h ON h.record_type = 'lottery_drawing_winner' AND h.record_id = w.id
    WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id LIMIT 1
  ) ELSE 'Notification supported by historical reward period: ' || n.lottery_year || '-' || n.lottery_month END
FROM lottery_notifications n
WHERE EXISTS (
  SELECT 1 FROM lottery_drawing_winners w
  JOIN financial_history_records h ON h.record_type = 'lottery_drawing_winner' AND h.record_id = w.id
  WHERE w.lottery_drawing_id = n.lottery_drawing_id AND w.driver_id = n.driver_id
) OR (
  n.notification_kind = 'participant' AND EXISTS (
    SELECT 1 FROM driver_lottery_entries e
    JOIN financial_history_records h ON h.record_type = 'driver_lottery_entry' AND h.record_id = e.id
    WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year
  ) AND NOT EXISTS (
    SELECT 1 FROM driver_lottery_entries e
    LEFT JOIN financial_history_records h ON h.record_type = 'driver_lottery_entry' AND h.record_id = e.id
    WHERE e.lottery_month = n.lottery_month AND e.lottery_year = n.lottery_year AND h.id IS NULL
  )
);

INSERT INTO financial_history_records (record_type, record_id, classification, cutoff_key, classification_reason)
SELECT 'notification', n.notification_id, 'historical_test_data', 'financial_history_cutoff_2026_07_17', 'Platform notification linked to historical reward notification: ' || n.id
FROM lottery_notifications n JOIN financial_history_records h ON h.record_type = 'lottery_notification' AND h.record_id = n.id
WHERE n.notification_id IS NOT NULL;

-- Verify the exact expected postcondition before committing. No money/status
-- column has been selected for mutation anywhere in this migration.
DO $$
BEGIN
  IF (SELECT count(*) FROM financial_history_records WHERE record_type = 'washout_activity') <> 36
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'payment') <> 1
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'billing_batch') <> 3
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'owner_wallet_transaction') <> 1
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'driver_lottery_entry') <> 29
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'lottery_drawing_winner') <> 1
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'lottery_drawing_fulfillment') <> 1
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'lottery_notification') <> 2
    OR (SELECT count(*) FROM financial_history_records WHERE record_type = 'notification') <> 2
    OR (SELECT count(*) FROM financial_history_records WHERE classification <> 'historical_test_data' OR cutoff_key <> 'financial_history_cutoff_2026_07_17') <> 0
  THEN
    RAISE EXCEPTION 'Financial history cutoff postcondition failed; classification was rolled back.';
  END IF;
  RAISE NOTICE 'Financial history cutoff classified the complete financial and reward chain; exact record-type counts are verified above.';
END $$;

COMMIT;
