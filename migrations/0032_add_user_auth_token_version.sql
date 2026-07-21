-- Per-user JWT invalidation. Existing active tokens retain version 0 until a
-- specific account is explicitly invalidated by incrementing this value.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_token_version integer NOT NULL DEFAULT 0;
