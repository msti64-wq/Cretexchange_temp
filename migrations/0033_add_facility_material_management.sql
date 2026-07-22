-- CTX-ARCH-002 / CTX-ARCH-005: normalized, facility-scoped material acceptance.
-- This migration is intentionally operational-only. It does not alter activities,
-- financial records, payout settings, or execution behavior.

ALTER TABLE materials ADD COLUMN IF NOT EXISTS category varchar;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS retired_at timestamp;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS icon_ref varchar;

ALTER TABLE location_material_intents ADD COLUMN IF NOT EXISTS custom_category varchar;
ALTER TABLE location_material_intents ADD COLUMN IF NOT EXISTS custom_description text;
ALTER TABLE location_material_intents ADD COLUMN IF NOT EXISTS owner_instructions text;
ALTER TABLE location_material_intents ADD COLUMN IF NOT EXISTS created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE location_material_intents ADD COLUMN IF NOT EXISTS updated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

-- Normalize the legacy custom-label spelling before adding the invariant.
UPDATE location_material_intents
SET custom_label = material_custom_label
WHERE custom_label IS NULL
  AND material_custom_label IS NOT NULL
  AND btrim(material_custom_label) <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM location_material_intents
    WHERE material_slug IS NOT NULL
      AND custom_label IS NOT NULL
      AND btrim(custom_label) <> ''
  ) THEN
    RAISE EXCEPTION 'Cannot enforce facility material identity: a record has both a system and custom material';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM location_material_intents
    WHERE material_slug IS NULL
      AND (custom_label IS NULL OR btrim(custom_label) = '')
  ) THEN
    RAISE EXCEPTION 'Cannot enforce facility material identity: a record has neither a system nor custom material';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM location_material_intents
    WHERE material_slug IS NOT NULL
    GROUP BY location_id, material_slug
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create unique facility system-material index: duplicate assignments exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM location_material_intents
    WHERE material_slug IS NULL AND custom_label IS NOT NULL
    GROUP BY location_id, lower(btrim(custom_label))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create unique facility custom-material index: duplicate assignments exist';
  END IF;
END $$;

ALTER TABLE location_material_intents
  ADD CONSTRAINT location_material_intents_exactly_one_identity
  CHECK (
    (material_slug IS NOT NULL AND (custom_label IS NULL OR btrim(custom_label) = ''))
    OR (material_slug IS NULL AND custom_label IS NOT NULL AND btrim(custom_label) <> '')
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmi_location_system_material_unique
  ON location_material_intents (location_id, material_slug)
  WHERE material_slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lmi_location_custom_material_unique
  ON location_material_intents (location_id, lower(btrim(custom_label)))
  WHERE material_slug IS NULL AND custom_label IS NOT NULL;

-- Idempotent, standardized catalog. Owners may add separate facility-scoped custom names.
INSERT INTO materials (slug, display_name, category, description, is_active, display_order)
VALUES
  ('concrete-washout', 'Concrete Washout', 'Concrete', 'Concrete washout accepted at participating facilities.', true, 10),
  ('returned-concrete', 'Returned Concrete', 'Concrete', 'Unused returned concrete.', true, 20),
  ('hardened-concrete', 'Hardened Concrete', 'Concrete', 'Hardened concrete for recovery or processing.', true, 30),
  ('broken-concrete', 'Broken Concrete', 'Concrete', 'Broken concrete for aggregate recovery.', true, 40),
  ('concrete-slurry', 'Concrete Slurry', 'Concrete', 'Concrete slurry subject to facility instructions.', true, 50),
  ('asphalt', 'Asphalt', 'Asphalt', 'Asphalt material.', true, 60),
  ('asphalt-millings', 'Asphalt Millings', 'Asphalt', 'Reclaimed asphalt millings.', true, 70),
  ('sand', 'Sand', 'Aggregates', 'Sand aggregate.', true, 80),
  ('gravel', 'Gravel', 'Aggregates', 'Gravel aggregate.', true, 90),
  ('limestone', 'Limestone', 'Aggregates', 'Limestone aggregate.', true, 100),
  ('stone', 'Stone', 'Aggregates', 'Stone aggregate.', true, 110),
  ('clean-fill', 'Clean Fill', 'Soil and Fill', 'Clean fill material.', true, 120),
  ('topsoil', 'Topsoil', 'Soil and Fill', 'Topsoil material.', true, 130),
  ('clay', 'Clay', 'Soil and Fill', 'Clay material.', true, 140),
  ('brick', 'Brick', 'Masonry', 'Brick masonry.', true, 150),
  ('cmu-concrete-block', 'CMU or Concrete Block', 'Masonry', 'Concrete masonry units or block.', true, 160),
  ('pavers', 'Pavers', 'Masonry', 'Pavers.', true, 170),
  ('rebar', 'Rebar', 'Metals', 'Reinforcing steel.', true, 180),
  ('structural-steel', 'Structural Steel', 'Metals', 'Structural steel.', true, 190),
  ('aluminum', 'Aluminum', 'Metals', 'Aluminum material.', true, 200),
  ('copper', 'Copper', 'Metals', 'Copper material.', true, 210),
  ('pallets', 'Pallets', 'Wood and Vegetative', 'Reusable or recyclable pallets.', true, 220),
  ('untreated-lumber', 'Untreated Lumber', 'Wood and Vegetative', 'Untreated lumber.', true, 230),
  ('treated-lumber', 'Treated Lumber', 'Wood and Vegetative', 'Treated lumber subject to facility instructions.', true, 240),
  ('brush', 'Brush', 'Wood and Vegetative', 'Brush and vegetative material.', true, 250),
  ('roofing-shingles', 'Roofing Shingles', 'Roofing', 'Roofing shingle material.', true, 260),
  ('glass', 'Glass', 'Packaging and General Recyclables', 'Glass material.', true, 270),
  ('plastic', 'Plastic', 'Packaging and General Recyclables', 'Plastic material.', true, 280),
  ('cardboard', 'Cardboard', 'Packaging and General Recyclables', 'Cardboard material.', true, 290),
  ('mixed-construction-demolition', 'Mixed Construction and Demolition Material', 'Mixed Construction and Demolition', 'Mixed C&D material subject to facility instructions.', true, 300)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- Preserve every existing washout location's operational capability. No activity,
-- owner balance, payment, or driver record is changed.
INSERT INTO location_material_intents (location_id, material_slug, unit, rate_cents, active)
SELECT l.id, 'concrete-washout', 'per_load', 0, true
FROM washout_locations l
WHERE NOT EXISTS (
  SELECT 1
  FROM location_material_intents i
  WHERE i.location_id = l.id AND i.material_slug = 'concrete-washout'
);
