-- Ensure lottery is active by default unless explicitly disabled later.
INSERT INTO feature_flags (flag_key, enabled, description, allowed_roles, created_at, updated_at)
VALUES ('lottery_enabled', TRUE, 'Lottery Program: Allow drivers to earn lottery ticket entries on washout completion. This is enabled by default unless explicitly disabled by an admin or env override.', ARRAY[]::text[], NOW(), NOW())
ON CONFLICT (flag_key)
DO UPDATE SET
  enabled = TRUE,
  description = EXCLUDED.description,
  allowed_roles = EXCLUDED.allowed_roles,
  updated_at = NOW();
