-- CTX-ARCH-003 / CTX-ARCH-005: one persisted operational material context per driver.
-- This migration does not create activities, alter facility acceptance, or affect
-- payments, wallets, settlement, pricing, or provider execution.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS active_material_slug varchar
  REFERENCES materials(slug) ON DELETE SET NULL;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS active_material_updated_at timestamp;

CREATE INDEX IF NOT EXISTS idx_drivers_active_material_slug
  ON drivers(active_material_slug)
  WHERE active_material_slug IS NOT NULL;
